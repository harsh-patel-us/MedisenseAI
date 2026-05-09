"""
meet.py — Google Meet integration: link a Meet conference to an in-app
consultation session and process its post-call transcript through the
existing diarization → NER → SOAP generation pipeline.

Endpoints
---------
POST /meet/link-conference         — bind meet_conference_id to a session
POST /meet/process-transcript      — kick off background processing, returns task_id
GET  /meet/process-status/{tid}    — poll processing status / result
POST /meet/webhook                 — Google "meeting ended" webhook (HMAC-SHA256)
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Path,
    Request,
)
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionLocal, ConsultationSession, User, get_db
from services.auth_service import get_current_user, require_role
from services.claude_service import (
    generate_patient_explanation,
    generate_soap_note,
)
from services import claude_service as _claude_service_module
from services.followup_service import (
    extract_followup_from_soap,
    resolve_patient_id,
)
from services.intake_service import (
    INTAKE_FORM_QUESTIONS,
    generate_intake_token,
    process_intake_submission,
)
from services.google_calendar import (
    CalendarEventResult,
    _platform_credentials,
    calendar_invite_available,
    create_meeting_event,
    platform_is_configured,
)
from services.ner import extract_medical_entities
from services.pdf_export import generate_soap_pdf
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meet", tags=["meet"])


# ── Task registry ────────────────────────────────────────────────────────

@dataclass
class _MeetTask:
    task_id: str
    session_id: str
    status: str = "pending"          # "pending" | "running" | "completed" | "failed"
    detail: str = ""
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    soap_note: Optional[dict] = None
    patient_explanation: Optional[dict] = None
    transcript_segments: list[dict] = field(default_factory=list)


# Single-process, in-memory — fine for the dev / single-worker setup the rest
# of the app already uses (see `_rooms` in consultation.py).
_tasks: dict[str, _MeetTask] = {}


# ── Schemas ──────────────────────────────────────────────────────────────


class ScheduleMeetingRequest(BaseModel):
    doctor_name: str = Field(default="Doctor", max_length=200)
    patient_name: str = Field(default="Patient", max_length=200)
    patient_email: Optional[str] = None
    doctor_email: Optional[str] = None
    scheduled_at: str  # ISO 8601 datetime string
    duration_minutes: int = 30
    reason: str = ""


class ScheduledMeetingDTO(BaseModel):
    session_id: str
    doctor_name: str
    patient_name: str
    patient_email: Optional[str] = None
    doctor_email: Optional[str] = None
    scheduled_at: str
    duration_minutes: int
    reason: str
    status: str
    created_at: str
    organizer_role: Optional[str] = None
    meet_link: Optional[str] = None
    google_event_id: Optional[str] = None
    google_event_link: Optional[str] = None
    google_invite_status: str = "skipped"  # "sent" | "skipped" | "failed"
    google_invite_error: Optional[str] = None
    intake_url: Optional[str] = None
    intake_submitted: bool = False


class ScheduledListResponse(BaseModel):
    meetings: list[ScheduledMeetingDTO]


class IntakeFormResponse(BaseModel):
    session_id: str
    questions: list[str]
    patient_name: Optional[str] = None
    already_submitted: bool = False


class IntakeSubmitRequest(BaseModel):
    patient_name: str = Field(default="", max_length=200)
    answers: dict[str, str] = Field(default_factory=dict)


class IntakeSubmitResponse(BaseModel):
    message: str


class IntakeSummaryResponse(BaseModel):
    session_id: str
    intake_data: Optional[dict] = None
    intake_summary: Optional[str] = None
    submitted_at: Optional[datetime] = None


class LinkConferenceRequest(BaseModel):
    session_id: str = Field(..., max_length=64)
    meet_conference_id: str = Field(..., max_length=200)
    patient_name: Optional[str] = Field(default=None, max_length=200)
    doctor_name: Optional[str] = Field(default=None, max_length=200)


class LinkConferenceResponse(BaseModel):
    session_id: str
    meet_conference_id: str
    status: str


class ProcessTranscriptRequest(BaseModel):
    session_id: str
    meet_conference_id: Optional[str] = None


class ProcessTranscriptResponse(BaseModel):
    task_id: str
    session_id: str
    status: str


class ProcessStatusResponse(BaseModel):
    task_id: str
    session_id: str
    status: str
    detail: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    soap_note: Optional[dict] = None
    patient_explanation: Optional[dict] = None
    transcript: list[dict] = Field(default_factory=list)


class UnprocessedSessionDTO(BaseModel):
    session_id: str
    doctor_name: Optional[str] = None
    patient_name: Optional[str] = None
    meet_conference_id: Optional[str] = None
    processing_status: Optional[str] = None
    created_at: datetime


# ── Endpoint: schedule a Google Meet consultation ────────────────────────


def _row_to_meeting_dto(row: ConsultationSession) -> ScheduledMeetingDTO:
    intake_url: Optional[str] = None
    if row.intake_token:
        base = (settings.frontend_url or "").rstrip("/")
        intake_url = f"{base}/intake/{row.intake_token}"
    return ScheduledMeetingDTO(
        session_id=row.id,
        doctor_name=row.doctor_name or "Doctor",
        patient_name=row.patient_name or "Patient",
        patient_email=row.patient_email,
        doctor_email=row.doctor_email,
        scheduled_at=row.scheduled_at.isoformat() if row.scheduled_at else "",
        duration_minutes=row.duration_minutes or 30,
        reason=row.reason or "",
        status=row.status or "scheduled",
        created_at=row.created_at.isoformat() if row.created_at else "",
        organizer_role=row.organizer_role,
        meet_link=row.meet_link,
        google_event_id=row.google_event_id,
        google_event_link=row.google_event_link,
        google_invite_status=row.google_invite_status or "skipped",
        google_invite_error=row.google_invite_error,
        intake_url=intake_url,
        intake_submitted=row.intake_submitted_at is not None,
    )


@router.post("/schedule", response_model=ScheduledMeetingDTO)
async def schedule_meeting(
    payload: ScheduleMeetingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ScheduledMeetingDTO:
    """Schedule a consultation by creating a Google Calendar event with a
    Meet link. Persists a ConsultationSession row so the doctor dashboard
    can later process the Meet transcript into a SOAP note."""
    organizer_role = user.role
    if organizer_role == "doctor":
        doctor_name = (payload.doctor_name or user.full_name).strip()
        patient_name = (payload.patient_name or "Patient").strip()
        doctor_email = payload.doctor_email or user.email
        patient_email = payload.patient_email
        attendee_email = patient_email
        attendee_name = patient_name
    elif organizer_role == "patient":
        doctor_name = (payload.doctor_name or "Doctor").strip()
        patient_name = (payload.patient_name or user.full_name).strip()
        doctor_email = payload.doctor_email
        patient_email = payload.patient_email or user.email
        attendee_email = doctor_email
        attendee_name = doctor_name
    else:
        raise HTTPException(status_code=403, detail="Only doctors or patients may schedule.")

    try:
        scheduled_dt = datetime.fromisoformat(payload.scheduled_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scheduled_at — must be ISO 8601.")

    # Normalize to UTC-naive so it fits the TIMESTAMP WITHOUT TIME ZONE column
    # (Postgres asyncpg refuses to bind tz-aware datetimes against naive columns).
    if scheduled_dt.tzinfo is not None:
        scheduled_dt = scheduled_dt.astimezone(timezone.utc).replace(tzinfo=None)

    title = f"MediSense Consultation — {doctor_name} & {patient_name}"
    description_lines = [
        "MediSense AI live consultation.",
        "",
        f"Doctor: {doctor_name}",
        f"Patient: {patient_name}",
    ]
    if payload.reason.strip():
        description_lines += ["", f"Reason: {payload.reason.strip()}"]
    description = "\n".join(description_lines)

    meet_link: Optional[str] = None
    event_id: Optional[str] = None
    event_link: Optional[str] = None
    invite_status = "skipped"
    invite_error: Optional[str] = None

    if calendar_invite_available(user):
        if not attendee_email:
            invite_status = "failed"
            invite_error = (
                f"Add the {('patient' if organizer_role == 'doctor' else 'doctor')}"
                "'s email so we can include them on the calendar invite."
            )
        else:
            try:
                event: CalendarEventResult = await create_meeting_event(
                    db=db,
                    organizer=user,
                    attendee_email=attendee_email,
                    attendee_name=attendee_name,
                    title=title,
                    description=description,
                    start_iso=payload.scheduled_at,
                    duration_minutes=payload.duration_minutes,
                )
                meet_link = event.meet_link
                event_id = event.event_id
                event_link = event.html_link
                invite_status = "sent"
            except Exception as exc:
                logger.error(
                    f"Calendar invite failed during scheduling: {exc}", exc_info=True
                )
                invite_status = "failed"
                invite_error = (
                    "Could not create the Google Calendar event. "
                    "Check that the platform Google account is configured."
                )

    try:
        session_id = generate_id()
        row = ConsultationSession(
            id=session_id,
            doctor_id=user.id if organizer_role == "doctor" else None,
            doctor_name=doctor_name,
            patient_name=patient_name,
            status="scheduled",
            scheduled_at=scheduled_dt,
            duration_minutes=payload.duration_minutes,
            reason=payload.reason.strip(),
            patient_email=patient_email,
            doctor_email=doctor_email,
            organizer_id=user.id,
            organizer_role=organizer_role,
            meet_link=meet_link,
            google_event_id=event_id,
            google_event_link=event_link,
            google_invite_status=invite_status,
            google_invite_error=invite_error,
            intake_token=generate_intake_token(),
        )

        # If we got a Meet link, derive the conference id so the doctor dashboard
        # can later process the transcript without an extra link-conference call.
        if meet_link:
            try:
                from urllib.parse import urlparse

                path = urlparse(meet_link).path or ""
                conf_id = path.strip("/").split("/")[-1] if path else ""
                if conf_id:
                    row.meet_conference_id = conf_id
                    row.processing_status = "pending"
            except Exception:
                pass

        db.add(row)
        await db.commit()
        await db.refresh(row)

        logger.info(
            f"Consultation scheduled: session={session_id} at {payload.scheduled_at} "
            f"(organizer={organizer_role} {user.id}, invite={invite_status})"
        )
        return _row_to_meeting_dto(row)
    except Exception as exc:
        logger.error(f"FATAL error in schedule_meeting: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal Server Error during scheduling: {str(exc)}")



@router.get("/scheduled", response_model=ScheduledListResponse)
async def list_scheduled_meetings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ScheduledListResponse:
    """List the current user's scheduled consultations, sorted by start time."""
    rows = (
        await db.execute(
            select(ConsultationSession)
            .where(
                ConsultationSession.organizer_id == user.id,
                ConsultationSession.scheduled_at.is_not(None),
            )
            .order_by(ConsultationSession.scheduled_at.asc())
        )
    ).scalars().all()

    return ScheduledListResponse(meetings=[_row_to_meeting_dto(r) for r in rows])


# ── Endpoint: list unprocessed sessions ──────────────────────────────────


@router.get("/sessions/unprocessed", response_model=list[UnprocessedSessionDTO])
async def list_unprocessed(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("doctor")),
) -> list[UnprocessedSessionDTO]:
    """Return this doctor's Meet-linked sessions that haven't produced a
    SOAP note yet. Drives the 'Process Google Meet Consultation' panel on
    the doctor dashboard."""
    rows = (
        await db.execute(
            select(ConsultationSession)
            .where(
                ConsultationSession.doctor_id == user.id,
                ConsultationSession.meet_conference_id.is_not(None),
            )
            .order_by(ConsultationSession.created_at.desc())
        )
    ).scalars().all()

    return [
        UnprocessedSessionDTO(
            session_id=r.id,
            doctor_name=r.doctor_name,
            patient_name=r.patient_name,
            meet_conference_id=r.meet_conference_id,
            processing_status=r.processing_status,
            created_at=r.created_at,
        )
        for r in rows
        if (r.processing_status or "pending") != "completed"
    ]


# ── Endpoint: link a Google Meet conference to a session ─────────────────


@router.post("/link-conference", response_model=LinkConferenceResponse)
async def link_conference(
    payload: LinkConferenceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LinkConferenceResponse:
    """Bind a Meet conference id to a ConsultationSession row, creating the
    row on first call so the doctor dashboard can list it for processing."""
    row = (
        await db.execute(
            select(ConsultationSession).where(
                ConsultationSession.id == payload.session_id
            )
        )
    ).scalar_one_or_none()

    if row is None:
        row = ConsultationSession(
            id=payload.session_id,
            doctor_id=user.id if user.role == "doctor" else None,
            doctor_name=payload.doctor_name,
            patient_name=payload.patient_name,
            status="scheduled",
        )
        db.add(row)
    else:
        if user.role == "doctor" and row.doctor_id is None:
            row.doctor_id = user.id
        if payload.doctor_name and not row.doctor_name:
            row.doctor_name = payload.doctor_name
        if payload.patient_name and not row.patient_name:
            row.patient_name = payload.patient_name

    row.meet_conference_id = payload.meet_conference_id
    row.processing_status = row.processing_status or "pending"
    await db.commit()

    return LinkConferenceResponse(
        session_id=row.id,
        meet_conference_id=row.meet_conference_id,
        status=row.processing_status,
    )


# ── Endpoint: kick off background processing ────────────────────────────


@router.post("/process-transcript", response_model=ProcessTranscriptResponse)
async def process_transcript(
    payload: ProcessTranscriptRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("doctor")),
) -> ProcessTranscriptResponse:
    row = (
        await db.execute(
            select(ConsultationSession).where(
                ConsultationSession.id == payload.session_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Consultation session not found.")
    if row.doctor_id and row.doctor_id != user.id:
        raise HTTPException(status_code=403, detail="Not your consultation.")

    conf_id = payload.meet_conference_id or row.meet_conference_id
    if not conf_id:
        raise HTTPException(
            status_code=400,
            detail="No Meet conference id linked to this session.",
        )

    task = _MeetTask(task_id=generate_id(), session_id=payload.session_id)
    task.status = "pending"
    _tasks[task.task_id] = task

    row.meet_conference_id = conf_id
    row.processing_task_id = task.task_id
    row.processing_status = "pending"
    await db.commit()

    background.add_task(_run_meet_pipeline, task.task_id, payload.session_id, conf_id)

    return ProcessTranscriptResponse(
        task_id=task.task_id,
        session_id=payload.session_id,
        status=task.status,
    )


# ── Endpoint: poll status ───────────────────────────────────────────────


@router.get("/process-status/{task_id}", response_model=ProcessStatusResponse)
async def process_status(
    task_id: str = Path(...),
    user: User = Depends(get_current_user),
) -> ProcessStatusResponse:
    task = _tasks.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return ProcessStatusResponse(
        task_id=task.task_id,
        session_id=task.session_id,
        status=task.status,
        detail=task.detail,
        started_at=task.started_at,
        completed_at=task.completed_at,
        soap_note=task.soap_note,
        patient_explanation=task.patient_explanation,
        transcript=task.transcript_segments,
    )


# ── Endpoint: Google webhook ─────────────────────────────────────────────


def _verify_hmac(raw_body: bytes, signature: str | None) -> bool:
    """Validate `X-MediSense-Signature: sha256=<hex>` against the configured
    shared secret. Returns True when no secret is configured (dev mode)."""
    secret = settings.google_meet_webhook_secret
    if not secret:
        return True
    if not signature:
        return False
    try:
        algo, _, sent_hex = signature.partition("=")
    except ValueError:
        return False
    if algo.lower() != "sha256" or not sent_hex:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, sent_hex.lower())


class WebhookResponse(BaseModel):
    accepted: bool
    task_id: Optional[str] = None
    detail: str = ""


@router.post("/webhook", response_model=WebhookResponse)
async def meet_webhook(
    request: Request,
    background: BackgroundTasks,
    x_medisense_signature: Optional[str] = Header(default=None),
    x_meet_signature: Optional[str] = Header(default=None),
) -> WebhookResponse:
    """Receive Google's 'meeting ended' push and auto-trigger processing.

    Body shape (best-effort): `{ "conferenceId": "...", "sessionId": "..." }`.
    SessionId is optional — when omitted we look up the consultation by
    meet_conference_id."""
    raw = await request.body()
    sig = x_medisense_signature or x_meet_signature
    if not _verify_hmac(raw, sig):
        raise HTTPException(status_code=401, detail="Invalid signature.")

    try:
        body = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON.")

    conf_id = body.get("conferenceId") or body.get("meet_conference_id")
    session_id = body.get("sessionId") or body.get("session_id")
    if not conf_id and not session_id:
        raise HTTPException(
            status_code=400,
            detail="Webhook needs conferenceId or sessionId.",
        )

    async with AsyncSessionLocal() as db:
        row: Optional[ConsultationSession] = None
        if session_id:
            row = (
                await db.execute(
                    select(ConsultationSession).where(
                        ConsultationSession.id == session_id
                    )
                )
            ).scalar_one_or_none()
        if row is None and conf_id:
            row = (
                await db.execute(
                    select(ConsultationSession).where(
                        ConsultationSession.meet_conference_id == conf_id
                    )
                )
            ).scalar_one_or_none()

        if row is None:
            return WebhookResponse(
                accepted=False,
                detail="No consultation found for this conference.",
            )

        if conf_id and not row.meet_conference_id:
            row.meet_conference_id = conf_id

        task = _MeetTask(task_id=generate_id(), session_id=row.id)
        _tasks[task.task_id] = task
        row.processing_task_id = task.task_id
        row.processing_status = "pending"
        await db.commit()

        background.add_task(
            _run_meet_pipeline, task.task_id, row.id, row.meet_conference_id or conf_id
        )

    return WebhookResponse(accepted=True, task_id=task.task_id)


# ── Background pipeline ──────────────────────────────────────────────────


async def _run_meet_pipeline(task_id: str, session_id: str, conference_id: str) -> None:
    """End-to-end: fetch Meet transcript → diarize → NER → SOAP → patient guide.

    Persists results on the ConsultationSession row and the in-memory task
    so the frontend poll can render them in `SoapNoteEditor`."""
    task = _tasks.get(task_id)
    if task is None:
        return
    task.status = "running"
    task.detail = "Fetching Meet transcript…"

    async with AsyncSessionLocal() as db:
        try:
            row = (
                await db.execute(
                    select(ConsultationSession).where(
                        ConsultationSession.id == session_id
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                raise RuntimeError("Consultation session disappeared mid-pipeline.")
            row.processing_status = "running"
            await db.commit()

            # 1. Fetch transcript entries from Google Meet API.
            entries = await _fetch_meet_transcript_entries(conference_id)
            if not entries:
                raise RuntimeError(
                    "No transcript entries returned from Meet. "
                    "Ensure transcripts are enabled on the Workspace plan."
                )
            task.detail = f"Diarizing {len(entries)} transcript entries…"

            # 2. Diarize / label segments. Meet's transcript already carries
            #    speaker IDs per entry — alternate map to DOCTOR/PATIENT in
            #    first-seen order, which is what services.diarization does.
            segments = _label_speakers_from_meet(entries)
            task.transcript_segments = segments

            # 3. NER on the full text.
            full_text = " ".join(seg["text"] for seg in segments if seg.get("text"))
            entities = extract_medical_entities(full_text)
            task.detail = "Generating SOAP note…"

            # 4. SOAP note via existing claude_service.
            labeled = "\n".join(
                f"[{seg['speaker']}]: {seg['text']}" for seg in segments
            )
            soap = await generate_soap_note(
                labeled_transcript=labeled,
                symptoms=entities.get("symptoms", []),
                medications=entities.get("medications", []),
                diagnoses=entities.get("diagnoses", []),
                vitals=entities.get("vitals", []),
            )
            task.soap_note = soap

            # 5. Patient-friendly explanation.
            task.detail = "Generating patient summary…"
            explanation = await generate_patient_explanation(
                soap_dict=soap,
                patient_name=row.patient_name or "Patient",
                doctor_name=row.doctor_name or "Doctor",
            )
            task.patient_explanation = explanation

            # 6. PDF export (best-effort — failure here doesn't fail the task).
            try:
                pdf_bytes = generate_soap_pdf(
                    soap_note=soap,
                    patient_name=row.patient_name or "Patient",
                    doctor_name=row.doctor_name or "Doctor",
                    session_id=row.id,
                )
                if pdf_bytes:
                    from utils.storage import save_soap_pdf  # local import to avoid cycles

                    pdf_path = save_soap_pdf(row.id, pdf_bytes)
                    row.soap_pdf_path = pdf_path
                    row.soap_pdf_size = len(pdf_bytes)
            except Exception as pdf_exc:
                logger.warning(f"SOAP PDF export failed for {row.id}: {pdf_exc}")

            # 7. Persist on the consultation row.
            row.raw_transcript = full_text
            row.labeled_transcript = json.dumps(segments)
            row.extracted_entities = json.dumps(entities)
            row.soap_note = json.dumps(soap)
            row.status = "completed"
            row.processing_status = "completed"
            await db.commit()

            # Resolve a linked patient_id from the consultation's
            # patient_email (best-effort) so the follow-up plan can later
            # be pushed into that patient's chat history.
            try:
                resolved_patient_id = await resolve_patient_id(session_id, db)
            except Exception:
                resolved_patient_id = None

            # Fire-and-forget patient follow-up plan extraction. Mirrors
            # the audio-upload path in routers/doctor.py so every SOAP
            # note (audio or Meet) gets a follow-up card automatically.
            asyncio.create_task(
                extract_followup_from_soap(
                    soap_note=soap,
                    session_id=session_id,
                    patient_id=resolved_patient_id,
                    claude_service=_claude_service_module,
                    db=None,
                )
            )

            task.status = "completed"
            task.detail = "Done."
            task.completed_at = datetime.utcnow()

        except Exception as exc:
            logger.error(
                f"Meet processing failed for session {session_id}: {exc}",
                exc_info=True,
            )
            task.status = "failed"
            task.detail = str(exc)
            task.completed_at = datetime.utcnow()
            try:
                if "row" in locals() and row is not None:
                    row.processing_status = "failed"
                    await db.commit()
            except Exception:
                pass


# ── Pre-visit intake form endpoints ──────────────────────────────────────


@router.get("/intake/{token}", response_model=IntakeFormResponse)
async def get_intake_form(
    token: str = Path(..., max_length=128),
    db: AsyncSession = Depends(get_db),
) -> IntakeFormResponse:
    """Public — no auth. Returns the questions to render and whether the
    form has already been submitted (so the page can short-circuit to a
    thank-you state instead of accepting a duplicate)."""
    row = (
        await db.execute(
            select(ConsultationSession).where(
                ConsultationSession.intake_token == token
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Intake link not found.")

    already = row.intake_submitted_at is not None
    if already:
        # Spec: 410 Gone for an already-consumed link. The frontend treats
        # 410 as "show the thank-you message".
        raise HTTPException(
            status_code=410,
            detail="This intake form has already been submitted.",
        )

    return IntakeFormResponse(
        session_id=row.id,
        questions=INTAKE_FORM_QUESTIONS,
        patient_name=row.patient_name,
        already_submitted=False,
    )


@router.post("/intake/{token}/submit", response_model=IntakeSubmitResponse)
async def submit_intake_form(
    payload: IntakeSubmitRequest,
    background: BackgroundTasks,
    token: str = Path(..., max_length=128),
    db: AsyncSession = Depends(get_db),
) -> IntakeSubmitResponse:
    """Public — no auth. Records the submission *synchronously* (so the
    token is consumed before we return) but kicks the LLM summarization
    off into a background task so the patient gets an instant 200."""
    row = (
        await db.execute(
            select(ConsultationSession).where(
                ConsultationSession.intake_token == token
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Intake link not found.")
    if row.intake_submitted_at is not None:
        raise HTTPException(
            status_code=410,
            detail="This intake form has already been submitted.",
        )

    # Persist the patient-supplied name on the consultation row when the
    # original schedule didn't include it.
    name = (payload.patient_name or "").strip()
    if name and (not row.patient_name or row.patient_name == "Patient"):
        row.patient_name = name

    intake_data = {
        "patient_name": name or row.patient_name or "",
        "answers": payload.answers or {},
    }

    # Mark the token consumed up-front so re-posts hit 410 even if the
    # background summary task is still running.
    row.intake_data = json.dumps(intake_data)
    row.intake_submitted_at = datetime.utcnow()
    session_id = row.id
    await db.commit()

    background.add_task(
        process_intake_submission,
        session_id,
        intake_data,
        _claude_service_module,
        None,
    )

    return IntakeSubmitResponse(
        message="Thank you! Your doctor has been notified.",
    )


@router.get(
    "/sessions/{session_id}/intake-summary",
    response_model=IntakeSummaryResponse,
)
async def get_intake_summary(
    session_id: str = Path(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("doctor")),
) -> IntakeSummaryResponse:
    """Doctor-only. Returns the AI summary plus the raw answers so the UI
    can render a 'see raw answers' toggle. 404 if no submission yet so the
    dashboard can hide the panel without printing an error."""
    row = (
        await db.execute(
            select(ConsultationSession).where(
                ConsultationSession.id == session_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Consultation session not found.")
    if row.doctor_id and row.doctor_id != user.id:
        raise HTTPException(status_code=403, detail="Not your consultation.")
    if row.intake_submitted_at is None:
        raise HTTPException(status_code=404, detail="No intake submission yet.")

    raw: Optional[dict] = None
    if row.intake_data:
        try:
            raw = json.loads(row.intake_data)
        except json.JSONDecodeError:
            raw = None

    return IntakeSummaryResponse(
        session_id=row.id,
        intake_data=raw,
        intake_summary=row.intake_summary,
        submitted_at=row.intake_submitted_at,
    )


# ── Google Meet API helpers ──────────────────────────────────────────────


async def _fetch_meet_transcript_entries(conference_id: str) -> list[dict]:
    """List every transcript entry on the given Meet conferenceRecord.

    Uses the platform Google account's OAuth credentials. Requires the
    Meet REST API to be enabled on the Cloud project and the account to
    have access to the recorded transcript. Returns [] when transcripts
    aren't available so the caller can surface a clear error."""
    if not platform_is_configured():
        raise RuntimeError(
            "Platform Google credentials are not configured. "
            "Cannot fetch Meet transcript."
        )

    def _list_entries() -> list[dict]:
        creds = _platform_credentials()
        meet = build("meet", "v2", credentials=creds, cache_discovery=False)
        # Meet requires the conferenceRecord resource path. Accept either the
        # bare id ("abc-defg-hij") or the full resource ("conferenceRecords/...").
        record_path = (
            conference_id
            if conference_id.startswith("conferenceRecords/")
            else f"conferenceRecords/{conference_id}"
        )

        # 1. List transcripts on this conferenceRecord.
        try:
            transcripts_resp = (
                meet.conferenceRecords()
                .transcripts()
                .list(parent=record_path)
                .execute()
            )
        except HttpError as exc:
            raise RuntimeError(f"Meet API list transcripts failed: {exc}")

        transcripts = transcripts_resp.get("transcripts") or []
        if not transcripts:
            return []

        # 2. Pull entries from every transcript on the record (usually 1).
        all_entries: list[dict] = []
        for tr in transcripts:
            transcript_name = tr.get("name")
            if not transcript_name:
                continue
            page_token: Optional[str] = None
            while True:
                req = (
                    meet.conferenceRecords()
                    .transcripts()
                    .entries()
                    .list(parent=transcript_name, pageToken=page_token)
                )
                resp = req.execute()
                all_entries.extend(resp.get("transcriptEntries") or [])
                page_token = resp.get("nextPageToken")
                if not page_token:
                    break
        return all_entries

    return await asyncio.to_thread(_list_entries)


def _label_speakers_from_meet(entries: list[dict]) -> list[dict]:
    """Map Meet `participant` references to DOCTOR / PATIENT using
    first-seen order — the same convention used by services.diarization."""
    role_map: dict[str, str] = {}
    out: list[dict] = []
    for entry in entries:
        participant = entry.get("participant") or entry.get("speaker") or "unknown"
        if participant not in role_map:
            role_map[participant] = "DOCTOR" if not role_map else "PATIENT"
        text = (entry.get("text") or "").strip()
        if not text:
            continue
        out.append(
            {
                "speaker": role_map[participant],
                "text": text,
                "timestamp": entry.get("startTime") or entry.get("endTime") or "",
                "confidence": 0.9,
            }
        )
    return out
