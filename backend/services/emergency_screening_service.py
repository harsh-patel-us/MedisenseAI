"""
emergency_screening_service.py — Pre-screen every chatbot turn for red flags.

Runs ahead of the main Dr. MediSense reply with a hard 3-second budget. If
the patient's message looks like an emergency, the result lets the upstream
handler (a) prepend a CRITICAL instruction to the AI's prompt and (b) attach
a structured `emergency_alert` to the response so the UI can render the red
banner above the assistant's reply.

Failures (network, timeout, parse error) are swallowed and reported as a
no-emergency result — we never want the screen to block normal conversation.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from prompts import EMERGENCY_SCREENING_PROMPT
from utils.helpers import extract_json_from_response

logger = logging.getLogger(__name__)


# ── Region → emergency contacts lookup ──────────────────────────────────
# Static reference data. Lives next to the only consumer rather than in
# config.py because it is not configuration loaded from .env.
EMERGENCY_CONTACTS_BY_REGION: dict[str, dict[str, str]] = {
    "IN": {
        "emergency": "112",
        "ambulance": "108",
        "poison_control": "1800-116-117",
    },
    "US": {"emergency": "911"},
    "UK": {"emergency": "999"},
    "default": {"emergency": "112"},
}


_NEUTRAL_RESULT: dict[str, Any] = {
    "is_emergency": False,
    "severity": "none",
    "detected_symptoms": [],
    "emergency_message": None,
}

_VALID_SEVERITIES = {
    "immediate_911",
    "urgent_er",
    "see_doctor_today",
    "none",
}


def get_emergency_contacts(country_code: str = "IN") -> dict[str, str]:
    """Look up emergency contacts for a country, falling back to default."""
    return EMERGENCY_CONTACTS_BY_REGION.get(
        (country_code or "").upper(),
        EMERGENCY_CONTACTS_BY_REGION["default"],
    )


def _coerce(payload: Any) -> dict[str, Any]:
    """Normalize the LLM's parsed JSON into the response shape we promise."""
    if not isinstance(payload, dict):
        return dict(_NEUTRAL_RESULT)

    is_emergency = bool(payload.get("is_emergency"))
    severity = str(payload.get("severity") or "none").strip().lower()
    if severity not in _VALID_SEVERITIES:
        severity = "none"

    raw_symptoms = payload.get("detected_symptoms") or []
    symptoms: list[str] = []
    if isinstance(raw_symptoms, list):
        for s in raw_symptoms:
            if isinstance(s, str) and s.strip():
                symptoms.append(s.strip())

    msg = payload.get("emergency_message")
    if isinstance(msg, str):
        msg = msg.strip() or None
    else:
        msg = None

    # Cross-field consistency: don't return a "yes emergency" with severity
    # "none" or vice-versa — collapse to the safer interpretation.
    if not is_emergency:
        return {
            "is_emergency": False,
            "severity": "none",
            "detected_symptoms": symptoms,
            "emergency_message": None,
        }
    if severity == "none":
        severity = "see_doctor_today"

    return {
        "is_emergency": True,
        "severity": severity,
        "detected_symptoms": symptoms,
        "emergency_message": msg,
    }


async def screen_for_emergency(message_text: str, claude_service) -> dict[str, Any]:
    """Classify a single patient message for emergency red flags.

    Returns the neutral result on any error (no-op for the upstream caller).
    Token budget is small so the call stays well under the 3 s wall budget
    enforced by the chatbot router.
    """
    if not message_text or not message_text.strip():
        return dict(_NEUTRAL_RESULT)

    try:
        prompt = EMERGENCY_SCREENING_PROMPT.format(message=message_text.strip())
        client = claude_service.get_client()
        from config import settings  # local import to avoid cycles at import time

        response = await client.chat.completions.create(
            model=settings.ai_model,  # base model — speed matters here
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=150,
        )
        raw = response.choices[0].message.content or ""
        cleaned = extract_json_from_response(raw)
        parsed = json.loads(cleaned)
        return _coerce(parsed)
    except Exception as exc:
        logger.warning(f"Emergency screening failed (treating as non-emergency): {exc}")
        return dict(_NEUTRAL_RESULT)
