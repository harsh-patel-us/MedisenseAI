"""
biomarker_service.py — Extract quantitative biomarkers from a lab report
and compute per-biomarker trend lines for the patient dashboard.

Extraction is fire-and-forget: routers/patient.py launches it via
asyncio.create_task right after /patient/analyze returns, so the analysis
response never waits on the LLM round-trip. Trend math is pure-Python and
runs on demand from the GET /patient/{id}/biomarker-trends endpoint.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, LabBiomarker
from prompts import BIOMARKER_EXTRACTION_PROMPT, SAFETY_SYSTEM_MESSAGE
from utils.helpers import extract_json_from_response, generate_id

logger = logging.getLogger(__name__)

_VALID_STATUSES = {"normal", "low", "high", "critical"}


# Biomarkers where a LOWER value is "better" — i.e. moving down toward the
# reference range counts as improvement. Names match the canonical list in
# prompts/biomarker_extraction.txt (case-insensitive lookup).
_LOWER_IS_BETTER = {
    "glucose (fasting)",
    "glucose (random)",
    "hba1c",
    "total cholesterol",
    "ldl cholesterol",
    "triglycerides",
    "creatinine",
    "blood urea",
    "alt",
    "ast",
    "bilirubin (total)",
    "tsh",
}

# Biomarkers where a HIGHER value is "better".
_HIGHER_IS_BETTER = {
    "haemoglobin",
    "hdl cholesterol",
    "vitamin d",
    "vitamin b12",
    "platelet count",
    "rbc count",
}


# ── Extraction ──────────────────────────────────────────────────────────

async def extract_biomarkers(
    raw_text: str,
    analysis_record_id: Optional[str],
    patient_id: str,
    claude_service,
    db,  # noqa: ARG001 — kept for API stability; we open our own session
) -> list[LabBiomarker]:
    """Pull biomarkers from `raw_text` and persist them as LabBiomarker rows.

    Always opens its own AsyncSessionLocal so the function is safe to
    launch from asyncio.create_task. Returns the saved rows; an empty list
    on parse / network failure (we log and swallow).
    """
    if not raw_text or not raw_text.strip():
        return []

    try:
        prompt = BIOMARKER_EXTRACTION_PROMPT.format(raw_text=raw_text)
        raw = await claude_service._chat(SAFETY_SYSTEM_MESSAGE, prompt)
        cleaned = extract_json_from_response(raw)
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning(
                f"Biomarker JSON parse failed: {exc}; raw={raw[:300]}"
            )
            return []
    except Exception as exc:
        logger.warning(f"Biomarker extraction failed: {exc}")
        return []

    if not isinstance(payload, list):
        return []

    saved: list[LabBiomarker] = []
    try:
        async with AsyncSessionLocal() as bg_db:
            for item in payload:
                row = _coerce_to_row(item, patient_id, analysis_record_id)
                if row is None:
                    continue
                bg_db.add(row)
                saved.append(row)
            await bg_db.commit()
            for row in saved:
                await bg_db.refresh(row)
    except Exception as exc:
        logger.error(f"Failed to persist biomarkers for {patient_id}: {exc}")
        return []

    return saved


def _coerce_to_row(
    item: Any,
    patient_id: str,
    analysis_record_id: Optional[str],
) -> Optional[LabBiomarker]:
    """Validate one LLM payload item and turn it into a LabBiomarker.

    Returns None when the item is missing required fields (name + numeric
    value) so the rest of the batch still persists.
    """
    if not isinstance(item, dict):
        return None

    name = str(item.get("biomarker_name") or "").strip()
    if not name:
        return None

    raw_value = item.get("value")
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None

    def _opt_float(key: str) -> Optional[float]:
        raw = item.get(key)
        if raw is None or raw == "":
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    status = str(item.get("status") or "normal").strip().lower()
    if status not in _VALID_STATUSES:
        status = "normal"

    report_date = item.get("report_date")
    if report_date is not None:
        report_date = str(report_date).strip() or None

    return LabBiomarker(
        id=generate_id(),
        patient_id=patient_id,
        analysis_record_id=analysis_record_id,
        biomarker_name=name,
        value=value,
        unit=str(item.get("unit") or "").strip(),
        reference_min=_opt_float("reference_min"),
        reference_max=_opt_float("reference_max"),
        status=status,
        report_date=report_date,
    )


# ── Trends ──────────────────────────────────────────────────────────────

def get_trend_direction(
    biomarker_name: str,
    values: list[float],
    statuses: list[str],
) -> str:
    """Decide if a series is "improving" / "worsening" / "stable" / "new".

    Strategy:
    - 0 readings → "new"
    - 1 reading  → "new"
    - For known biomarkers in the lower-/higher-is-better lists, compare
      the latest two values: a move in the favorable direction by more
      than ~3% is "improving", the opposite is "worsening", else "stable".
    - For unknown biomarkers, use the status flow: if the latest reading
      moved into "normal" → improving; out of "normal" → worsening; same
      status → stable. Critical readings always count as worsening unless
      the previous one was also critical.
    """
    if len(values) < 2:
        return "new"

    latest = values[-1]
    previous = values[-2]
    latest_status = (statuses[-1] if statuses else "normal").lower()
    prev_status = (statuses[-2] if len(statuses) >= 2 else "normal").lower()
    name_key = biomarker_name.strip().lower()

    threshold = 0.03  # 3% movement is the noise floor

    if name_key in _LOWER_IS_BETTER:
        delta = previous - latest  # positive → moved down → improving
        if abs(delta) / max(abs(previous), 1e-9) < threshold:
            return "stable"
        return "improving" if delta > 0 else "worsening"

    if name_key in _HIGHER_IS_BETTER:
        delta = latest - previous  # positive → moved up → improving
        if abs(delta) / max(abs(previous), 1e-9) < threshold:
            return "stable"
        return "improving" if delta > 0 else "worsening"

    # Unknown biomarker — fall back to status transitions.
    if latest_status == "critical" and prev_status != "critical":
        return "worsening"
    if prev_status == "critical" and latest_status != "critical":
        return "improving"
    if latest_status == "normal" and prev_status != "normal":
        return "improving"
    if latest_status != "normal" and prev_status == "normal":
        return "worsening"
    return "stable"


def _percent_change(prev: float, latest: float) -> Optional[float]:
    if prev == 0:
        return None
    return round(((latest - prev) / abs(prev)) * 100, 1)


def _sort_key(row: LabBiomarker) -> tuple[int, str]:
    """Sort biomarkers chronologically; rows without report_date go last
    in their stable creation order."""
    if row.report_date:
        return (0, row.report_date)
    return (1, row.created_at.isoformat() if row.created_at else "")


async def get_patient_biomarker_trends(
    patient_id: str, db: AsyncSession
) -> dict[str, dict[str, Any]]:
    """Return every biomarker the patient has on file, grouped by canonical
    name, with the time-series and trend metadata pre-computed.

    Output shape:
      {
        "HbA1c": {
          "biomarker_name": "HbA1c",
          "unit": "%",
          "reference_min": 4.0,
          "reference_max": 5.6,
          "latest_value": 5.4,
          "previous_value": 6.1,
          "latest_status": "normal",
          "trend": "improving",
          "percent_change": -11.5,
          "history": [ ...readings ascending by date... ]
        }
      }
    """
    result = await db.execute(
        select(LabBiomarker)
        .where(LabBiomarker.patient_id == patient_id)
        .order_by(asc(LabBiomarker.report_date), asc(LabBiomarker.created_at))
    )
    rows = list(result.scalars().all())

    grouped: dict[str, list[LabBiomarker]] = {}
    for row in rows:
        grouped.setdefault(row.biomarker_name, []).append(row)

    trends: dict[str, dict[str, Any]] = {}
    for name, records in grouped.items():
        records.sort(key=_sort_key)
        values = [r.value for r in records]
        statuses = [r.status for r in records]
        history = [
            {
                "id": r.id,
                "biomarker_name": r.biomarker_name,
                "value": r.value,
                "unit": r.unit or "",
                "reference_min": r.reference_min,
                "reference_max": r.reference_max,
                "status": r.status,
                "report_date": r.report_date,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "analysis_record_id": r.analysis_record_id,
            }
            for r in records
        ]

        latest = records[-1]
        previous = records[-2] if len(records) >= 2 else None

        trends[name] = {
            "biomarker_name": name,
            "unit": latest.unit or "",
            "reference_min": latest.reference_min,
            "reference_max": latest.reference_max,
            "latest_value": latest.value,
            "previous_value": previous.value if previous else None,
            "latest_status": latest.status,
            "trend": get_trend_direction(name, values, statuses),
            "percent_change": (
                _percent_change(previous.value, latest.value)
                if previous else None
            ),
            "history": history,
        }

    return trends
