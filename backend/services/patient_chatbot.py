"""
patient_chatbot.py — Medisense AI, the patient-side persistent chatbot.

Built on the OpenAI Agents SDK (`openai-agents`). A single `DrMediSense` agent
is given two tools:

    - fetch_patient_history(): pulls the patient's profile, prior report
      findings, and the last 3 session summaries from the database.
    - analyze_attachment(attachment_index): returns a medical summary of an
      image or PDF the patient uploaded with the current message.

The patient's identity, the DB session, and any uploaded attachments are passed
to tools through the Agents SDK run context, so a tool can never reach into
another patient's data.

The model is `gpt-4o-mini` (the request goes through OpenRouter to keep
provider config consistent with the rest of the codebase, but the model name
and behaviour are OpenAI's).
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from agents import (
    Agent,
    OpenAIChatCompletionsModel,
    Runner,
    RunContextWrapper,
    function_tool,
    set_tracing_disabled,
)
from openai import AsyncOpenAI
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import SUPPORTED_LANGUAGES, normalize_language, settings
from prompts import (
    LANGUAGE_INSTRUCTION_TEMPLATE,
    PATIENT_CHATBOT_SUMMARY_PROMPT,
    PATIENT_CHATBOT_SYSTEM_PROMPT,
)
from database import (
    PatientAnalysisRecord,
    PatientChatSession,
    User,
    WearableDataRecord,
)
from services.claude_service import get_client
from services.report_parser import parse_uploaded_file
from services.specialties import get_specialty

logger = logging.getLogger(__name__)

# OpenAI tracing tries api.openai.com — turn it off for OpenRouter setups.
set_tracing_disabled(True)


# ── Run-time context handed to every tool call ───────────────────────────

@dataclass
class ChatAttachment:
    """One file the patient attached on the current turn."""
    filename: str
    mime_type: str            # "image/png", "image/jpeg", "application/pdf"
    data: bytes               # raw decoded bytes
    kind: str                 # "image" | "pdf"


@dataclass
class SessionAttachmentMemo:
    """A file the patient uploaded earlier in this same session.

    `extracted_text` is the OCR / PDF text we already computed once when the
    file was first received — surfacing it to the agent lets it answer
    follow-up questions ("what was the LDL on the report I sent earlier?")
    without re-running OCR.
    """
    filename: str
    mime_type: str
    kind: str
    created_at: str
    extracted_text: str = ""


@dataclass
class ChatContext:
    """Per-request context bag the Agents SDK passes to each tool.

    `db` is None when the agent is invoked outside a request (rare).
    """
    patient_id: str
    db: Optional[AsyncSession]
    attachments: list[ChatAttachment] = field(default_factory=list)
    session_attachments: list[SessionAttachmentMemo] = field(default_factory=list)
    specialty_id: Optional[str] = None
    doctor_name: Optional[str] = None
    # Patient's preferred UI language (e.g. "hi"). When non-"en", the
    # dynamic instructions prepend a CRITICAL instruction telling the LLM
    # to respond in that language. Doctor handoffs are unaffected.
    language: str = "en"


# ── Context builder used both by the system prompt and the history tool ─

async def build_patient_context(
    db: AsyncSession,
    patient_id: str,
) -> tuple[dict[str, str], str, str]:
    """Return (profile, report_summary_text, past_session_summaries_text)."""
    user = (
        await db.execute(select(User).where(User.id == patient_id))
    ).scalar_one_or_none()

    profile: dict[str, str] = {
        "patient_name": user.full_name if user else "Patient",
        "patient_age": "Not on file",
        "patient_gender": "Not on file",
        "patient_blood_group": "Not on file",
    }

    reports_result = await db.execute(
        select(PatientAnalysisRecord)
        .where(PatientAnalysisRecord.patient_id == patient_id)
        .order_by(desc(PatientAnalysisRecord.created_at))
        .limit(10)
    )
    reports = reports_result.scalars().all()

    if not reports:
        report_summary = "No prior reports uploaded yet."
    else:
        lines: list[str] = []
        for r in reports:
            when = r.created_at.strftime("%b %Y") if r.created_at else "unknown date"
            try:
                findings = json.loads(r.findings) if r.findings else []
            except (TypeError, json.JSONDecodeError):
                findings = []
            try:
                specialists = json.loads(r.specialists) if r.specialists else []
            except (TypeError, json.JSONDecodeError):
                specialists = []

            highlights: list[str] = []
            for f in findings:
                if not isinstance(f, dict):
                    continue
                status = (f.get("status") or "").lower()
                name = f.get("test_name") or ""
                value = f.get("patient_value") or ""
                unit = f.get("unit") or ""
                if status in ("high", "low", "abnormal"):
                    highlights.append(
                        f"{name} {value}{(' ' + unit) if unit else ''} ({status})"
                    )
                if len(highlights) >= 4:
                    break

            spec_names = ", ".join(
                s.get("type", "") for s in specialists if isinstance(s, dict)
            )

            line = f"- {when}: " + (r.summary or "Report uploaded").strip()
            if highlights:
                line += " · Key results: " + "; ".join(highlights)
            if spec_names:
                line += f" · Recommended: {spec_names}"
            lines.append(line)
        report_summary = "\n".join(lines)

    sessions_result = await db.execute(
        select(PatientChatSession)
        .where(
            PatientChatSession.patient_id == patient_id,
            PatientChatSession.session_summary.is_not(None),
        )
        .order_by(desc(PatientChatSession.started_at))
        .limit(3)
    )
    past_sessions = sessions_result.scalars().all()

    if not past_sessions:
        past_summary_text = "No prior conversations on file."
    else:
        chunks = []
        for s in past_sessions:
            when = s.started_at.strftime("%b %d, %Y") if s.started_at else "earlier"
            chunks.append(f"- {when}: {s.session_summary}")
        past_summary_text = "\n".join(chunks)

    return profile, report_summary, past_summary_text


async def _load_wearable_block(
    db: AsyncSession, patient_id: str
) -> str:
    """Return the system-prompt block describing the patient's most recent
    wearable / health-app upload, or an empty string when none exists.

    We pull only the latest record to keep the context window predictable —
    the prior records are still browsable via the patient's Wearables tab.
    """
    try:
        result = await db.execute(
            select(WearableDataRecord)
            .where(WearableDataRecord.patient_id == patient_id)
            .order_by(desc(WearableDataRecord.upload_date))
            .limit(1)
        )
        record = result.scalars().first()
    except Exception as exc:
        logger.warning(f"Wearable block load failed: {exc}")
        return ""

    if record is None:
        return ""

    narrative = (record.ai_narrative or "").strip()
    findings: list[str] = []
    if record.key_findings:
        try:
            parsed = json.loads(record.key_findings)
            if isinstance(parsed, list):
                findings = [str(x).strip() for x in parsed if str(x).strip()]
        except (TypeError, json.JSONDecodeError):
            findings = []

    if not narrative and not findings:
        return ""

    range_str = ""
    if record.date_range_start or record.date_range_end:
        start = record.date_range_start or "?"
        end = record.date_range_end or "?"
        range_str = f" (covering {start} → {end})"

    bullets = "\n".join(f"  - {f}" for f in findings) if findings else ""
    parts = [
        "## Patient Wearable/Activity Data",
        f"Source: {record.source}{range_str}",
    ]
    if narrative:
        parts.append(narrative)
    if bullets:
        parts.append("Key findings:")
        parts.append(bullets)
    return "\n".join(parts)


def format_system_prompt(
    profile: dict[str, str],
    report_summary: str,
    past_session_summaries: str,
    specialty_id: Optional[str] = None,
    doctor_name: Optional[str] = None,
) -> str:
    spec = get_specialty(specialty_id)
    if spec:
        specialist_role = spec["system_role"]
        specialist_title = spec["name"]
    else:
        specialist_role = (
            "a board-certified General Physician who handles primary care, "
            "common infections, fevers, and overall wellbeing"
        )
        specialist_title = "General Physician"
    return PATIENT_CHATBOT_SYSTEM_PROMPT.format(
        patient_name=profile.get("patient_name", "Patient"),
        patient_age=profile.get("patient_age", "Not on file"),
        patient_gender=profile.get("patient_gender", "Not on file"),
        patient_blood_group=profile.get("patient_blood_group", "Not on file"),
        patient_report_summaries=report_summary,
        past_session_summaries=past_session_summaries,
        specialist_role=specialist_role,
        specialist_title=specialist_title,
        doctor_name=doctor_name or f"Dr. MediSense {specialist_title}",
    )


# ── Tools exposed to DrMediSense ─────────────────────────────────────────

@function_tool
async def fetch_patient_history(ctx: RunContextWrapper[ChatContext]) -> str:
    """Fetch this patient's profile, known conditions from past report
    summaries, and the last few prior session summaries from the database.

    Use this whenever you need to reference what the patient discussed
    previously, what conditions they have, or what their reports showed."""
    chat_ctx = ctx.context
    if chat_ctx.db is None:
        return "Patient history is not available in this context."
    try:
        profile, reports, past = await build_patient_context(
            chat_ctx.db, chat_ctx.patient_id
        )
    except Exception as exc:
        logger.error(f"fetch_patient_history failed: {exc}", exc_info=True)
        return "I'm unable to load your records right now."

    return (
        f"PATIENT PROFILE\n"
        f"Name: {profile['patient_name']}\n"
        f"Age: {profile['patient_age']}\n"
        f"Gender: {profile['patient_gender']}\n"
        f"Blood group: {profile['patient_blood_group']}\n\n"
        f"REPORT FINDINGS\n{reports}\n\n"
        f"PAST CONVERSATION SUMMARIES\n{past}"
    )


@function_tool
async def analyze_attachment(
    ctx: RunContextWrapper[ChatContext],
    attachment_index: int,
) -> str:
    """Return a medical summary of an uploaded image or PDF.

    Args:
        attachment_index: 0-based index of the attachment to analyse, in the
            order the patient uploaded them on this turn.
    """
    chat_ctx = ctx.context
    attachments = chat_ctx.attachments or []
    if not attachments:
        return "The patient did not attach any files on this turn."
    if attachment_index < 0 or attachment_index >= len(attachments):
        return (
            f"Invalid attachment index {attachment_index}. "
            f"There are {len(attachments)} attachment(s) on this turn."
        )

    att = attachments[attachment_index]
    try:
        text = await parse_uploaded_file(att.data, att.mime_type, att.filename)
    except Exception as exc:
        logger.error(f"analyze_attachment parse failed: {exc}", exc_info=True)
        return f"I couldn't read {att.filename}. Please try uploading it again."

    snippet = text.strip()
    if len(snippet) > 4000:
        snippet = snippet[:4000] + "\n…(truncated)"

    label = "image" if att.kind == "image" else "PDF document"
    return (
        f"Medical summary of attached {label} '{att.filename}':\n\n"
        f"Extracted content:\n{snippet}\n\n"
        f"Use the extracted content above to answer the patient's question. "
        f"If it appears to be a lab report, identify abnormal values. If it is "
        f"a prescription, identify the medications and what conditions they "
        f"typically treat. If it is a clinical photo, describe what is visible. "
        f"Always recommend confirming findings with a licensed clinician."
    )


# ── Agent factory (lazy, single instance) ────────────────────────────────

_dr_medisense: Agent[ChatContext] | None = None


def _build_model() -> OpenAIChatCompletionsModel:
    """gpt-4o-mini bound to OpenRouter (OpenAI-compatible chat-completions)."""
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set — Medisense AI is unavailable.")
    client = AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        default_headers={
            "HTTP-Referer": "https://medisense.ai",
            "X-Title": "MediSense AI Patient Chat",
        },
    )
    return OpenAIChatCompletionsModel(
        model=settings.patient_chatbot_model,
        openai_client=client,
    )


def _dynamic_instructions(
    ctx: RunContextWrapper[ChatContext], _agent: Agent[ChatContext]
) -> str:
    """The system prompt is rebuilt per call so the patient's latest profile,
    report findings, and last 3 session summaries are always injected fresh."""
    base = ctx.context  # ChatContext set per-request
    profile = {
        "patient_name": getattr(base, "_patient_name", "Patient"),
        "patient_age": getattr(base, "_patient_age", "Not on file"),
        "patient_gender": getattr(base, "_patient_gender", "Not on file"),
        "patient_blood_group": getattr(base, "_patient_blood_group", "Not on file"),
    }
    report_summary = getattr(base, "_report_summary", "No prior reports uploaded yet.")
    past_summary = getattr(base, "_past_summaries", "No prior conversations on file.")
    specialty_id = base.specialty_id
    doctor_name = base.doctor_name

    attachments_block = ""
    if base.attachments:
        attachments_block = (
            "\n\nATTACHMENTS ON THIS TURN:\n"
            + "\n".join(
                f"  [{i}] {a.filename} ({a.mime_type})"
                for i, a in enumerate(base.attachments)
            )
            + "\n\nWhen the patient sends an image or PDF, call the "
            "`analyze_attachment` tool with the matching index BEFORE composing "
            "your reply. Reference the attachment by its filename in your answer."
        )

    # Files uploaded EARLIER in this same session — bytes already in DB. We
    # surface the previously-extracted text so the agent can answer questions
    # like "what was on the prescription I sent earlier" without re-uploading.
    session_attachments_block = ""
    if base.session_attachments:
        chunks = []
        for memo in base.session_attachments:
            text = (memo.extracted_text or "").strip()
            if len(text) > 600:
                text = text[:600] + "…(truncated)"
            chunks.append(
                f"- {memo.filename} ({memo.kind}, sent {memo.created_at})"
                + (f"\n  Content: {text}" if text else "")
            )
        session_attachments_block = (
            "\n\nFILES THE PATIENT UPLOADED EARLIER IN THIS SESSION:\n"
            + "\n".join(chunks)
            + "\n\nUse this content directly when the patient asks about a "
            "previously-shared file. Reference it by filename. Do not ask the "
            "patient to re-upload."
        )

    wearable_block = getattr(base, "_wearable_block", "")
    wearable_section = f"\n\n{wearable_block}" if wearable_block else ""

    base_prompt = (
        format_system_prompt(
            profile, report_summary, past_summary, specialty_id, doctor_name
        )
        + wearable_section
        + session_attachments_block
        + attachments_block
    )

    # Prepend the language instruction when the patient picked a non-English
    # language. This lets the same agent code drive every supported locale
    # without rebuilding the prompt template per language.
    code = normalize_language(getattr(base, "language", "en"))
    if code != "en":
        name = SUPPORTED_LANGUAGES.get(code, "English")
        instruction = LANGUAGE_INSTRUCTION_TEMPLATE.format(language_name=name)
        return f"{instruction}\n\n{base_prompt}"
    return base_prompt


def get_dr_medisense() -> Agent[ChatContext]:
    """Lazily construct the Medisense AI agent on first use."""
    global _dr_medisense
    if _dr_medisense is None:
        _dr_medisense = Agent[ChatContext](
            name="DrMediSense",
            instructions=_dynamic_instructions,
            tools=[fetch_patient_history, analyze_attachment],
            model=_build_model(),
        )
    return _dr_medisense


# ── Multimodal message construction ──────────────────────────────────────

def _build_user_input(
    history: list[dict[str, str]],
    user_message: str | None,
    attachments: list[ChatAttachment],
) -> list[dict[str, Any]]:
    """Convert the conversation history + the new user turn into the structured
    input list the Agents SDK passes to chat-completions.

    Images are inlined as `image_url` parts (data URIs); PDFs are referenced by
    filename so the agent knows to call `analyze_attachment` for the contents.
    """
    items: list[dict[str, Any]] = []
    for m in history:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if not content or role not in ("user", "assistant"):
            continue
        items.append({"role": role, "content": content})

    text = (user_message or "").strip()
    if not text and not attachments and not items:
        text = (
            "[New session] Greet the patient by name and, in 2-3 short "
            "sentences, remind them what you remember about their health and "
            "invite them to ask a question."
        )

    if attachments:
        parts: list[dict[str, Any]] = []
        if text:
            parts.append({"type": "input_text", "text": text})
        for i, att in enumerate(attachments):
            if att.kind == "image":
                b64 = base64.b64encode(att.data).decode("ascii")
                parts.append(
                    {
                        "type": "input_image",
                        "image_url": f"data:{att.mime_type};base64,{b64}",
                    }
                )
            else:
                parts.append(
                    {
                        "type": "input_text",
                        "text": (
                            f"[Attachment {i}: {att.filename} (PDF). "
                            f"Call analyze_attachment({i}) to read its contents.]"
                        ),
                    }
                )
        items.append({"role": "user", "content": parts})
    elif text:
        items.append({"role": "user", "content": text})

    return items


# ── Public entrypoints used by the router ───────────────────────────────

async def generate_chat_reply(
    db: AsyncSession,
    patient_id: str,
    history: list[dict[str, str]],
    user_message: str | None,
    attachments: list[ChatAttachment] | None = None,
    session_attachments: list[SessionAttachmentMemo] | None = None,
    specialty_id: Optional[str] = None,
    doctor_name: Optional[str] = None,
    language: str = "en",
) -> str:
    """Run one turn through Medisense AI and return the assistant reply text."""
    attachments = attachments or []
    session_attachments = session_attachments or []

    # Pre-load context so the dynamic instructions function is fast and sync.
    profile, report_summary, past_summaries = await build_patient_context(db, patient_id)
    wearable_block = await _load_wearable_block(db, patient_id)
    ctx = ChatContext(
        patient_id=patient_id,
        db=db,
        attachments=attachments,
        session_attachments=session_attachments,
        specialty_id=specialty_id,
        doctor_name=doctor_name,
        language=normalize_language(language),
    )
    # Stash on the dataclass via private attrs — read by `_dynamic_instructions`.
    ctx._patient_name = profile["patient_name"]            # type: ignore[attr-defined]
    ctx._patient_age = profile["patient_age"]              # type: ignore[attr-defined]
    ctx._patient_gender = profile["patient_gender"]        # type: ignore[attr-defined]
    ctx._patient_blood_group = profile["patient_blood_group"]  # type: ignore[attr-defined]
    ctx._report_summary = report_summary                   # type: ignore[attr-defined]
    ctx._past_summaries = past_summaries                   # type: ignore[attr-defined]
    ctx._wearable_block = wearable_block                   # type: ignore[attr-defined]

    agent = get_dr_medisense()
    messages = _build_user_input(history, user_message, attachments)
    if not messages:
        return "Sorry, I didn't catch that. Could you rephrase?"

    try:
        result = await Runner.run(
            agent,
            input=messages,
            context=ctx,
            max_turns=8,
        )
    except Exception as exc:
        logger.error(f"DrMediSense run failed: {exc}", exc_info=True)
        return (
            "I'm having trouble reaching the medical AI right now. "
            "Please try again in a moment."
        )

    reply = str(result.final_output or "").strip()
    return reply or "Sorry, I didn't catch that. Could you rephrase?"


async def generate_session_summary(transcript_messages: list[dict[str, str]]) -> str:
    """Produce a one-paragraph summary of a session's transcript."""
    if not transcript_messages:
        return ""
    transcript_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in transcript_messages
    )
    prompt = PATIENT_CHATBOT_SUMMARY_PROMPT.format(transcript=transcript_text)
    try:
        client = get_client()
        response = await client.chat.completions.create(
            model=settings.patient_chatbot_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=200,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.error(f"Patient chatbot summary generation failed: {exc}", exc_info=True)
        return ""
