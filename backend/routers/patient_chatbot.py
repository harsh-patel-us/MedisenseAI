"""
patient_chatbot.py — Persistent patient-side chatbot ("Medisense AI").

POST /patient/chat/message                 — send a turn (text + optional image/PDF attachments)
GET  /patient/chat/history/{patient_id}    — list this patient's sessions
GET  /patient/chat/session/{session_id}    — fetch one session's full transcript
POST /patient/chat/session/end             — close a session and trigger summary generation
GET  /patient/chat/attachment/{att_id}     — download the raw bytes of an in-chat attachment

All endpoints require a valid JWT for the patient AND verify that the
patient_id in the request matches the authenticated user. Every access is
appended to `patient_chat_audit`. Uploaded files are persisted in the
`patient_chat_attachments` table and re-injected as memory on subsequent
turns of the same session.
"""
import asyncio
import base64
import binascii
import json
import logging
from datetime import datetime
from typing import Optional
from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    Request,
)
from fastapi.responses import Response
from sqlalchemy import asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import (
    AsyncSessionLocal,
    PatientChatAttachment,
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
    PatientTTSRequest,
    PatientTTSResponse,
    PatientVoiceMessageRequest,
    PatientVoiceMessageResponse,
)
from services.auth_service import get_current_user
from services.patient_chatbot import (
    ChatAttachment,
    SessionAttachmentMemo,
    generate_chat_reply,
    generate_session_summary,
)
from services.report_parser import parse_uploaded_file
from services.sarvam_stt_service import transcribe as sarvam_transcribe
from services.sarvam_tts_service import synthesize as sarvam_synthesize
from utils.helpers import generate_id, safe_filename

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
    persisted file references stored on the message row). The reference
    objects do NOT have an `attachment_id` yet — that is assigned later when
    the bytes are inserted into `patient_chat_attachments`.
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


async def _safe_extract_text(att: ChatAttachment) -> str:
    """Best-effort text extraction so we can recall this file in later turns.
    Returns '' if extraction fails — the bytes are still saved either way."""
    try:
        text = await parse_uploaded_file(att.data, att.mime_type, att.filename)
        return (text or "").strip()
    except Exception as exc:
        logger.warning(
            f"Text extraction failed for chat attachment {att.filename}: {exc}"
        )
        return ""


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

    # Pull attachments uploaded EARLIER in this same session so the agent can
    # answer follow-up questions about them. Cap at 8 most recent to keep the
    # system prompt manageable. Bytes are NOT loaded — only metadata + text.
    prior_atts = (
        await db.execute(
            select(
                PatientChatAttachment.filename,
                PatientChatAttachment.mime_type,
                PatientChatAttachment.kind,
                PatientChatAttachment.created_at,
                PatientChatAttachment.extracted_text,
            )
            .where(PatientChatAttachment.session_id == session.id)
            .order_by(desc(PatientChatAttachment.created_at))
            .limit(8)
        )
    ).all()
    session_memos = [
        SessionAttachmentMemo(
            filename=row.filename,
            mime_type=row.mime_type,
            kind=row.kind,
            created_at=row.created_at.isoformat() if row.created_at else "",
            extracted_text=row.extracted_text or "",
        )
        for row in reversed(prior_atts)
    ]

    # Pre-extract text for the brand-new attachments before the agent runs so
    # both this turn AND the persisted row have the same content. Run all
    # extractions in parallel — each may call the vision model.
    extracted_texts: list[str] = []
    if runtime_attachments:
        extracted_texts = list(
            await asyncio.gather(
                *(_safe_extract_text(att) for att in runtime_attachments)
            )
        )

    # Run the DrMediSense agent — context, profile, summaries, attachments
    # are all assembled inside the service.
    reply = await generate_chat_reply(
        db=db,
        patient_id=user.id,
        history=history,
        user_message=payload.message,
        attachments=runtime_attachments,
        session_attachments=session_memos,
    )

    # Persist this turn.
    user_text = (payload.message or "").strip()
    now = datetime.utcnow()

    user_message_id: Optional[str] = None
    if user_text or persisted_refs:
        # Even when the patient sends only an attachment, store a row so the
        # transcript reflects that something was sent.
        display_text = user_text or "[attachment uploaded]"
        user_message_id = generate_id()

        # Stamp every persisted ref with its attachment id up-front so the
        # JSON we store on the message row is consistent.
        attachment_entities: list[PatientChatAttachment] = []
        for att, ref, text in zip(
            runtime_attachments,
            persisted_refs,
            extracted_texts or [""] * len(runtime_attachments),
        ):
            att_id = generate_id()
            ref.attachment_id = att_id
            attachment_entities.append(
                PatientChatAttachment(
                    id=att_id,
                    session_id=session.id,
                    message_id=user_message_id,
                    patient_id=user.id,
                    filename=att.filename,
                    mime_type=att.mime_type,
                    size_bytes=len(att.data),
                    kind=att.kind,
                    file_data=att.data,
                    extracted_text=text or None,
                )
            )

        # Insert the message row FIRST and flush it so Postgres sees the
        # primary key before the attachments' FK insert lands. SQLAlchemy's
        # unit-of-work doesn't reliably topo-sort sibling INSERTs when the FK
        # column is nullable, so we force the order ourselves.
        db.add(
            PatientChatMessage(
                id=user_message_id,
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
        await db.flush()

        # Attachments can now safely reference message_id.
        for att_entity in attachment_entities:
            db.add(att_entity)
        if attachment_entities:
            await db.flush()
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


# ── POST /patient/chat/voice-message ─────────────────────────────────────


ALLOWED_AUDIO_MIMES = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/m4a",
    "audio/flac",
}


def _decode_audio(req: PatientVoiceMessageRequest) -> bytes:
    mime = (req.mime_type or "audio/webm").lower()
    if mime not in ALLOWED_AUDIO_MIMES:
        raise HTTPException(
            status_code=415, detail=f"Unsupported audio type: {req.mime_type}"
        )
    blob = req.audio_base64
    if blob.startswith("data:"):
        comma = blob.find(",")
        if comma == -1:
            raise HTTPException(status_code=400, detail="Malformed audio data URI.")
        blob = blob[comma + 1 :]
    try:
        raw = base64.b64decode(blob, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 audio.")
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Audio payload is empty.")
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Audio exceeds the {settings.max_file_size_mb} MB limit.",
        )
    return raw


@router.post("/voice-message", response_model=PatientVoiceMessageResponse)
async def voice_message(
    payload: PatientVoiceMessageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PatientVoiceMessageResponse:
    """Transcribe a recorded voice clip via Sarvam (codemix mode) so the
    patient can confirm/edit before it is sent as a chat message. Falls back
    to Gemini Flash transcription when Sarvam isn't configured."""
    verify_patient_ownership(payload.patient_id, user)

    audio_bytes = _decode_audio(payload)
    result = await sarvam_transcribe(
        audio_bytes,
        mime=(payload.mime_type or "audio/webm").lower(),
        mode="codemix",
    )

    await _audit(
        db,
        user.id,
        action="voice_transcribe",
        request=request,
        detail=json.dumps(
            {"bytes": len(audio_bytes), "provider": result.provider}
        ),
    )
    await db.commit()

    return PatientVoiceMessageResponse(
        transcript=result.text,
        language=result.language,
        provider=result.provider,
    )


# ── POST /patient/chat/tts ───────────────────────────────────────────────


@router.post("/tts", response_model=PatientTTSResponse)
async def tts(
    payload: PatientTTSRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PatientTTSResponse:
    """Synthesize an assistant reply with Sarvam bulbul:v3 so the patient
    can hear it back. Returns an empty payload (provider="none") when Sarvam
    isn't configured — the frontend just skips playback in that case."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient role required.")

    result = await sarvam_synthesize(
        payload.text,
        language_code=payload.language_code,
        speaker=payload.speaker,
    )

    await _audit(
        db,
        user.id,
        action="voice_tts",
        request=request,
        detail=json.dumps({"chars": len(payload.text), "provider": result.provider}),
    )
    await db.commit()

    return PatientTTSResponse(
        audio_base64=result.audio_base64,
        mime_type=result.mime_type if result.audio_base64 else "",
        provider=result.provider,
        language=result.language,
        speaker=result.speaker,
    )


# ── GET /patient/chat/attachment/{attachment_id} ─────────────────────────


@router.get("/attachment/{attachment_id}")
async def download_chat_attachment(
    attachment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream the original bytes of an in-chat attachment back to the
    browser. Restricted to the patient who uploaded it."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient role required.")

    att = (
        await db.execute(
            select(PatientChatAttachment).where(
                PatientChatAttachment.id == attachment_id,
                PatientChatAttachment.patient_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if att is None:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    await _audit(
        db,
        user.id,
        action="attachment_download",
        request=request,
        detail=json.dumps({"attachment_id": att.id, "session_id": att.session_id}),
    )
    await db.commit()

    filename = safe_filename(att.filename or f"attachment_{att.id}")
    return Response(
        content=att.file_data,
        media_type=att.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Content-Length": str(len(att.file_data)),
        },
    )
