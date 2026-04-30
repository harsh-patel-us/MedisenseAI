"""
consultation.py — Real-time video consultation router

WebSocket /consultation/ws/{room_id}?role=doctor|patient
  - JSON messages: WebRTC signaling (offer/answer/ICE) + control
  - Binary messages: audio chunks for live transcription

POST /consultation/create          → create room, return room_id
GET  /consultation/room/{room_id}  → room status
POST /consultation/export-soap-pdf/{room_id}
POST /consultation/export-patient-pdf/{room_id}
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from config import settings
from database import User, get_db
from services.auth_service import get_current_user, require_role
from services.claude_service import generate_patient_explanation, generate_soap_note
from services.google_calendar import (
    CalendarEventResult,
    calendar_invite_available,
    create_meeting_event,
)
from services.ner import extract_medical_entities
from services.pdf_export import generate_consultation_patient_pdf, generate_soap_pdf
from services.transcription import transcribe_audio
from sqlalchemy.ext.asyncio import AsyncSession
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/consultation", tags=["consultation"])

# ── In-memory room registry ────────────────────────────────────────────────
# Keyed by room_id. Each entry holds the two WebSocket connections,
# the accumulated transcript, and post-call AI outputs.
_rooms: dict[str, dict] = {}


# ── Request / Response models ──────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    doctor_name: str = "Doctor"
    patient_name: str = "Patient"


class ScheduleRoomRequest(BaseModel):
    doctor_name: str = "Doctor"
    patient_name: str = "Patient"
    patient_email: Optional[str] = None
    doctor_email: Optional[str] = None
    scheduled_at: str  # ISO 8601 datetime string
    duration_minutes: int = 30
    reason: str = ""


class RoomResponse(BaseModel):
    room_id: str
    session_id: str
    doctor_name: str
    patient_name: str
    status: str


class ScheduledMeetingResponse(BaseModel):
    room_id: str
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


# ── REST endpoints ─────────────────────────────────────────────────────────

@router.post("/create", response_model=RoomResponse)
async def create_room(
    request: CreateRoomRequest,
    _user: User = Depends(require_role("doctor")),
):
    """Doctor creates a consultation room. Returns a room_id to share with the patient."""
    room_id = str(uuid.uuid4())[:8].upper()
    session_id = generate_id()
    _rooms[room_id] = {
        "doctor_ws": None,
        "patient_ws": None,
        "transcript": [],
        "session_id": session_id,
        "doctor_name": request.doctor_name,
        "patient_name": request.patient_name,
        "status": "waiting",
        "created_at": datetime.utcnow().isoformat(),
        "soap_note": None,
        "patient_explanation": None,
    }
    logger.info(f"Consultation room created: {room_id} (session={session_id})")
    return RoomResponse(
        room_id=room_id,
        session_id=session_id,
        doctor_name=request.doctor_name,
        patient_name=request.patient_name,
        status="waiting",
    )


@router.post("/schedule", response_model=ScheduledMeetingResponse)
async def schedule_room(
    request: ScheduleRoomRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a scheduled consultation. Either a doctor or a patient may
    organize. If the organizer has connected Google Calendar, an event
    with a Google Meet link is inserted on their primary calendar and the
    other party is invited (Google emails them automatically)."""
    room_id = str(uuid.uuid4())[:8].upper()
    session_id = generate_id()
    created_at = datetime.utcnow().isoformat()

    # Resolve who's who based on the authenticated user's role. The organizer
    # is always the current user; the attendee is the "other party" supplied
    # in the request.
    organizer_role = user.role  # "doctor" | "patient"
    if organizer_role == "doctor":
        doctor_name = (request.doctor_name or user.full_name).strip()
        patient_name = (request.patient_name or "Patient").strip()
        doctor_email = request.doctor_email or user.email
        patient_email = request.patient_email
        attendee_email = patient_email
        attendee_name = patient_name
    elif organizer_role == "patient":
        doctor_name = (request.doctor_name or "Doctor").strip()
        patient_name = (request.patient_name or user.full_name).strip()
        doctor_email = request.doctor_email
        patient_email = request.patient_email or user.email
        attendee_email = doctor_email
        attendee_name = doctor_name
    else:
        raise HTTPException(status_code=403, detail="Only doctors or patients may schedule.")

    room_url = (
        f"{settings.frontend_url.rstrip('/')}/consultation/room/{room_id}"
    )
    title = f"MediSense Consultation — {doctor_name} & {patient_name}"
    description_lines = [
        "MediSense AI live consultation.",
        "",
        f"Doctor: {doctor_name}",
        f"Patient: {patient_name}",
    ]
    if request.reason.strip():
        description_lines += ["", f"Reason: {request.reason.strip()}"]
    description_lines += ["", f"In-app room: {room_url}", f"Room ID: {room_id}"]
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
                    start_iso=request.scheduled_at,
                    duration_minutes=request.duration_minutes,
                )
                meet_link = event.meet_link
                event_id = event.event_id
                event_link = event.html_link
                invite_status = "sent"
            except Exception as exc:
                logger.error(
                    f"Calendar invite failed for room {room_id}: {exc}", exc_info=True
                )
                invite_status = "failed"
                invite_error = (
                    "Could not create the Google Calendar event. "
                    "Check that the platform Google account is configured."
                )

    _rooms[room_id] = {
        "doctor_ws": None,
        "patient_ws": None,
        "transcript": [],
        "session_id": session_id,
        "doctor_name": doctor_name,
        "patient_name": patient_name,
        "patient_email": patient_email,
        "doctor_email": doctor_email,
        "scheduled_at": request.scheduled_at,
        "duration_minutes": request.duration_minutes,
        "reason": request.reason,
        "status": "scheduled",
        "created_at": created_at,
        "organizer_id": user.id,
        "organizer_role": organizer_role,
        "meet_link": meet_link,
        "google_event_id": event_id,
        "google_event_link": event_link,
        "soap_note": None,
        "patient_explanation": None,
    }
    logger.info(
        f"Consultation scheduled: {room_id} at {request.scheduled_at} "
        f"(organizer={organizer_role} {user.id}, invite={invite_status})"
    )
    return ScheduledMeetingResponse(
        room_id=room_id,
        session_id=session_id,
        doctor_name=doctor_name,
        patient_name=patient_name,
        patient_email=patient_email,
        doctor_email=doctor_email,
        scheduled_at=request.scheduled_at,
        duration_minutes=request.duration_minutes,
        reason=request.reason,
        status="scheduled",
        created_at=created_at,
        organizer_role=organizer_role,
        meet_link=meet_link,
        google_event_id=event_id,
        google_event_link=event_link,
        google_invite_status=invite_status,
        google_invite_error=invite_error,
    )


@router.get("/scheduled")
async def list_scheduled():
    """Return all scheduled (not yet started) or upcoming consultations, sorted by scheduled time."""
    items = []
    for room_id, room in _rooms.items():
        if not room.get("scheduled_at"):
            continue
        items.append({
            "room_id": room_id,
            "session_id": room["session_id"],
            "doctor_name": room["doctor_name"],
            "patient_name": room["patient_name"],
            "patient_email": room.get("patient_email"),
            "doctor_email": room.get("doctor_email"),
            "scheduled_at": room["scheduled_at"],
            "duration_minutes": room.get("duration_minutes", 30),
            "reason": room.get("reason", ""),
            "status": room["status"],
            "created_at": room.get("created_at", ""),
            "organizer_role": room.get("organizer_role"),
            "meet_link": room.get("meet_link"),
            "google_event_link": room.get("google_event_link"),
        })
    items.sort(key=lambda x: x["scheduled_at"])
    return {"meetings": items}


@router.get("/room/{room_id}")
async def get_room_info(room_id: str):
    """Return current room status (used by patient to verify the room before joining)."""
    if room_id not in _rooms:
        raise HTTPException(404, "Room not found")
    room = _rooms[room_id]
    return {
        "room_id": room_id,
        "session_id": room["session_id"],
        "doctor_name": room["doctor_name"],
        "patient_name": room["patient_name"],
        "status": room["status"],
        "doctor_connected": room["doctor_ws"] is not None,
        "patient_connected": room["patient_ws"] is not None,
        "scheduled_at": room.get("scheduled_at"),
        "duration_minutes": room.get("duration_minutes"),
        "reason": room.get("reason"),
    }


@router.post("/export-soap-pdf/{room_id}")
async def export_soap_pdf(
    room_id: str,
    _user: User = Depends(require_role("doctor")),
):
    """Generate and return a SOAP note PDF for the doctor."""
    if room_id not in _rooms:
        raise HTTPException(404, "Room not found")
    room = _rooms[room_id]
    soap_dict = room.get("soap_note")
    if not soap_dict:
        raise HTTPException(400, "SOAP note not yet generated. End the call first.")

    pdf_bytes = generate_soap_pdf(
        soap_note=soap_dict,
        patient_name=room.get("patient_name", "Anonymous Patient"),
        doctor_name=room.get("doctor_name", "Attending Physician"),
        session_id=room.get("session_id"),
    )
    if not pdf_bytes:
        raise HTTPException(500, "PDF generation failed")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="consultation_soap_note.pdf"'},
    )


@router.post("/export-patient-pdf/{room_id}")
async def export_patient_pdf(
    room_id: str,
    _user: User = Depends(get_current_user),
):
    """Generate and return a patient-friendly consultation summary PDF."""
    if room_id not in _rooms:
        raise HTTPException(404, "Room not found")
    room = _rooms[room_id]
    explanation = room.get("patient_explanation")
    if not explanation:
        raise HTTPException(400, "Patient explanation not yet generated. End the call first.")

    pdf_bytes = generate_consultation_patient_pdf(
        explanation=explanation,
        patient_name=room.get("patient_name", "Anonymous Patient"),
        doctor_name=room.get("doctor_name", "Attending Physician"),
        session_id=room.get("session_id"),
    )
    if not pdf_bytes:
        raise HTTPException(500, "PDF generation failed")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="consultation_patient_guide.pdf"'},
    )


# ── WebSocket endpoint ─────────────────────────────────────────────────────

@router.websocket("/ws/{room_id}")
async def consultation_websocket(
    websocket: WebSocket,
    room_id: str,
    role: str = "patient",
):
    """
    Dual-purpose WebSocket per participant:
    - text frames : WebRTC signaling (offer/answer/ICE) + control (end-call, stop-audio)
    - binary frames: audio chunks from the participant's microphone → live transcription
    """
    await websocket.accept()

    if room_id not in _rooms:
        await websocket.send_json({"type": "error", "message": "Room not found"})
        await websocket.close()
        return

    room = _rooms[room_id]
    role_key = "doctor_ws" if role == "doctor" else "patient_ws"
    other_key = "patient_ws" if role == "doctor" else "doctor_ws"

    # Register this connection
    room[role_key] = websocket
    logger.info(f"[{room_id}] {role} connected")

    # Acknowledge connection
    await websocket.send_json({
        "type": "connected",
        "role": role,
        "room_id": room_id,
        "session_id": room["session_id"],
        "doctor_name": room["doctor_name"],
        "patient_name": room["patient_name"],
    })

    # If both participants are now connected, trigger WebRTC negotiation
    if room["doctor_ws"] and room["patient_ws"]:
        room["status"] = "active"
        for ws in (room["doctor_ws"], room["patient_ws"]):
            try:
                await ws.send_json({"type": "peer-ready"})
            except Exception:
                pass

    audio_buffer = bytearray()

    try:
        while True:
            data = await websocket.receive()

            # ── Audio chunk → accumulate → transcribe ──
            if "bytes" in data and data["bytes"]:
                audio_buffer.extend(data["bytes"])
                if len(audio_buffer) >= 80_000:
                    chunk = bytes(audio_buffer)
                    audio_buffer.clear()
                    asyncio.create_task(
                        _transcribe_and_broadcast(chunk, role, room_id, room)
                    )

            # ── JSON control / signaling ──
            elif "text" in data:
                msg: dict = json.loads(data["text"])
                msg_type: str = msg.get("type", "")

                if msg_type in ("offer", "answer", "ice-candidate"):
                    # Relay WebRTC signaling to the other participant
                    other_ws: Optional[WebSocket] = room.get(other_key)
                    if other_ws:
                        try:
                            await other_ws.send_json(msg)
                        except Exception:
                            pass

                elif msg_type == "stop-audio":
                    # Flush remaining audio buffer before ending
                    if audio_buffer:
                        chunk = bytes(audio_buffer)
                        audio_buffer.clear()
                        await _transcribe_and_broadcast(chunk, role, room_id, room)

                elif msg_type == "end-call":
                    await _handle_end_call(room_id, room, role, websocket)
                    break

    except WebSocketDisconnect:
        logger.info(f"[{room_id}] {role} disconnected")
    except Exception as exc:
        logger.error(f"[{room_id}] WebSocket error ({role}): {exc}", exc_info=True)
    finally:
        room[role_key] = None
        other_ws: Optional[WebSocket] = room.get(other_key)
        if other_ws:
            try:
                await other_ws.send_json({"type": "peer-disconnected", "role": role})
            except Exception:
                pass


# ── Internal helpers ───────────────────────────────────────────────────────

async def _transcribe_and_broadcast(
    audio_bytes: bytes, role: str, room_id: str, room: dict
) -> None:
    """Transcribe one audio chunk and push the labeled segment to all room participants."""
    try:
        result = await transcribe_audio(audio_bytes, settings.whisper_model)
        text = result.get("text", "").strip()
        if not text or "<silence>" in text.lower():
            return

        segment = {
            "speaker": "DOCTOR" if role == "doctor" else "PATIENT",
            "text": text,
            "timestamp": datetime.utcnow().isoformat(),
            "confidence": 0.92,
        }
        room["transcript"].append(segment)

        msg = {"type": "transcript_segment", "data": segment}
        for ws in (room.get("doctor_ws"), room.get("patient_ws")):
            if ws:
                try:
                    await ws.send_json(msg)
                except Exception:
                    pass
    except Exception as exc:
        logger.error(f"[{room_id}] Transcription error ({role}): {exc}")


async def _handle_end_call(
    room_id: str, room: dict, role: str, websocket: WebSocket
) -> None:
    """
    On call end:
    1. Notify the other participant.
    2. Run NER + SOAP generation + patient-friendly explanation.
    3. Push results back to both parties.
    """
    room["status"] = "ended"

    # Notify other participant immediately
    other_key = "patient_ws" if role == "doctor" else "doctor_ws"
    other_ws: Optional[WebSocket] = room.get(other_key)
    if other_ws:
        try:
            await other_ws.send_json({"type": "call-ended"})
        except Exception:
            pass

    transcript = room.get("transcript", [])
    if not transcript:
        await websocket.send_json({
            "type": "post-call-ready",
            "error": "No transcript was recorded.",
            "transcript": [],
            "session_id": room["session_id"],
        })
        return

    # Inform the doctor that processing has started
    try:
        await websocket.send_json({
            "type": "processing",
            "message": "Generating AI notes from your consultation...",
        })
    except Exception:
        pass

    try:
        # NER
        full_text = " ".join(seg["text"] for seg in transcript)
        entities_raw = extract_medical_entities(full_text)

        # Format labeled transcript
        labeled_text = "\n".join(
            f"[{seg['speaker']}]: {seg['text']}" for seg in transcript
        )

        # SOAP note
        soap_dict = await generate_soap_note(
            labeled_transcript=labeled_text,
            symptoms=entities_raw.get("symptoms", []),
            medications=entities_raw.get("medications", []),
            diagnoses=entities_raw.get("diagnoses", []),
            vitals=entities_raw.get("vitals", []),
        )
        room["soap_note"] = soap_dict

        # Patient-friendly explanation
        patient_explanation = await generate_patient_explanation(
            soap_dict=soap_dict,
            patient_name=room.get("patient_name", "Patient"),
            doctor_name=room.get("doctor_name", "Doctor"),
        )
        room["patient_explanation"] = patient_explanation

        # Send full results to the call-ender (usually doctor)
        await websocket.send_json({
            "type": "post-call-ready",
            "soap_note": soap_dict,
            "patient_explanation": patient_explanation,
            "transcript": transcript,
            "session_id": room["session_id"],
        })

        # Send patient-facing results to the other participant
        if other_ws:
            try:
                await other_ws.send_json({
                    "type": "post-call-ready",
                    "patient_explanation": patient_explanation,
                    "transcript": transcript,
                    "session_id": room["session_id"],
                })
            except Exception:
                pass

    except Exception as exc:
        logger.error(f"[{room_id}] Post-call processing failed: {exc}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Post-call AI processing failed: {exc}",
            })
        except Exception:
            pass
