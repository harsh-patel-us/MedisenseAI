"""
patient_chatbot.py — Persistent patient-side chatbot ("Dr. MediSense").

POST /patient/chat/message               — send a turn (text + optional image/PDF attachments)
GET  /patient/chat/history/{patient_id}  — list this patient's sessions
GET  /patient/chat/session/{session_id}  — fetch one session's full transcript
POST /patient/chat/session/end           — close a session and trigger summary generation

All four endpoints require a valid JWT for the patient AND verify that the
patient_id in the request matches the authenticated user. Every access is
appended to `patient_chat_audit`.
"""
import base64
import binascii
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    Request,
)
from sqlalchemy import asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import (
    AsyncSessionLocal,
    PatientChatAudit,
    PatientChatMessage,
    PatientChatSession,
    User,
    get_db,
)
from models.patient_chatbot_models import (
    ChatAttachmentDTO,
    ChatFileReference,
    EndSessionRequest,
    EndSessionResponse,
    PatientChatHistoryResponse,
    PatientChatMessageDTO,
    PatientChatRequest,
    PatientChatResponse,
    PatientChatSessionMessagesResponse,
    PatientChatSessionSummary,
)
from services.auth_service import get_current_user
from services.patient_chatbot import (
    ChatAttachment,
    generate_chat_reply,
    generate_session_summary,
)
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/patient/chat", tags=["patient-chat"])


ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_PDF_MIMES = {"application/pdf"}


# ── Auth + audit helpers ─────────────────────────────────────────────────

def verify_patient_ownership(target_patient_id: str, user: User) -> None:
    """Raise 403 unless `user` is a patient and owns `target_patient_id`."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient role required.")
    if user.id != target_patient_id:
        raise HTTPException(
            status_code=403,
            detail="You can only access your own chat data.",
        )


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def _audit(
    db: AsyncSession,
    patient_id: str,
    action: str,
    request: Request,
    detail: Optional[str] = None,
) -> None:
    try:
        db.add(
            PatientChatAudit(
                id=generate_id(),
                patient_id=patient_id,
                action=action,
                ip_address=_client_ip(request),
                detail=detail,
            )
        )
        await db.flush()
    except Exception as exc:
        logger.warning(f"Audit write failed for {patient_id}/{action}: {exc}")


def _decode_attachments(
    raw: list[ChatAttachmentDTO],
) -> tuple[list[ChatAttachment], list[ChatFileReference]]:
    """Validate, size-check, and decode every attachment on the turn.

    Returns parallel lists of (runtime attachments handed to the agent,
    persisted file references stored on the message row).
    """
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    runtime: list[ChatAttachment] = []
    refs: list[ChatFileReference] = []

    for att in raw:
        mime = att.mime_type.lower()
        if mime in ALLOWED_IMAGE_MIMES:
            kind = "image"
        elif mime in ALLOWED_PDF_MIMES:
            kind = "pdf"
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported attachment type: {att.mime_type}",
            )

        # Strip a possible data:URI header so the frontend can be lenient.
        b64 = att.data_base64
        if b64.startswith("data:"):
            comma = b64.find(",")
            if comma == -1:
                raise HTTPException(status_code=400, detail="Malformed data URI.")
            b64 = b64[comma + 1 :]

        try:
            raw_bytes = base64.b64decode(b64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid base64 for attachment {att.filename}.",
            )

        if len(raw_bytes) == 0:
            raise HTTPException(
                status_code=400, detail=f"Attachment {att.filename} is empty."
            )
        if len(raw_bytes) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Attachment {att.filename} exceeds the "
                    f"{settings.max_file_size_mb} MB limit."
                ),
            )

        runtime.append(
            ChatAttachment(
                filename=att.filename,
                mime_type=mime,
                data=raw_bytes,
                kind=kind,
            )
        )
        refs.append(
            ChatFileReference(
                filename=att.filename,
                mime_type=mime,
                size_bytes=len(raw_bytes),
                kind=kind,
            )
        )

    return runtime, refs


def _parse_file_refs(blob: Optional[str]) -> list[ChatFileReference]:
    if not blob:
        return []
    try:
        items = json.loads(blob)
    except (TypeError, json.JSONDecodeError):
        return []
    out: list[ChatFileReference] = []
    for item in items if isinstance(items, list) else []:
        try:
            out.append(ChatFileReference(**item))
        except Exception:
            continue
    return out


# ── Background task: regenerate a session summary ────────────────────────

async def _regenerate_session_summary(session_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            session = (
                await db.execute(
                    select(PatientChatSession).where(PatientChatSession.id == session_id)
                )
            ).scalar_one_or_none()
            if session is None:
                return

            msgs = (
                await db.execute(
                    select(PatientChatMessage)
                    .where(PatientChatMessage.session_id == session_id)
                    .order_by(asc(PatientChatMessage.created_at))
                )
            ).scalars().all()

            transcript = [{"role": m.role, "content": m.content} for m in msgs]
            summary = await generate_session_summary(transcript)
            if summary:
                session.session_summary = summary
                session.last_summary_at_count = len(msgs)
                await db.commit()
        except Exception as exc:
            logger.error(
                f"Background summary failed for session {session_id}: {exc}",
                exc_info=True,
            )


# ── POST /patient/chat/message ───────────────────────────────────────────

@router.post("/message", response_model=PatientChatResponse)
async def send_message(
    payload: PatientChatRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PatientChatResponse:
    verify_patient_ownership(payload.patient_id, user)

    runtime_attachments, persisted_refs = _decode_attachments(payload.attachments)

    # Load or create the session.
    session: Optional[PatientChatSession] = None
    is_new_session = False

    if payload.session_id:
        session = (
            await db.execute(
                select(PatientChatSession).where(
                    PatientChatSession.id == payload.session_id,
                    PatientChatSession.patient_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        # Re-open the session transparently if it was previously auto-closed
        # on leave. The patient is allowed to continue any past conversation.
        if session.ended_at is not None:
            session.ended_at = None

    if session is None:
        session = PatientChatSession(
            id=generate_id(),
            patient_id=user.id,
        )
        db.add(session)
        await db.flush()
        is_new_session = True

    # Replay the last 20 messages of THIS session as conversation history.
    history_rows = (
        await db.execute(
            select(PatientChatMessage)
            .where(PatientChatMessage.session_id == session.id)
            .order_by(desc(PatientChatMessage.created_at))
            .limit(20)
        )
    ).scalars().all()
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(history_rows)
    ]

    # Run the DrMediSense agent — context, profile, summaries, attachments
    # are all assembled inside the service.
    reply = await generate_chat_reply(
        db=db,
        patient_id=user.id,
        history=history,
        user_message=payload.message,
        attachments=runtime_attachments,
    )

    # Persist this turn.
    user_text = (payload.message or "").strip()
    now = datetime.utcnow()

    if user_text or persisted_refs:
        # Even when the patient sends only an attachment, store a row so the
        # transcript reflects that something was sent.
        display_text = user_text or "[attachment uploaded]"
        db.add(
            PatientChatMessage(
                id=generate_id(),
                session_id=session.id,
                patient_id=user.id,
                role="user",
                content=display_text,
                created_at=now,
                file_references=(
                    json.dumps([r.model_dump() for r in persisted_refs])
                    if persisted_refs
                    else None
                ),
            )
        )
        # First-turn title: pick the first ~60 chars of the patient's text so
        # the sidebar shows something meaningful immediately, before the
        # background summarizer has run.
        if not session.title:
            seed = user_text or (
                f"Shared {persisted_refs[0].filename}"
                if persisted_refs
                else ""
            )
            seed = " ".join(seed.split())  # collapse whitespace
            if seed:
                session.title = seed[:60] + ("…" if len(seed) > 60 else "")
    db.add(
        PatientChatMessage(
            id=generate_id(),
            session_id=session.id,
            patient_id=user.id,
            role="assistant",
            content=reply,
            created_at=now,
        )
    )
    user_turn_count = 1 if (user_text or persisted_refs) else 0
    session.message_count = (session.message_count or 0) + user_turn_count + 1

    await _audit(
        db,
        user.id,
        action="message",
        request=request,
        detail=json.dumps({"session_id": session.id, "is_new": is_new_session}),
    )
    await db.commit()

    every = max(2, settings.patient_chatbot_summary_every)
    if session.message_count - (session.last_summary_at_count or 0) >= every:
        background.add_task(_regenerate_session_summary, session.id)

    return PatientChatResponse(
        session_id=session.id,
        reply=reply,
        is_new_session=is_new_session,
    )


# ── GET /patient/chat/history/{patient_id} ───────────────────────────────

@router.get("/history/{patient_id}", response_model=PatientChatHistoryResponse)
async def get_history(
    patient_id: str = Path(...),
    request: Request = None,  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PatientChatHistoryResponse:
    verify_patient_ownership(patient_id, user)

    sessions = (
        await db.execute(
            select(PatientChatSession)
            .where(PatientChatSession.patient_id == user.id)
            .order_by(desc(PatientChatSession.started_at))
        )
    ).scalars().all()

    await _audit(db, user.id, action="history_list", request=request)
    await db.commit()

    return PatientChatHistoryResponse(
        patient_id=user.id,
        sessions=[
            PatientChatSessionSummary(
                id=s.id,
                started_at=s.started_at,
                ended_at=s.ended_at,
                title=s.title,
                session_summary=s.session_summary,
                message_count=s.message_count or 0,
            )
            for s in sessions
        ],
    )


# ── GET /patient/chat/session/{session_id} ───────────────────────────────

@router.get("/session/{session_id}", response_model=PatientChatSessionMessagesResponse)
async def get_session(
    session_id: str = Path(...),
    request: Request = None,  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PatientChatSessionMessagesResponse:
    session = (
        await db.execute(
            select(PatientChatSession).where(PatientChatSession.id == session_id)
        )
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    verify_patient_ownership(session.patient_id, user)

    msgs = (
        await db.execute(
            select(PatientChatMessage)
            .where(PatientChatMessage.session_id == session.id)
            .order_by(asc(PatientChatMessage.created_at))
        )
    ).scalars().all()

    await _audit(
        db,
        user.id,
        action="session_view",
        request=request,
        detail=json.dumps({"session_id": session.id}),
    )
    await db.commit()

    return PatientChatSessionMessagesResponse(
        session_id=session.id,
        patient_id=session.patient_id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        session_summary=session.session_summary,
        messages=[
            PatientChatMessageDTO(
                id=m.id,
                role=m.role,  # type: ignore[arg-type]
                content=m.content,
                created_at=m.created_at,
                file_references=_parse_file_refs(m.file_references),
            )
            for m in msgs
        ],
    )


# ── POST /patient/chat/session/end ───────────────────────────────────────

@router.post("/session/end", response_model=EndSessionResponse)
async def end_session(
    payload: EndSessionRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EndSessionResponse:
    verify_patient_ownership(payload.patient_id, user)

    session = (
        await db.execute(
            select(PatientChatSession).where(
                PatientChatSession.id == payload.session_id,
                PatientChatSession.patient_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    summary_will_run = False
    if session.ended_at is None:
        session.ended_at = datetime.utcnow()
        background.add_task(_regenerate_session_summary, session.id)
        summary_will_run = True

    await _audit(
        db,
        user.id,
        action="session_end",
        request=request,
        detail=json.dumps({"session_id": session.id}),
    )
    await db.commit()

    return EndSessionResponse(
        session_id=session.id,
        ended_at=session.ended_at,
        summary_generated=summary_will_run,
    )
