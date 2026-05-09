"""
followup_service.py — Extract a patient-facing follow-up plan from a SOAP
note, render it as a standalone PDF, and (optionally) push a copy into the
patient's Dr. MediSense chat history.

The doctor side never blocks on this work: extraction runs as a
fire-and-forget asyncio.create_task launched right after the SOAP note is
persisted. The GET endpoint reports `status="pending"` until the row
lands and `status="complete"` once it has.
"""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import desc, select

from database import (
    AsyncSessionLocal,
    ConsultationSession,
    FollowUpPlan,
    PatientChatMessage,
    PatientChatSession,
    User,
)
from prompts import FOLLOWUP_EXTRACTION_PROMPT, SAFETY_SYSTEM_MESSAGE
from utils.helpers import extract_json_from_response, generate_id

logger = logging.getLogger(__name__)


# ── Defaults used when the SOAP Plan is empty / extraction fails ─────────
_DEFAULT_WARNINGS = [
    "Severe chest pain, pressure, or tightness",
    "Sudden weakness, slurred speech, or facial drooping",
    "Heavy or uncontrolled bleeding",
    "Loss of consciousness",
    "Severe allergic reaction (throat swelling, hives with breathing difficulty)",
    "Difficulty breathing at rest",
]

_DEFAULT_INSTRUCTIONS = (
    "Take it easy for the next few days, drink plenty of fluids, and follow "
    "any medication instructions you were given. Watch for the warning signs "
    "below and seek emergency care if any of them appear. Reach out to your "
    "doctor (or to MediSense AI) if anything feels off."
)


def _empty_followup() -> dict[str, Any]:
    """Stable shape used when the Plan section is empty or extraction fails."""
    return {
        "follow_up_date": None,
        "follow_up_reason": "",
        "monitoring_items": [
            "Your symptoms day-to-day",
            "Temperature if you feel feverish",
            "Energy levels and sleep quality",
        ],
        "warning_signs": list(_DEFAULT_WARNINGS),
        "dietary_restrictions": [],
        "activity_restrictions": [],
        "medications_to_start": [],
        "follow_up_specialist": None,
        "patient_instructions": _DEFAULT_INSTRUCTIONS,
    }


def _coerce(payload: Any) -> dict[str, Any]:
    """Normalize the LLM JSON payload into the schema we persist."""
    if not isinstance(payload, dict):
        return _empty_followup()

    def _str_list(key: str) -> list[str]:
        raw = payload.get(key) or []
        if not isinstance(raw, list):
            return []
        return [str(x).strip() for x in raw if isinstance(x, (str, int, float)) and str(x).strip()]

    raw_meds = payload.get("medications_to_start") or []
    meds: list[dict[str, str]] = []
    if isinstance(raw_meds, list):
        for item in raw_meds:
            if isinstance(item, dict):
                drug = str(item.get("drug") or "").strip()
                if not drug:
                    continue
                meds.append({
                    "drug": drug,
                    "dose": str(item.get("dose") or "").strip(),
                    "frequency": str(item.get("frequency") or "").strip(),
                })
            elif isinstance(item, str) and item.strip():
                meds.append({"drug": item.strip(), "dose": "", "frequency": ""})

    follow_up_date = payload.get("follow_up_date")
    if isinstance(follow_up_date, str):
        follow_up_date = follow_up_date.strip() or None
    elif follow_up_date is not None:
        follow_up_date = str(follow_up_date)

    specialist = payload.get("follow_up_specialist")
    if isinstance(specialist, str):
        specialist = specialist.strip() or None
    elif specialist is not None:
        specialist = str(specialist)

    warnings = _str_list("warning_signs")
    # Make sure the universal red flags are present even if the LLM omitted
    # them. De-dup case-insensitively while preserving the original casing.
    seen = {w.lower() for w in warnings}
    for d in _DEFAULT_WARNINGS:
        if d.lower() not in seen:
            warnings.append(d)
            seen.add(d.lower())

    instructions = str(payload.get("patient_instructions") or "").strip()
    if not instructions:
        instructions = _DEFAULT_INSTRUCTIONS

    return {
        "follow_up_date": follow_up_date,
        "follow_up_reason": str(payload.get("follow_up_reason") or "").strip(),
        "monitoring_items": _str_list("monitoring_items"),
        "warning_signs": warnings,
        "dietary_restrictions": _str_list("dietary_restrictions"),
        "activity_restrictions": _str_list("activity_restrictions"),
        "medications_to_start": meds,
        "follow_up_specialist": specialist,
        "patient_instructions": instructions,
    }


def _plan_text_from_soap(soap_note: dict) -> str:
    """Flatten the SOAP Plan section into a single readable string."""
    plan = soap_note.get("plan") or {}
    if isinstance(plan, str):
        return plan.strip()
    if not isinstance(plan, dict):
        return ""
    fields = (
        "investigations_ordered",
        "medications_prescribed",
        "referrals",
        "patient_instructions",
        "follow_up",
    )
    parts: list[str] = []
    for f in fields:
        val = plan.get(f)
        if val and str(val).strip():
            parts.append(f"{f.replace('_', ' ').title()}: {str(val).strip()}")
    return "\n".join(parts)


# ── Extraction ───────────────────────────────────────────────────────────

async def extract_followup_from_soap(
    soap_note: dict,
    session_id: str,
    patient_id: Optional[str],
    claude_service,
    db,  # noqa: ARG001 — kept for API stability; we open our own session
) -> Optional[FollowUpPlan]:
    """Run the follow-up extraction prompt and persist a FollowUpPlan row.

    Always opens its own AsyncSessionLocal so it is safe to launch from
    asyncio.create_task after the request handler's session has closed.
    """
    plan_text = _plan_text_from_soap(soap_note or {})

    if plan_text:
        try:
            prompt = FOLLOWUP_EXTRACTION_PROMPT.format(
                plan_text=plan_text,
                soap_note_json=json.dumps(soap_note or {}, indent=2)[:6000],
            )
            raw = await claude_service._chat(SAFETY_SYSTEM_MESSAGE, prompt)
            cleaned = extract_json_from_response(raw)
            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError as exc:
                logger.warning(
                    f"Follow-up extraction JSON parse failed: {exc}; raw={raw[:300]}"
                )
                parsed = {}
            data = _coerce(parsed)
        except Exception as exc:
            logger.warning(f"Follow-up extraction failed: {exc}", exc_info=True)
            data = _empty_followup()
    else:
        # Spec: still produce a minimal card with generic monitoring advice
        # when the SOAP Plan is missing or empty. Skip the LLM round-trip.
        logger.info(
            f"SOAP Plan empty for session {session_id}; using generic follow-up."
        )
        data = _empty_followup()

    return await _persist_followup(session_id, patient_id, data)


async def _persist_followup(
    session_id: str, patient_id: Optional[str], data: dict[str, Any]
) -> Optional[FollowUpPlan]:
    """Upsert the follow-up row for `session_id`. Returns the saved record."""
    try:
        async with AsyncSessionLocal() as bg_db:
            existing = (
                await bg_db.execute(
                    select(FollowUpPlan).where(
                        FollowUpPlan.consultation_session_id == session_id
                    )
                )
            ).scalar_one_or_none()

            row = existing or FollowUpPlan(
                id=generate_id(),
                consultation_session_id=session_id,
            )
            row.patient_id = patient_id
            row.follow_up_date = data["follow_up_date"]
            row.follow_up_reason = data["follow_up_reason"] or None
            row.monitoring_items = json.dumps(data["monitoring_items"])
            row.warning_signs = json.dumps(data["warning_signs"])
            row.dietary_restrictions = json.dumps(data["dietary_restrictions"])
            row.activity_restrictions = json.dumps(data["activity_restrictions"])
            row.medications_to_start = json.dumps(data["medications_to_start"])
            row.follow_up_specialist = data["follow_up_specialist"]
            row.patient_instructions = data["patient_instructions"]

            if existing is None:
                bg_db.add(row)
            await bg_db.commit()
            await bg_db.refresh(row)
            return row
    except Exception as exc:
        logger.error(f"Failed to persist follow-up plan for {session_id}: {exc}")
        return None


# ── Resolving an optional patient_id from the consultation row ──────────

async def resolve_patient_id(
    session_id: str, db_session
) -> Optional[str]:
    """Best-effort lookup: match `consultation_sessions.patient_email` to a
    user record so the follow-up can be pushed into that patient's chat."""
    row = (
        await db_session.execute(
            select(ConsultationSession).where(ConsultationSession.id == session_id)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    if not row.patient_email:
        return None
    user = (
        await db_session.execute(
            select(User).where(
                User.email == row.patient_email.lower().strip(),
                User.role == "patient",
            )
        )
    ).scalar_one_or_none()
    return user.id if user else None


def parse_followup_record(row: FollowUpPlan) -> dict[str, Any]:
    """Decode the JSON columns into plain Python lists/dicts."""
    def _list(blob: Optional[str]) -> list:
        if not blob:
            return []
        try:
            data = json.loads(blob)
            return data if isinstance(data, list) else []
        except (TypeError, json.JSONDecodeError):
            return []

    return {
        "id": row.id,
        "consultation_session_id": row.consultation_session_id,
        "patient_id": row.patient_id,
        "follow_up_date": row.follow_up_date,
        "follow_up_reason": row.follow_up_reason or "",
        "monitoring_items": [str(x) for x in _list(row.monitoring_items)],
        "warning_signs": [str(x) for x in _list(row.warning_signs)],
        "dietary_restrictions": [str(x) for x in _list(row.dietary_restrictions)],
        "activity_restrictions": [str(x) for x in _list(row.activity_restrictions)],
        "medications_to_start": [
            x for x in _list(row.medications_to_start) if isinstance(x, dict)
        ],
        "follow_up_specialist": row.follow_up_specialist,
        "patient_instructions": row.patient_instructions or "",
        "is_sent_to_patient": bool(row.is_sent_to_patient),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ── PDF rendering ────────────────────────────────────────────────────────

DISCLAIMER = (
    "⚠ IMPORTANT: This follow-up plan is AI-generated for your reference only. "
    "It is NOT a substitute for professional medical advice. Always consult "
    "your doctor before making changes to your treatment. If you experience "
    "any of the warning signs above, call emergency services immediately."
)


def generate_followup_pdf(followup_plan: FollowUpPlan, patient_name: str) -> bytes:
    """Render a patient-facing follow-up card as a single-page PDF.

    Uses ReportLab's Platypus flowables so the layout adapts to long
    text. Style matches services/pdf_export.py (same palette, margins).
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            HRFlowable,
            ListFlowable,
            ListItem,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        logger.error("reportlab not installed. Run: pip install reportlab")
        return b""

    data = parse_followup_record(followup_plan)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    elements: list = []

    title_style = ParagraphStyle(
        "title", parent=styles["Title"],
        textColor=colors.HexColor("#1759B0"), fontSize=22, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "subtitle", parent=styles["Normal"],
        textColor=colors.HexColor("#05AEBB"), fontSize=11, spaceAfter=2,
    )
    section_heading = ParagraphStyle(
        "sh", parent=styles["Heading2"],
        textColor=colors.white, fontSize=12,
        backColor=colors.HexColor("#1759B0"),
        borderPad=6, spaceAfter=6, spaceBefore=10,
    )
    danger_heading = ParagraphStyle(
        "dh", parent=styles["Heading2"],
        textColor=colors.white, fontSize=12,
        backColor=colors.HexColor("#D72E2E"),
        borderPad=6, spaceAfter=6, spaceBefore=10,
    )
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, spaceAfter=4)
    quote_style = ParagraphStyle(
        "quote", parent=body,
        leftIndent=14, fontName="Helvetica-Oblique",
        textColor=colors.HexColor("#0F6E56"),
        spaceBefore=4, spaceAfter=8,
    )

    elements.append(Paragraph("MediSense AI", title_style))
    elements.append(Paragraph("Your Follow-Up Plan", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1759B0")))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(
        Paragraph(
            f"Prepared for: <b>{patient_name}</b>  |  Date: "
            f"{datetime.now().strftime('%d %B %Y')}",
            body,
        )
    )
    elements.append(Spacer(1, 0.4 * cm))

    # ── When to return ─────────────────────────────────────────────────
    elements.append(Paragraph("  📅 When to Return", section_heading))
    when = data["follow_up_date"] or "No specific date — review with your doctor"
    why = data["follow_up_reason"] or "General follow-up to track your progress."
    spec = data["follow_up_specialist"]
    elements.append(Paragraph(f"<b>Next visit:</b> {when}", body))
    elements.append(Paragraph(f"<b>Why:</b> {why}", body))
    if spec:
        elements.append(Paragraph(f"<b>Specialist to see:</b> {spec}", body))

    # ── What to monitor ───────────────────────────────────────────────
    if data["monitoring_items"]:
        elements.append(Paragraph("  🩺 What to Monitor", section_heading))
        elements.append(
            ListFlowable(
                [ListItem(Paragraph(item, body)) for item in data["monitoring_items"]],
                bulletType="bullet",
            )
        )

    # ── Warning signs ─────────────────────────────────────────────────
    elements.append(
        Paragraph("  ⚠ Warning Signs — Go to Emergency If:", danger_heading)
    )
    elements.append(
        ListFlowable(
            [ListItem(Paragraph(item, body)) for item in data["warning_signs"]],
            bulletType="bullet",
        )
    )

    # ── Medications ───────────────────────────────────────────────────
    if data["medications_to_start"]:
        elements.append(Paragraph("  💊 Your Medications", section_heading))
        rows = [["Medication", "Dose", "Frequency"]]
        for m in data["medications_to_start"]:
            rows.append([
                str(m.get("drug", "")),
                str(m.get("dose", "")),
                str(m.get("frequency", "")),
            ])
        tbl = Table(rows, colWidths=[6 * cm, 4 * cm, 5 * cm])
        tbl.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1759B0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F2F4F8"), colors.white]),
                ("PADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ])
        )
        elements.append(tbl)

    # ── Diet & activity ───────────────────────────────────────────────
    if data["dietary_restrictions"] or data["activity_restrictions"]:
        elements.append(Paragraph("  🥗 Diet & Activity", section_heading))
        for label, items in (
            ("Dietary guidance", data["dietary_restrictions"]),
            ("Activity guidance", data["activity_restrictions"]),
        ):
            if not items:
                continue
            elements.append(Paragraph(f"<b>{label}:</b>", body))
            elements.append(
                ListFlowable(
                    [ListItem(Paragraph(it, body)) for it in items],
                    bulletType="bullet",
                )
            )

    # ── Doctor's instructions ─────────────────────────────────────────
    elements.append(Paragraph("  📝 Doctor's Instructions", section_heading))
    elements.append(Paragraph(data["patient_instructions"], quote_style))

    # ── Disclaimer ────────────────────────────────────────────────────
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D72E2E")))
    elements.append(Spacer(1, 0.2 * cm))
    disclaimer_style = ParagraphStyle(
        "disc", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#D72E2E"),
    )
    elements.append(Paragraph(DISCLAIMER, disclaimer_style))

    doc.build(elements)
    return buffer.getvalue()


# ── Push into Dr. MediSense chat ────────────────────────────────────────

def _format_chat_summary(data: dict[str, Any]) -> str:
    """Plain-text summary used as the body of the assistant chat message."""
    lines: list[str] = ["📅 **Your Follow-Up Plan**", ""]

    when = data["follow_up_date"]
    if when:
        lines.append(f"**Next visit:** {when}")
    if data["follow_up_reason"]:
        lines.append(f"**Why:** {data['follow_up_reason']}")
    if data["follow_up_specialist"]:
        lines.append(f"**Specialist to see:** {data['follow_up_specialist']}")
    if any([when, data["follow_up_reason"], data["follow_up_specialist"]]):
        lines.append("")

    if data["monitoring_items"]:
        lines.append("**What to monitor:**")
        for item in data["monitoring_items"]:
            lines.append(f"• {item}")
        lines.append("")

    if data["warning_signs"]:
        lines.append("⚠ **Go to emergency care if any of these appear:**")
        for item in data["warning_signs"]:
            lines.append(f"• {item}")
        lines.append("")

    if data["medications_to_start"]:
        lines.append("**Your medications:**")
        for m in data["medications_to_start"]:
            parts = [m.get("drug", "")]
            if m.get("dose"):
                parts.append(m["dose"])
            if m.get("frequency"):
                parts.append(m["frequency"])
            lines.append("• " + " — ".join(parts))
        lines.append("")

    if data["patient_instructions"]:
        lines.append(data["patient_instructions"])

    return "\n".join(lines).strip()


async def send_followup_to_patient_chat(
    followup_plan: FollowUpPlan,
    patient_id: str,
    db_session,
) -> Optional[PatientChatMessage]:
    """Append a follow-up summary to the patient's most recent chat session.

    Creates a fresh session titled "Follow-Up Plan from Dr. <date>" when
    the patient has none on file. Returns the persisted message row.
    """
    if not patient_id:
        return None

    data = parse_followup_record(followup_plan)
    body = _format_chat_summary(data)

    # Find the patient's most recent chat session, if any.
    session = (
        await db_session.execute(
            select(PatientChatSession)
            .where(PatientChatSession.patient_id == patient_id)
            .order_by(desc(PatientChatSession.started_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    if session is None:
        # No chat history yet — start a brand-new session for this drop.
        title = (
            f"Follow-Up Plan from Dr. "
            f"{datetime.utcnow().strftime('%d %b %Y')}"
        )
        session = PatientChatSession(
            id=generate_id(),
            patient_id=patient_id,
            title=title,
            session_mode="ai",
            doctor_joined=False,
            message_count=0,
        )
        db_session.add(session)
        await db_session.flush()

    msg = PatientChatMessage(
        id=generate_id(),
        session_id=session.id,
        patient_id=patient_id,
        role="assistant",
        content=body,
        sender_type="ai",
        sender_id=None,
    )
    db_session.add(msg)
    session.message_count = (session.message_count or 0) + 1

    # Mark the follow-up so the doctor UI can disable the button.
    # Integer column under the hood — bind 1, not Python True.
    followup_plan.is_sent_to_patient = 1
    db_session.add(followup_plan)

    await db_session.commit()
    await db_session.refresh(msg)
    return msg
