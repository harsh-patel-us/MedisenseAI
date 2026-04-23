"""
doctor.py — Doctor-side API router
WS  /doctor/stream-audio   → Whisper STT + diarization, streams transcript segments
POST /doctor/generate-note → NER + AI SOAP note generation
POST /doctor/export-pdf    → SOAP note PDF
GET  /doctor/sessions      → Past consultation sessions
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from config import settings
from models.doctor_models import (
    GenerateNoteRequest, GenerateNoteResponse,
    SoapNote, MedicalEntities, ExportPdfRequest, SessionSummary
)
from services.transcription import transcribe_audio
from services.diarization import diarize
from services.ner import extract_medical_entities
from services.claude_service import generate_soap_note
from services.pdf_export import generate_soap_pdf
from services.auth_service import require_role
from utils.helpers import generate_id, format_transcript_for_prompt
from database import get_db, ConsultationSession, User

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
                        labeled = diarize(chunk, segments, settings.hf_token)

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
                            labeled = diarize(remaining, segments, settings.hf_token)
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

    # Persist session
    session = ConsultationSession(
        id=request.session_id,
        labeled_transcript=json.dumps(transcript_dicts),
        extracted_entities=json.dumps(entities_raw),
        soap_note=json.dumps(soap_dict),
        status="completed",
    )
    db.add(session)
    await db.commit()

    return GenerateNoteResponse(
        soap_note=soap_note,
        entities=entities,
        session_id=request.session_id,
    )


@router.post("/export-pdf")
async def export_soap_pdf(
    request: ExportPdfRequest,
    _user: User = Depends(require_role("doctor")),
):
    """Generate and return a SOAP note PDF."""
    soap_dict = request.soap_note.model_dump()
    pdf_bytes = generate_soap_pdf(
        soap_note=soap_dict,
        patient_name=request.patient_name or "Anonymous Patient",
        doctor_name=request.doctor_name or "Attending Physician",
        session_id=request.session_id,
    )
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF generation failed.")

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
    """Return list of past consultation sessions (most recent first)."""
    result = await db.execute(
        select(ConsultationSession).order_by(ConsultationSession.created_at.desc()).limit(50)
    )
    sessions = result.scalars().all()
    return [
        SessionSummary(
            id=s.id,
            created_at=s.created_at.isoformat() if s.created_at else "",
            doctor_name=s.doctor_name,
            patient_identifier=s.patient_identifier,
            status=s.status,
        )
        for s in sessions
    ]
