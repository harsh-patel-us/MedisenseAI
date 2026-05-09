"""
intake_service.py — Pre-visit intake form generation, summarization, and persistence.

Flow
----
1. /meet/schedule mints a single-use intake_token via generate_intake_token()
   and persists it on ConsultationSession.
2. Patient opens /intake/{token}, sees INTAKE_FORM_QUESTIONS, submits answers.
3. /meet/intake/{token}/submit fires process_intake_submission() in the
   background — it stores the answers JSON, sets intake_submitted_at, and
   calls generate_intake_summary() to produce a doctor-facing paragraph.
"""
from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, ConsultationSession
from prompts import INTAKE_SUMMARY_PROMPT, SAFETY_SYSTEM_MESSAGE

logger = logging.getLogger(__name__)


# Guided pre-visit questions. Order matters — index is what the submit
# endpoint receives in the answers dict. Edit-friendly: a clinician can
# reword these without touching call sites.
INTAKE_FORM_QUESTIONS: list[str] = [
    "What is the main reason for your visit today? (chief complaint)",
    "How long have you been experiencing this?",
    "On a scale of 1-10, how severe is your discomfort right now?",
    "Have you had this problem before? If yes, when and what was the diagnosis?",
    "Are you currently taking any medications? (include supplements and over-the-counter)",
    "Do you have any known allergies (medications, food, or environmental)?",
    "Do you have any chronic conditions? (diabetes, hypertension, asthma, etc.)",
    "Have you had any recent surgeries or hospitalizations?",
    "Is there anything else you would like the doctor to know before your consultation?",
]


def generate_intake_token() -> str:
    """Cryptographically secure URL-safe token for the public intake link.

    secrets.token_urlsafe(24) yields a 32-character base64url string with
    >190 bits of entropy — well beyond what we need to make brute-force
    enumeration of valid links infeasible.
    """
    return secrets.token_urlsafe(24)


def _format_answers_for_llm(intake_data: dict[str, Any]) -> str:
    """Render the patient's answers as Q/A pairs for the summarizer prompt."""
    answers = intake_data.get("answers") or {}
    name = (intake_data.get("patient_name") or "").strip()

    lines: list[str] = []
    if name:
        lines.append(f"Patient name: {name}")
        lines.append("")

    for idx, question in enumerate(INTAKE_FORM_QUESTIONS):
        # answers may key by string index ("0", "1", ...) or int — accept both.
        ans = answers.get(str(idx))
        if ans is None:
            ans = answers.get(idx)
        ans_text = (str(ans).strip() if ans is not None else "") or "(no answer)"
        lines.append(f"Q{idx + 1}. {question}")
        lines.append(f"A: {ans_text}")
        lines.append("")

    return "\n".join(lines).strip()


async def generate_intake_summary(intake_data: dict[str, Any], claude_service) -> str:
    """Call the LLM with the intake summary prompt + formatted answers.

    `claude_service` is the imported services.claude_service module so this
    function stays decoupled from a specific OpenAI client setup and is easy
    to mock in tests. Returns a clean paragraph; on failure returns a
    minimal fallback so the doctor still sees the raw context.
    """
    formatted = _format_answers_for_llm(intake_data)
    system = f"{SAFETY_SYSTEM_MESSAGE}\n\n{INTAKE_SUMMARY_PROMPT}"

    try:
        client = claude_service.get_client()
        from config import settings as _settings

        response = await client.chat.completions.create(
            model=_settings.medical_model or _settings.ai_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": formatted},
            ],
            temperature=0.2,
            max_tokens=600,
        )
        text = (response.choices[0].message.content or "").strip()
        if not text:
            raise RuntimeError("Empty intake summary from LLM")
        return text
    except Exception as exc:
        logger.error(f"generate_intake_summary failed: {exc}", exc_info=True)
        # Best-effort fallback so the doctor still has *something* to read.
        return (
            "Pre-visit intake responses could not be auto-summarized. "
            "Raw answers are available below.\n\n"
            f"{formatted}\n\nPatient is awaiting consultation."
        )


async def process_intake_submission(
    session_id: str,
    intake_data: dict[str, Any],
    claude_service,
    db: Optional[AsyncSession] = None,
) -> str:
    """Persist the patient's answers and generate the doctor-facing summary.

    When `db` is None (the background-task path) we open our own
    AsyncSessionLocal so we can outlive the originating request session.
    The HTTP submit endpoint already returns 200 to the patient; this
    function fills in `intake_summary` once the LLM call completes.
    """
    own_session = db is None
    session: AsyncSession
    if own_session:
        session = AsyncSessionLocal()
    else:
        session = db  # type: ignore[assignment]

    try:
        row = (
            await session.execute(
                select(ConsultationSession).where(
                    ConsultationSession.id == session_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            logger.warning(f"process_intake_submission: session {session_id} not found")
            return ""

        row.intake_data = json.dumps(intake_data)
        row.intake_submitted_at = datetime.utcnow()
        await session.commit()

        summary = await generate_intake_summary(intake_data, claude_service)

        # Re-fetch in case the session was rolled or the row instance is
        # stale on a long-running background task.
        row = (
            await session.execute(
                select(ConsultationSession).where(
                    ConsultationSession.id == session_id
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            row.intake_summary = summary
            await session.commit()
        return summary
    finally:
        if own_session:
            await session.close()
