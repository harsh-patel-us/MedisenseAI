"""
medication_service.py — Medication extraction, interaction checks, and storage.

Three data sources feed the patient's medication ledger:
  1. Extraction from an uploaded prescription / lab report (`/patient/analyze`)
  2. Extraction from a chatbot mention (`/patient/chat/message`)
  3. Manual entry from the medication tracker UI

For interaction checking we go to OpenFDA first — its `/drug/label.json`
endpoint exposes the FDA-approved label text, which sometimes mentions
interactions in narrative form. We pull each drug's label, scan the
`drug_interactions` field for the names of the other drugs in the patient's
list, and return the hits we find. Severity is inferred from keyword cues
in the surrounding sentence.

When OpenFDA returns nothing (empty results, network failure, no narrative
mention) we fall back to the AI prompt in `prompts/medication_interaction.txt`
which is the authoritative path for this feature in practice.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Iterable

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import MedicationInteractionAlert, PatientMedication
from prompts import (
    ADHERENCE_REMINDER_PROMPT,
    MEDICATION_EXTRACTION_PROMPT,
    MEDICATION_INTERACTION_PROMPT,
    SAFETY_SYSTEM_MESSAGE,
)
from utils.helpers import extract_json_from_response, generate_id

logger = logging.getLogger(__name__)

OPENFDA_BASE = "https://api.fda.gov/drug"
OPENFDA_TIMEOUT = 5.0
_VALID_SEVERITIES = {"contraindicated", "major", "moderate", "minor"}


# ── AI helpers ────────────────────────────────────────────────────────────

async def extract_medications_from_text(text: str, claude_service) -> list[dict]:
    """Ask the LLM to pull medications out of free-form text.

    Returns a list of {drug_name, dosage, frequency, notes}. Empty on any
    parse or API failure — we never want extraction to break the upstream
    flow (chat / analyze).
    """
    if not text or not text.strip():
        return []
    try:
        prompt = MEDICATION_EXTRACTION_PROMPT.format(text=text.strip())
        raw = await claude_service._chat(SAFETY_SYSTEM_MESSAGE, prompt)
        cleaned = extract_json_from_response(raw)
        data = json.loads(cleaned)
        if not isinstance(data, list):
            return []
        out: list[dict] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            name = (item.get("drug_name") or "").strip()
            if not name:
                continue
            out.append({
                "drug_name": name,
                "dosage": (item.get("dosage") or "").strip(),
                "frequency": (item.get("frequency") or "").strip(),
                "notes": (item.get("notes") or "").strip(),
            })
        return out
    except Exception as exc:
        logger.warning(f"Medication extraction failed: {exc}")
        return []


async def _ai_interaction_check(drug_list: list[str], claude_service) -> list[dict]:
    """Fallback path: ask the LLM directly for pairwise interactions."""
    if len(drug_list) < 2:
        return []
    try:
        prompt = MEDICATION_INTERACTION_PROMPT.format(
            medications="\n".join(f"- {d}" for d in drug_list)
        )
        raw = await claude_service._chat(SAFETY_SYSTEM_MESSAGE, prompt)
        cleaned = extract_json_from_response(raw)
        data = json.loads(cleaned)
        if not isinstance(data, list):
            return []
        out: list[dict] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            a = (item.get("drug_a") or "").strip()
            b = (item.get("drug_b") or "").strip()
            sev = (item.get("severity") or "").strip().lower()
            if not a or not b or sev not in _VALID_SEVERITIES:
                continue
            out.append({
                "drug_a": a,
                "drug_b": b,
                "severity": sev,
                "description": (item.get("description") or "").strip(),
                "source": "ai",
            })
        return out
    except Exception as exc:
        logger.warning(f"AI interaction check failed: {exc}")
        return []


# ── OpenFDA helpers ──────────────────────────────────────────────────────

def _infer_severity(snippet: str) -> str:
    """Crude severity guess from interaction-narrative wording."""
    s = snippet.lower()
    if "contraindicated" in s or "do not co-administer" in s or "must not" in s:
        return "contraindicated"
    if "avoid" in s or "serious" in s or "fatal" in s or "life-threatening" in s:
        return "major"
    if "monitor" in s or "caution" in s or "may increase" in s or "may decrease" in s:
        return "moderate"
    return "minor"


def _extract_relevant_sentence(narrative: str, other_drug: str) -> str:
    """Find the sentence in `narrative` that mentions `other_drug`."""
    pattern = re.compile(r"[^.!?]*\b" + re.escape(other_drug) + r"\b[^.!?]*[.!?]", re.IGNORECASE)
    m = pattern.search(narrative)
    if m:
        return m.group(0).strip()
    # Fallback: a small window around the first occurrence.
    idx = narrative.lower().find(other_drug.lower())
    if idx == -1:
        return ""
    start = max(0, idx - 120)
    end = min(len(narrative), idx + 240)
    return narrative[start:end].strip()


async def _fetch_label_interactions(client: httpx.AsyncClient, drug: str) -> str:
    """Return the `drug_interactions` narrative for one drug, or ''."""
    try:
        resp = await client.get(
            f"{OPENFDA_BASE}/label.json",
            params={
                "search": (
                    f'openfda.generic_name:"{drug}" '
                    f'OR openfda.brand_name:"{drug}"'
                ),
                "limit": 1,
            },
        )
        if resp.status_code != 200:
            return ""
        payload = resp.json()
        results = payload.get("results") or []
        if not results:
            return ""
        narrative_chunks = results[0].get("drug_interactions") or []
        if isinstance(narrative_chunks, list):
            return " ".join(str(c) for c in narrative_chunks)
        return str(narrative_chunks)
    except Exception as exc:
        logger.debug(f"OpenFDA label fetch failed for {drug}: {exc}")
        return ""


async def check_interactions_openfda(drug_list: list[str]) -> list[dict]:
    """Best-effort pairwise interaction scan via the OpenFDA label endpoint.

    Returns a list of {drug_a, drug_b, severity, description}. Empty list on
    any error — the caller is expected to fall back to the AI prompt.
    """
    drugs = [d.strip() for d in drug_list if d and d.strip()]
    if len(drugs) < 2:
        return []

    pairs: list[dict] = []
    seen: set[tuple[str, str]] = set()

    try:
        async with httpx.AsyncClient(timeout=OPENFDA_TIMEOUT) as client:
            narratives: dict[str, str] = {}
            for d in drugs:
                narratives[d] = await _fetch_label_interactions(client, d)

            for i, a in enumerate(drugs):
                narrative = narratives.get(a, "")
                if not narrative:
                    continue
                for b in drugs[i + 1:]:
                    if b.lower() not in narrative.lower():
                        continue
                    key = tuple(sorted((a.lower(), b.lower())))
                    if key in seen:
                        continue
                    seen.add(key)
                    sentence = _extract_relevant_sentence(narrative, b)
                    pairs.append({
                        "drug_a": a,
                        "drug_b": b,
                        "severity": _infer_severity(sentence),
                        "description": sentence or (
                            f"FDA label for {a} mentions {b} as an interaction."
                        ),
                        "source": "openfda",
                    })
    except Exception as exc:
        logger.warning(f"OpenFDA interaction scan failed: {exc}")
        return []

    return pairs


# ── Persistence ──────────────────────────────────────────────────────────

async def save_medications(
    patient_id: str,
    medications: list[dict],
    source: str,
    db_session: AsyncSession,
) -> list[PatientMedication]:
    """Upsert medications onto PatientMedication, keyed by (patient_id, drug_name).

    Existing rows have their dosage/frequency/notes refreshed and are
    re-activated; new rows are inserted with the given source.
    """
    if not medications:
        return []

    saved: list[PatientMedication] = []
    for med in medications:
        name = (med.get("drug_name") or "").strip()
        if not name:
            continue

        result = await db_session.execute(
            select(PatientMedication).where(
                PatientMedication.patient_id == patient_id,
                PatientMedication.drug_name == name,
            )
        )
        existing = result.scalar_one_or_none()

        dosage = (med.get("dosage") or "").strip() or None
        frequency = (med.get("frequency") or "").strip() or None
        notes = (med.get("notes") or "").strip() or None

        if existing is not None:
            if dosage:
                existing.dosage = dosage
            if frequency:
                existing.frequency = frequency
            if notes:
                existing.notes = notes
            existing.is_active = True
            saved.append(existing)
        else:
            row = PatientMedication(
                id=generate_id(),
                patient_id=patient_id,
                drug_name=name,
                dosage=dosage,
                frequency=frequency,
                prescribed_by=(med.get("prescribed_by") or None),
                start_date=(med.get("start_date") or None),
                is_active=True,
                source=source,
                notes=notes,
            )
            db_session.add(row)
            saved.append(row)

    await db_session.commit()
    for row in saved:
        await db_session.refresh(row)
    return saved


async def get_patient_medications(
    patient_id: str, db_session: AsyncSession
) -> list[PatientMedication]:
    """All currently-active medications for a patient, newest first."""
    # is_active is `Mapped[bool] = mapped_column(Integer, ...)` for
    # cross-DB compatibility — compare against 1, not Python True, so
    # asyncpg/Postgres doesn't reject `int_col = true`.
    result = await db_session.execute(
        select(PatientMedication)
        .where(
            PatientMedication.patient_id == patient_id,
            PatientMedication.is_active == 1,
        )
        .order_by(PatientMedication.created_at.desc())
    )
    return list(result.scalars().all())


async def _existing_alert_keys(
    patient_id: str, db_session: AsyncSession
) -> set[tuple[str, str]]:
    """Return the (drug_a_lower, drug_b_lower) tuples we've already alerted on."""
    result = await db_session.execute(
        select(MedicationInteractionAlert).where(
            MedicationInteractionAlert.patient_id == patient_id,
        )
    )
    keys: set[tuple[str, str]] = set()
    for row in result.scalars().all():
        keys.add(tuple(sorted((row.drug_a.lower(), row.drug_b.lower()))))
    return keys


async def run_interaction_check(
    patient_id: str,
    db_session: AsyncSession,
    claude_service,
) -> list[MedicationInteractionAlert]:
    """Refresh interaction alerts for the patient and return the live set.

    Strategy: pull the patient's active drug list, hit OpenFDA, and if that
    yields no usable pairs fall back to the AI prompt. New (drug_a, drug_b)
    pairs we haven't seen before are persisted; previously-dismissed alerts
    are not resurrected.
    """
    meds = await get_patient_medications(patient_id, db_session)
    drug_names = [m.drug_name for m in meds]

    pairs: list[dict] = []
    if len(drug_names) >= 2:
        pairs = await check_interactions_openfda(drug_names)
        if not pairs:
            pairs = await _ai_interaction_check(drug_names, claude_service)

    if pairs:
        existing_keys = await _existing_alert_keys(patient_id, db_session)
        for p in pairs:
            key = tuple(sorted((p["drug_a"].lower(), p["drug_b"].lower())))
            if key in existing_keys:
                continue
            db_session.add(
                MedicationInteractionAlert(
                    id=generate_id(),
                    patient_id=patient_id,
                    drug_a=p["drug_a"],
                    drug_b=p["drug_b"],
                    severity=p["severity"],
                    description=p.get("description") or "",
                    source=p.get("source", "openfda"),
                    is_dismissed=0,
                )
            )
            existing_keys.add(key)
        await db_session.commit()

    # See comment above — is_dismissed is INTEGER under the hood, so the
    # comparison must be against 0, not Python's False.
    result = await db_session.execute(
        select(MedicationInteractionAlert)
        .where(
            MedicationInteractionAlert.patient_id == patient_id,
            MedicationInteractionAlert.is_dismissed == 0,
        )
        .order_by(MedicationInteractionAlert.created_at.desc())
    )
    return list(result.scalars().all())


# ── Adherence reminder ────────────────────────────────────────────────────

async def generate_adherence_reminder(
    first_name: str,
    medications: Iterable[PatientMedication],
    claude_service,
) -> str:
    """Render a friendly adherence message for the patient's current meds."""
    meds_block_lines: list[str] = []
    for m in medications:
        parts = [m.drug_name]
        if m.dosage:
            parts.append(m.dosage)
        if m.frequency:
            parts.append(m.frequency)
        meds_block_lines.append("- " + " — ".join(parts))
    meds_block = "\n".join(meds_block_lines) if meds_block_lines else "(none on file)"

    prompt = ADHERENCE_REMINDER_PROMPT.format(
        first_name=first_name or "",
        medications=meds_block,
    )
    try:
        return (await claude_service._chat(SAFETY_SYSTEM_MESSAGE, prompt)).strip()
    except Exception as exc:
        logger.warning(f"Adherence reminder generation failed: {exc}")
        return (
            f"Hi {first_name or 'there'}, here's your current medication list:\n"
            f"{meds_block}\n\n"
            "Try to take each one at the same time every day. Ask MediSense AI "
            "any time if you have questions."
        )
