"""
doctor.py — Doctor-side API router
WS  /doctor/stream-audio   → Whisper STT + diarization, streams transcript segments
POST /doctor/generate-note → NER + AI SOAP note generation
POST /doctor/export-pdf    → SOAP note PDF
GET  /doctor/sessions      → Past consultation sessions
"""
import asyncio
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from config import settings
from models.doctor_models import (
    AuditIssue, SoapAuditResponse,
    FollowUpMedication, FollowUpPlanResponse,
    TranscriptSegment, UploadAudioResponse,
    DoctorChatActiveSession, DoctorChatListItem, DoctorChatListResponse,
    DoctorChatMessageRequest,
    GenerateNoteRequest, GenerateNoteResponse,
    MedicalEntities, SoapNote, ExportPdfRequest, SessionSummary,
)
from models.patient_chatbot_models import (
    PatientChatSessionMessagesResponse, PatientChatMessageDTO, ChatFileReference,
)

from services import claude_service as claude_service_module
from services.transcription import transcribe_audio
from services.diarization import diarize
from services.ner import extract_medical_entities
from services.claude_service import generate_soap_note
from services.chat_ws import chat_manager
from services.pdf_export import generate_soap_pdf
from services.auth_service import require_role
from services.followup_service import (
    extract_followup_from_soap,
    generate_followup_pdf,
    parse_followup_record,
    resolve_patient_id,
    send_followup_to_patient_chat,
)
from services.soap_audit_service import audit_soap_note, parse_persisted_audit
from services.specialties import specialty_name
from utils.helpers import generate_id, format_transcript_for_prompt, validate_file_size
from utils.storage import save_soap_pdf
from database import get_db, ConsultationSession, DoctorChatSession, FollowUpPlan, User, PatientChatSession, PatientChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/doctor", tags=["doctor"])

# In-memory audio buffer per WebSocket connection
_audio_buffers: dict[str, bytes] = {}


@router.websocket("/stream-audio")
async def stream_audio(websocket: WebSocket):
    """
    WebSocket endpoint — receives binary audio chunks from the browser,
    accumulates them, runs Whisper STT + diarization, and pushes
    labeled transcript segments back in real time.
    """
    await websocket.accept()
    session_id = generate_id()
    _audio_buffers[session_id] = b""
    accumulated_text = []

    await websocket.send_json({"type": "session_start", "session_id": session_id})
    logger.info(f"Doctor WebSocket opened: session={session_id}")

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data and data["bytes"]:
                # Accumulate audio chunks
                _audio_buffers[session_id] += data["bytes"]

                # Transcribe every ~5 seconds of audio (approx 80KB for 16kHz mono)
                if len(_audio_buffers[session_id]) >= 80_000:
                    chunk = _audio_buffers[session_id]
                    _audio_buffers[session_id] = b""  # Reset buffer

                    try:
                        result = await transcribe_audio(chunk, settings.whisper_model)
                        segments = result.get("segments", [])
                        labeled = diarize(chunk, segments)

                        for seg in labeled:
                            accumulated_text.append(seg)
                            await websocket.send_json({
                                "type": "transcript_segment",
                                "data": seg,
                            })
                    except Exception as e:
                        logger.error(f"Transcription error: {e}")
                        await websocket.send_json({"type": "error", "message": str(e)})

            elif "text" in data:
                msg = json.loads(data["text"])

                if msg.get("action") == "stop":
                    # Process any remaining audio
                    remaining = _audio_buffers.pop(session_id, b"")
                    if remaining:
                        try:
                            result = await transcribe_audio(remaining, settings.whisper_model)
                            segments = result.get("segments", [])
                            labeled = diarize(remaining, segments)
                            for seg in labeled:
                                accumulated_text.append(seg)
                                await websocket.send_json({"type": "transcript_segment", "data": seg})
                        except Exception as e:
                            logger.error(f"Final transcription error: {e}")

                    await websocket.send_json({
                        "type": "session_complete",
                        "session_id": session_id,
                        "total_segments": len(accumulated_text),
                    })
                    break

    except WebSocketDisconnect:
        logger.info(f"Doctor WebSocket disconnected: session={session_id}")
        _audio_buffers.pop(session_id, None)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close(code=1011, reason=str(e))
        _audio_buffers.pop(session_id, None)


_ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
    "audio/webm", "audio/ogg", "audio/flac", "audio/m4a", "audio/mp4",
    "audio/x-m4a",
}
_AUDIO_EXT_TO_MIME = {
    "mp3": "audio/mpeg", "wav": "audio/wav", "webm": "audio/webm",
    "ogg": "audio/ogg", "flac": "audio/flac", "m4a": "audio/mp4",
}


def _segments_from_transcript_text(text: str) -> list[dict]:
    """Split a multi-line transcript into alternating DOCTOR/PATIENT segments.

    The Gemini transcription prompt asks for one speaker turn per line, so we
    treat each non-empty line as a separate turn, alternating speakers starting
    with DOCTOR. If the model returns a single block, we fall back to a single
    DOCTOR-labeled segment so SOAP generation still has something to work with.
    """
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return []

    segments: list[dict] = []
    current = "DOCTOR"
    for idx, line in enumerate(lines):
        segments.append({
            "speaker": current,
            "text": line,
            "start": float(idx),
            "end": float(idx + 1),
            "confidence": 0.8,
        })
        current = "PATIENT" if current == "DOCTOR" else "DOCTOR"
    return segments


@router.post("/upload-audio", response_model=UploadAudioResponse)
async def upload_audio(
    file: UploadFile = File(...),
    _user: User = Depends(require_role("doctor")),
):
    """Accept an audio file, transcribe it via Gemini, and return alternating
    DOCTOR/PATIENT segments plus a fresh session id. The doctor's UI then
    forwards these segments to /doctor/generate-note for SOAP generation."""
    content = await file.read()
    if not validate_file_size(len(content), settings.max_file_size_mb):
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {settings.max_file_size_mb} MB.",
        )

    content_type = (file.content_type or "").lower()
    filename = file.filename or "audio"
    if content_type not in _ALLOWED_AUDIO_TYPES:
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        guessed = _AUDIO_EXT_TO_MIME.get(ext)
        if guessed is None:
            raise HTTPException(
                status_code=415,
                detail=(
                    "Unsupported audio type. Allowed: mp3, wav, webm, ogg, flac, m4a."
                ),
            )

    try:
        result = await transcribe_audio(content, settings.whisper_model)
    except Exception as exc:
        logger.error(f"Audio transcription failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}")

    raw_text = (result or {}).get("text", "").strip()
    if not raw_text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No speech could be transcribed from this audio file. "
                "Please upload a clearer recording."
            ),
        )

    segment_dicts = _segments_from_transcript_text(raw_text)
    segments = [TranscriptSegment(**seg) for seg in segment_dicts]
    session_id = generate_id()

    return UploadAudioResponse(
        session_id=session_id,
        transcript=segments,
        raw_text=raw_text,
    )


@router.post("/generate-note", response_model=GenerateNoteResponse)
async def generate_note(
    request: GenerateNoteRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """
    Given a labeled transcript, runs:
    1. scispaCy / regex NER to extract medical entities
    2. AI call to generate structured SOAP note
    Saves session to DB and returns the SOAP note + entities.
    """
    if not request.transcript:
        raise HTTPException(status_code=400, detail="Transcript is empty.")

    # Convert transcript segments to readable string for prompts
    transcript_dicts = [seg.model_dump() for seg in request.transcript]
    labeled_text = format_transcript_for_prompt(transcript_dicts)
    full_text = " ".join(seg.text for seg in request.transcript)

    # NER extraction
    try:
        entities_raw = extract_medical_entities(full_text)
    except Exception as e:
        logger.warning(f"NER failed: {e}")
        entities_raw = {"symptoms": [], "medications": [], "diagnoses": [], "vitals": [], "allergies": []}

    entities = MedicalEntities(**entities_raw)

    # AI: Generate SOAP note
    try:
        soap_dict = await generate_soap_note(
            labeled_transcript=labeled_text,
            symptoms=entities.symptoms,
            medications=entities.medications,
            diagnoses=entities.diagnoses,
            vitals=entities.vitals,
        )
        soap_note = SoapNote(
            subjective=soap_dict.get("subjective", {}),
            objective=soap_dict.get("objective", {}),
            assessment=soap_dict.get("assessment", {}),
            plan=soap_dict.get("plan", {}),
        )
    except Exception as e:
        logger.error(f"SOAP generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"SOAP note generation failed: {str(e)}")

    # Persist session (upsert — /generate-note may be called multiple times per session)
    existing = await db.execute(
        select(ConsultationSession).where(ConsultationSession.id == request.session_id)
    )
    session = existing.scalar_one_or_none()
    if session is None:
        session = ConsultationSession(id=request.session_id)
        db.add(session)

    session.doctor_id = _user.id
    session.doctor_name = _user.full_name
    session.raw_transcript = full_text
    session.labeled_transcript = json.dumps(transcript_dicts)
    session.extracted_entities = json.dumps(entities_raw)
    session.soap_note = json.dumps(soap_dict)
    # Reset any previously-persisted audit so the GET endpoint reports
    # "pending" until the new background audit lands.
    session.soap_audit = None
    session.status = "completed"

    await db.commit()

    # Fire-and-forget second-opinion audit. Doctors keep editing while
    # the audit runs; the result lands on consultation_sessions.soap_audit
    # and the frontend polls /sessions/{id}/audit to retrieve it.
    asyncio.create_task(
        audit_soap_note(
            soap_note=soap_dict,
            transcript=full_text,
            entities=entities_raw,
            session_id=request.session_id,
            claude_service=claude_service_module,
            db=None,
        )
    )

    # Same pattern for the patient-facing follow-up plan. Audio uploads
    # don't usually carry a linked patient_id, so we leave it null here —
    # it can be resolved later from patient_email when one becomes known.
    asyncio.create_task(
        extract_followup_from_soap(
            soap_note=soap_dict,
            session_id=request.session_id,
            patient_id=None,
            claude_service=claude_service_module,
            db=None,
        )
    )

    return GenerateNoteResponse(
        soap_note=soap_note,
        entities=entities,
        session_id=request.session_id,
    )


@router.get("/sessions/{session_id}/audit")
async def get_session_audit(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Fetch the second-opinion audit for a session.

    Returns 200 with the populated SoapAuditResponse once the audit task
    has finished. Returns 202 with `{"status": "pending"}` while the
    background task is still running.
    """
    result = await db.execute(
        select(ConsultationSession).where(
            ConsultationSession.id == session_id,
            ConsultationSession.doctor_id == _user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    audit = parse_persisted_audit(row.soap_audit)
    if audit is None:
        return JSONResponse(status_code=202, content={"status": "pending"})

    issues = [
        AuditIssue(
            issue=str(it.get("issue", "")),
            recommendation=str(it.get("recommendation", "")),
            priority=str(it.get("priority", "medium")),
        )
        for it in (audit.get("critical_issues") or [])
        if isinstance(it, dict)
    ]
    return SoapAuditResponse(
        status=str(audit.get("status") or "complete"),
        overall_quality=str(audit.get("overall_quality") or ""),
        overall_score=int(audit.get("overall_score") or 0),
        critical_issues=issues,
        missing_differentials=list(audit.get("missing_differentials") or []),
        documentation_gaps=list(audit.get("documentation_gaps") or []),
        positive_findings=list(audit.get("positive_findings") or []),
        reviewer_summary=str(audit.get("reviewer_summary") or ""),
    )


# ── Follow-up plan ───────────────────────────────────────────────────────


async def _load_followup_for_doctor(
    session_id: str, doctor_id: str, db: AsyncSession
) -> tuple[ConsultationSession, FollowUpPlan | None]:
    """Look up the consultation row (scoped to the calling doctor) and the
    follow-up plan for that session, if one has been extracted yet."""
    consultation = (
        await db.execute(
            select(ConsultationSession).where(
                ConsultationSession.id == session_id,
                ConsultationSession.doctor_id == doctor_id,
            )
        )
    ).scalar_one_or_none()
    if consultation is None:
        raise HTTPException(status_code=404, detail="Session not found")
    plan = (
        await db.execute(
            select(FollowUpPlan).where(
                FollowUpPlan.consultation_session_id == session_id
            )
        )
    ).scalar_one_or_none()
    return consultation, plan


@router.get(
    "/sessions/{session_id}/followup",
    response_model=FollowUpPlanResponse,
)
async def get_session_followup(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Return the patient-facing follow-up plan for a consultation.

    Returns 200 with `status="pending"` while the background extractor is
    still running and a fully-populated payload once it has landed."""
    _consultation, plan = await _load_followup_for_doctor(session_id, _user.id, db)
    if plan is None:
        return FollowUpPlanResponse(
            status="pending", consultation_session_id=session_id,
        )

    data = parse_followup_record(plan)
    return FollowUpPlanResponse(
        status="complete",
        id=data["id"],
        consultation_session_id=data["consultation_session_id"],
        patient_id=data["patient_id"],
        follow_up_date=data["follow_up_date"],
        follow_up_reason=data["follow_up_reason"],
        monitoring_items=data["monitoring_items"],
        warning_signs=data["warning_signs"],
        dietary_restrictions=data["dietary_restrictions"],
        activity_restrictions=data["activity_restrictions"],
        medications_to_start=[
            FollowUpMedication(
                drug=str(m.get("drug", "")),
                dose=str(m.get("dose", "")),
                frequency=str(m.get("frequency", "")),
            )
            for m in data["medications_to_start"]
        ],
        follow_up_specialist=data["follow_up_specialist"],
        patient_instructions=data["patient_instructions"],
        is_sent_to_patient=data["is_sent_to_patient"],
        created_at=data["created_at"],
    )


@router.post("/sessions/{session_id}/followup/pdf")
async def export_followup_pdf(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Generate (on demand) and return the patient follow-up PDF."""
    consultation, plan = await _load_followup_for_doctor(session_id, _user.id, db)
    if plan is None:
        raise HTTPException(
            status_code=409,
            detail="Follow-up plan is still being generated. Try again shortly.",
        )

    patient_name = consultation.patient_name or "Patient"
    pdf_bytes = generate_followup_pdf(plan, patient_name=patient_name)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF generation failed")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                'attachment; filename="medisense_followup_plan.pdf"'
            ),
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.post("/sessions/{session_id}/followup/send-to-patient")
async def push_followup_to_patient(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Append the follow-up summary to the patient's Dr. MediSense chat.

    Resolves the patient's user.id either from the stored FollowUpPlan or
    from the consultation's `patient_email` field. Returns 409 when no
    patient account can be associated with this session."""
    _consultation, plan = await _load_followup_for_doctor(session_id, _user.id, db)
    if plan is None:
        raise HTTPException(
            status_code=409,
            detail="Follow-up plan is still being generated. Try again shortly.",
        )

    patient_id = plan.patient_id or await resolve_patient_id(session_id, db)
    if not patient_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "This consultation has no linked patient account. "
                "Send the PDF instead, or link a patient first."
            ),
        )

    if plan.patient_id != patient_id:
        plan.patient_id = patient_id
        await db.commit()
        await db.refresh(plan)

    msg = await send_followup_to_patient_chat(plan, patient_id, db)
    return {
        "ok": msg is not None,
        "session_id": session_id,
        "patient_id": patient_id,
        "is_sent_to_patient": True,
    }


@router.post("/export-pdf")
async def export_soap_pdf(
    request: ExportPdfRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Generate, persist, and return a SOAP note PDF."""
    soap_dict = request.soap_note.model_dump()
    pdf_bytes = generate_soap_pdf(
        soap_note=soap_dict,
        patient_name=request.patient_name or "Anonymous Patient",
        doctor_name=request.doctor_name or _user.full_name or "Attending Physician",
        session_id=request.session_id,
    )
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF generation failed.")

    if request.session_id:
        try:
            pdf_path = save_soap_pdf(request.session_id, pdf_bytes)
            result = await db.execute(
                select(ConsultationSession).where(ConsultationSession.id == request.session_id)
            )
            session = result.scalar_one_or_none()
            if session is not None:
                session.soap_pdf_path = pdf_path
                session.soap_pdf_size = len(pdf_bytes)
                if request.patient_name:
                    session.patient_name = request.patient_name
                if request.doctor_name:
                    session.doctor_name = request.doctor_name
                await db.commit()
        except Exception as exc:
            logger.warning(f"Could not persist SOAP PDF for session {request.session_id}: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="medisense_soap_note.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/sessions", response_model=list[SessionSummary])
async def get_sessions(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Return list of this doctor's past consultation sessions (most recent first)."""
    result = await db.execute(
        select(ConsultationSession)
        .where(ConsultationSession.doctor_id == _user.id)
        .order_by(ConsultationSession.created_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return [
        SessionSummary(
            id=s.id,
            created_at=s.created_at.isoformat() if s.created_at else "",
            doctor_name=s.doctor_name,
            patient_identifier=s.patient_identifier or s.patient_name,
            status=s.status,
        )
        for s in sessions
    ]


# ── Doctor-Patient Chat Handoff ──────────────────────────────────────────

@router.get("/active-chats", response_model=List[DoctorChatActiveSession])
async def get_active_patient_chats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """List the active chats explicitly assigned to this doctor."""
    from sqlalchemy import desc, join

    stmt = (
        select(
            PatientChatSession.id,
            PatientChatSession.patient_id,
            User.full_name.label("patient_name"),
            PatientChatSession.started_at,
            PatientChatSession.title,
            PatientChatSession.doctor_joined,
            PatientChatSession.specialty,
        )
        .select_from(join(PatientChatSession, User, PatientChatSession.patient_id == User.id))
        .where(PatientChatSession.ended_at == None)
        .where(PatientChatSession.assigned_doctor_id == _user.id)
        .order_by(desc(PatientChatSession.started_at))
        .limit(20)
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        DoctorChatActiveSession(
            id=row.id,
            patient_id=row.patient_id,
            patient_name=row.patient_name,
            started_at=row.started_at.isoformat(),
            title=row.title,
            doctor_joined=bool(row.doctor_joined),
            specialty=row.specialty,
            specialty_name=specialty_name(row.specialty) if row.specialty else None,
        )
        for row in rows
    ]


@router.get("/chat-sessions", response_model=DoctorChatListResponse)
async def get_doctor_chat_sessions(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Every patient chat ever assigned to this doctor — active and past.

    Powers the "Patient Chats" sidebar on the doctor dashboard. Each row
    carries enough context (patient name, last-message preview + timestamp,
    AI/Doctor mode) to render the list without a follow-up call.
    """
    from sqlalchemy import desc, join, func

    stmt = (
        select(
            PatientChatSession.id,
            PatientChatSession.patient_id,
            User.full_name.label("patient_name"),
            PatientChatSession.started_at,
            PatientChatSession.ended_at,
            PatientChatSession.title,
            PatientChatSession.specialty,
            PatientChatSession.session_mode,
        )
        .select_from(join(PatientChatSession, User, PatientChatSession.patient_id == User.id))
        .where(PatientChatSession.assigned_doctor_id == _user.id)
        .order_by(desc(PatientChatSession.started_at))
        .limit(100)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return DoctorChatListResponse(items=[])

    session_ids = [r.id for r in rows]

    # Find the most recent message per session in one query.
    last_subq = (
        select(
            PatientChatMessage.session_id,
            func.max(PatientChatMessage.created_at).label("max_created"),
        )
        .where(PatientChatMessage.session_id.in_(session_ids))
        .group_by(PatientChatMessage.session_id)
        .subquery()
    )
    last_msgs_stmt = (
        select(PatientChatMessage)
        .join(
            last_subq,
            (PatientChatMessage.session_id == last_subq.c.session_id)
            & (PatientChatMessage.created_at == last_subq.c.max_created),
        )
    )
    last_msgs = (await db.execute(last_msgs_stmt)).scalars().all()
    last_by_session: dict[str, PatientChatMessage] = {m.session_id: m for m in last_msgs}

    items: list[DoctorChatListItem] = []
    for r in rows:
        last = last_by_session.get(r.id)
        preview = None
        last_at = None
        last_sender = None
        if last is not None:
            text = (last.content or "").strip()
            preview = text if len(text) <= 120 else text[:117] + "…"
            last_at = last.created_at.isoformat() if last.created_at else None
            last_sender = last.sender_type or (
                "patient" if last.role == "user"
                else "doctor" if last.role == "doctor"
                else "ai"
            )
        items.append(
            DoctorChatListItem(
                id=r.id,
                patient_id=r.patient_id,
                patient_name=r.patient_name,
                started_at=r.started_at.isoformat() if r.started_at else "",
                ended_at=r.ended_at.isoformat() if r.ended_at else None,
                title=r.title,
                specialty=r.specialty,
                specialty_name=specialty_name(r.specialty) if r.specialty else None,
                session_mode=(r.session_mode or "ai"),
                last_message_at=last_at,
                last_message_preview=preview,
                last_message_sender=last_sender,
            )
        )
    return DoctorChatListResponse(items=items)


def _ensure_doctor_assigned(doctor: User, session: PatientChatSession) -> None:
    """Block a doctor from acting on a chat that wasn't assigned to them.

    Phase 2: assignment is by `assigned_doctor_id` (the patient picked this
    specific doctor). Specialty alone is no longer enough.
    """
    if session.assigned_doctor_id and session.assigned_doctor_id != doctor.id:
        raise HTTPException(
            status_code=403,
            detail="This chat is assigned to a different doctor.",
        )
    if not session.assigned_doctor_id:
        # Legacy row: fall back to specialty match so historical chats still open.
        if not doctor.specialty:
            raise HTTPException(
                status_code=403,
                detail="Set your specialty before opening this legacy chat.",
            )
        if session.specialty and session.specialty != doctor.specialty:
            raise HTTPException(
                status_code=403,
                detail="This chat is outside your specialty.",
            )


@router.get("/chat/{session_id}", response_model=PatientChatSessionMessagesResponse)
async def get_patient_chat_for_doctor(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Allow a doctor to view a patient's full chat history."""
    session = await db.get(PatientChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_doctor_assigned(_user, session)

    from sqlalchemy import asc
    msgs = (
        await db.execute(
            select(PatientChatMessage)
            .where(PatientChatMessage.session_id == session_id)
            .order_by(asc(PatientChatMessage.created_at))
        )
    ).scalars().all()

    # Helper to parse file refs (duplicated from patient_chatbot for now)
    def _parse_file_refs(blob: Optional[str]) -> list[ChatFileReference]:
        if not blob: return []
        try:
            items = json.loads(blob)
            return [ChatFileReference(**item) for item in items] if isinstance(items, list) else []
        except: return []

    # Resolve patient + assigned-doctor display names so the panel header is
    # populated without an extra round-trip.
    patient = await db.get(User, session.patient_id)
    patient_name = patient.full_name if patient else None
    assigned_doctor_name = None
    if session.assigned_doctor_id:
        assigned = await db.get(User, session.assigned_doctor_id)
        assigned_doctor_name = assigned.full_name if assigned else None

    def _sender_for(m: PatientChatMessage) -> str:
        if m.sender_type:
            return m.sender_type
        if m.role == "user":
            return "patient"
        if m.role == "doctor":
            return "doctor"
        return "ai"

    return PatientChatSessionMessagesResponse(
        session_id=session.id,
        patient_id=session.patient_id,
        patient_name=patient_name,
        started_at=session.started_at,
        ended_at=session.ended_at,
        doctor_joined=bool(session.doctor_joined),
        specialty=session.specialty,
        specialty_name=specialty_name(session.specialty) if session.specialty else None,
        assigned_doctor_id=session.assigned_doctor_id,
        assigned_doctor_name=assigned_doctor_name,
        session_mode=(session.session_mode or "ai"),
        messages=[
            PatientChatMessageDTO(
                id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at,
                file_references=_parse_file_refs(m.file_references),
                sender_type=_sender_for(m),
                sender_id=m.sender_id,
                sender_name=(
                    patient_name if _sender_for(m) == "patient"
                    else assigned_doctor_name if _sender_for(m) == "doctor"
                    else None
                ),
            )
            for m in msgs
        ]
    )


@router.post("/chat/{session_id}/toggle-ai")
async def toggle_chat_ai(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Join (disable AI) or hand back (re-enable AI) for a patient chat.

    Flips both `doctor_joined` and `session_mode`, drops a system note into
    the transcript, and broadcasts both events over the chat WebSocket so
    the patient and any other doctor tab update without a page refresh.
    """
    session = await db.get(PatientChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_doctor_assigned(_user, session)

    # doctor_joined is INTEGER under the hood (cross-DB bool). Bind 0/1
    # so asyncpg/Postgres doesn't see a Python bool against an INTEGER col.
    was_joined = bool(session.doctor_joined)
    session.doctor_joined = 0 if was_joined else 1
    session.session_mode = "doctor" if not was_joined else "ai"

    note = (
        f"Dr. {_user.full_name} has joined the chat and is now responding "
        f"directly to you."
        if not was_joined
        else (
            f"Dr. {_user.full_name} has stepped away — MediSense AI will "
            f"continue answering until the doctor returns."
        )
    )
    msg = PatientChatMessage(
        id=generate_id(),
        session_id=session.id,
        patient_id=session.patient_id,
        role="doctor",
        sender_type="doctor",
        sender_id=_user.id,
        content=note,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    await db.commit()

    # Push both the mode change AND the system note as a regular message so
    # listeners can update header status and append the line in one trip.
    try:
        await chat_manager.broadcast(
            session.id,
            {
                "type": "mode_change",
                "session_id": session.id,
                "session_mode": session.session_mode,
                "doctor_joined": bool(session.doctor_joined),
                "doctor_id": _user.id,
                "doctor_name": _user.full_name,
            },
        )
        await chat_manager.broadcast(
            session.id,
            {
                "type": "message",
                "session_id": session.id,
                "message": {
                    "id": msg.id,
                    "role": "doctor",
                    "sender_type": "doctor",
                    "sender_id": _user.id,
                    "sender_name": _user.full_name,
                    "content": note,
                    "created_at": msg.created_at.isoformat(),
                    "file_references": [],
                },
            },
        )
    except Exception as exc:
        logger.warning(f"toggle-ai broadcast failed for {session.id}: {exc}")

    return {
        "doctor_joined": bool(session.doctor_joined),
        "session_mode": session.session_mode,
    }


@router.post("/chat/{session_id}/message")
async def send_doctor_message(
    session_id: str,
    payload: DoctorChatMessageRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("doctor")),
):
    """Send a message as the doctor to the patient.

    Stamps sender attribution and pushes the message over the chat WebSocket
    so the patient sees it instantly.
    """
    session = await db.get(PatientChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_doctor_assigned(_user, session)

    msg = PatientChatMessage(
        id=generate_id(),
        session_id=session_id,
        patient_id=session.patient_id,
        role="doctor",
        sender_type="doctor",
        sender_id=_user.id,
        content=payload.message,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    await db.commit()

    try:
        await chat_manager.broadcast(
            session.id,
            {
                "type": "message",
                "session_id": session.id,
                "message": {
                    "id": msg.id,
                    "role": "doctor",
                    "sender_type": "doctor",
                    "sender_id": _user.id,
                    "sender_name": _user.full_name,
                    "content": payload.message,
                    "created_at": msg.created_at.isoformat(),
                    "file_references": [],
                },
            },
        )
    except Exception as exc:
        logger.warning(f"doctor-message broadcast failed for {session.id}: {exc}")

    return {"status": "ok", "message_id": msg.id}
