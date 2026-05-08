"""
soap_audit_service.py — Second-opinion review of a generated SOAP note.

Runs as a fire-and-forget asyncio.create_task after the SOAP note is
persisted in /doctor/generate-note. Doctors keep editing while the audit
is in flight; the result lands on `consultation_sessions.soap_audit` and
is fetched on demand by GET /doctor/sessions/{id}/audit.

Failure path: the raw error JSON is written to `soap_audit` so the GET
endpoint can return a graceful "audit unavailable" payload to the UI
instead of leaving the panel polling forever.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy import select

from config import settings
from database import AsyncSessionLocal, ConsultationSession
from prompts import SAFETY_SYSTEM_MESSAGE, SOAP_AUDIT_PROMPT
from utils.helpers import extract_json_from_response

logger = logging.getLogger(__name__)

_TRANSCRIPT_LIMIT = 6000  # chars; keeps the prompt focused without dropping context


def _truncate(text: str, limit: int = _TRANSCRIPT_LIMIT) -> str:
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n…[truncated for audit prompt]"


def _coerce(payload: Any) -> dict[str, Any]:
    """Normalize the LLM payload into the shape the API contract promises."""
    if not isinstance(payload, dict):
        return _failure_payload("Audit produced no usable JSON output.")

    quality = str(payload.get("overall_quality") or "").strip().lower()
    if quality not in {"excellent", "good", "adequate", "needs_improvement"}:
        quality = "adequate"

    try:
        score = int(payload.get("overall_score") or 0)
    except (TypeError, ValueError):
        score = 0
    score = max(1, min(10, score)) if score else 0

    raw_issues = payload.get("critical_issues") or []
    issues: list[dict[str, str]] = []
    if isinstance(raw_issues, list):
        for item in raw_issues:
            if not isinstance(item, dict):
                continue
            issue_text = str(item.get("issue") or "").strip()
            if not issue_text:
                continue
            priority = str(item.get("priority") or "medium").strip().lower()
            if priority not in {"high", "medium", "low"}:
                priority = "medium"
            issues.append({
                "issue": issue_text,
                "recommendation": str(item.get("recommendation") or "").strip(),
                "priority": priority,
            })

    def _str_list(key: str) -> list[str]:
        raw = payload.get(key) or []
        return [
            str(x).strip()
            for x in (raw if isinstance(raw, list) else [])
            if isinstance(x, (str, int, float)) and str(x).strip()
        ]

    return {
        "status": "complete",
        "overall_quality": quality,
        "overall_score": score,
        "critical_issues": issues,
        "missing_differentials": _str_list("missing_differentials"),
        "documentation_gaps": _str_list("documentation_gaps"),
        "positive_findings": _str_list("positive_findings"),
        "reviewer_summary": str(payload.get("reviewer_summary") or "").strip(),
    }


def _failure_payload(reason: str) -> dict[str, Any]:
    """Stable shape the GET endpoint can return as `complete` with empty body."""
    return {
        "status": "failed",
        "overall_quality": "",
        "overall_score": 0,
        "critical_issues": [],
        "missing_differentials": [],
        "documentation_gaps": [],
        "positive_findings": [],
        "reviewer_summary": (
            "Automated audit could not be generated for this note — "
            f"please review manually. ({reason})"
        ),
    }


async def audit_soap_note(
    soap_note: dict,
    transcript: str,
    entities: dict,
    session_id: str,
    claude_service,
    db,  # noqa: ARG001 — kept for API stability; we open our own session
) -> dict[str, Any]:
    """Generate an audit for one SOAP note and persist it on the session row.

    Always opens a fresh DB session via AsyncSessionLocal so the function is
    safe to launch with asyncio.create_task from a request handler whose
    own session has already closed by the time the audit returns.
    """
    try:
        prompt = SOAP_AUDIT_PROMPT.format(
            soap_note_json=json.dumps(soap_note, indent=2)[:8000],
            entities_json=json.dumps(entities or {}, indent=2)[:2000],
            transcript_excerpt=_truncate(transcript or ""),
        )
        # Use the higher-quality medical model for audit content.
        raw = await claude_service._chat(
            SAFETY_SYSTEM_MESSAGE, prompt, model=settings.medical_model
        )
        cleaned = extract_json_from_response(raw)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning(f"SOAP audit JSON parse failed: {exc}; raw={raw[:300]}")
            result = _failure_payload("invalid JSON from reviewer")
        else:
            result = _coerce(parsed)
    except Exception as exc:
        logger.warning(f"SOAP audit generation failed: {exc}", exc_info=True)
        result = _failure_payload(str(exc) or "unknown error")

    await _persist_audit(session_id, result)
    return result


async def _persist_audit(session_id: str, result: dict[str, Any]) -> None:
    """Write the audit JSON onto consultation_sessions.soap_audit."""
    try:
        async with AsyncSessionLocal() as bg_db:
            row = (
                await bg_db.execute(
                    select(ConsultationSession).where(
                        ConsultationSession.id == session_id
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                logger.warning(f"SOAP audit produced for unknown session {session_id}")
                return
            row.soap_audit = json.dumps(result)
            await bg_db.commit()
    except Exception as exc:
        logger.error(f"Failed to persist SOAP audit for {session_id}: {exc}")


def parse_persisted_audit(blob: Optional[str]) -> Optional[dict[str, Any]]:
    """Parse the JSON blob from consultation_sessions.soap_audit, or None."""
    if not blob:
        return None
    try:
        data = json.loads(blob)
        if not isinstance(data, dict):
            return None
        return data
    except (TypeError, json.JSONDecodeError):
        return None
