"""
database.py — Async database setup via SQLAlchemy.
Supports both PostgreSQL (Neon / Supabase) and SQLite (local dev).
"""
import json
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import Float, Index, Text, String, DateTime, ForeignKey, Integer, LargeBinary, func
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)


# ── Build the async connection URL ───────────────────────────────────────
def _make_async_url(raw_url: str) -> str:
    """Convert a plain DB URL into an asyncio-compatible SQLAlchemy URL.

    • ``sqlite:///...``      → ``sqlite+aiosqlite:///...``
    • ``postgresql://...``   → ``postgresql+asyncpg://...``
    • ``postgres://...``     → ``postgresql+asyncpg://...``   (Neon / Heroku style)
    • Already async URLs are passed through unchanged.

    Also converts ``sslmode=require`` → ``ssl=require`` because asyncpg uses
    the ``ssl`` parameter, not ``sslmode``.
    """
    url = raw_url.strip()

    # Already has an async driver
    if "+asyncpg" in url or "+aiosqlite" in url:
        # Still fix sslmode even if driver is already set
        return url.replace("sslmode=", "ssl=")

    # PostgreSQL variants
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("sqlite:///"):
        # Plain SQLite
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

    # asyncpg uses `ssl=` not `sslmode=`
    url = url.replace("sslmode=", "ssl=")

    return url


_async_url = _make_async_url(settings.database_url)
# Log the sanitized URL for debugging DNS issues
_sanitized_url = _async_url.split("@")[-1] if "@" in _async_url else _async_url
logger.info(f"Connecting to database: ...@{_sanitized_url}")
_is_postgres = "postgresql" in _async_url or "postgres" in _async_url

# Connection arguments
_connect_args: dict = {}
if not _is_postgres:
    # SQLite-specific: allow multi-threaded access for dev
    _connect_args = {"check_same_thread": False}

engine = create_async_engine(
    _async_url,
    echo=False,
    connect_args=_connect_args,
    # Connection pool settings suitable for serverless (Vercel) and dev
    pool_pre_ping=True,
    pool_recycle=300,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # "doctor" | "patient"

    # For doctors: the medical specialty they cover (id from
    # services.specialties). Patients leave this NULL. Used to filter
    # /doctor/active-chats to chats whose patient picked this specialty.
    specialty: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Profile Information ──────────────────────────────────────────────
    phone_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Profile picture stored in-row for portability.
    profile_pic_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    profile_pic_mime: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Common medical/personal fields
    date_of_birth: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    blood_group: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Patient-facing UI language. Doctors keep English on the SOAP-note
    # workflow regardless of this field; it only steers patient-side AI
    # output (chatbot replies, report analysis, lifestyle guide, PDFs).
    preferred_language: Mapped[str] = mapped_column(String, default="en")

    # ── Google Calendar OAuth ────────────────────────────────────────────
    # Populated when the user connects their Google account on the schedule
    # page. Used to insert calendar events (with Google Meet links) on their
    # behalf when they organize a consultation. Refresh token survives across
    # access-token expiries; we only re-prompt the user if it is revoked.
    google_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    google_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    google_token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    google_scopes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ConsultationSession(Base):
    __tablename__ = "consultation_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    doctor_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )
    doctor_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    patient_identifier: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    patient_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    labeled_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    extracted_entities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON
    soap_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)             # JSON
    # Async second-opinion clinical audit of the SOAP note. Stored as the
    # raw JSON string returned by the audit prompt; the GET audit endpoint
    # parses it into a structured response. NULL means the audit task is
    # still running (or failed and was swallowed).
    soap_audit: Mapped[Optional[str]] = mapped_column(Text, nullable=True)             # JSON
    soap_pdf_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    soap_pdf_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, default="in_progress")

    # ── Google Meet linkage ──────────────────────────────────────────────
    # Set by /meet/link-conference once the doctor has scheduled the call;
    # processing_status / processing_task_id track the async transcript →
    # diarization → NER → SOAP pipeline kicked off from /meet/process-transcript.
    meet_conference_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    processing_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    processing_task_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Scheduling fields (Google Calendar / Meet) ──────────────────────
    # Populated when a user schedules a consultation through /meet/schedule.
    # The Meet link is the only join surface; there is no in-app room.
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    patient_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    doctor_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    organizer_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )
    organizer_role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meet_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_event_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_event_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_invite_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_invite_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ChatbotSession(Base):
    """Persistent transcript for the website chatbot widget.

    Each visitor browser keeps a session_id in sessionStorage and replays it
    on every turn. The full conversation is stored as JSON on `messages` so
    we don't need a per-message child table for what is essentially append-only.
    """
    __tablename__ = "chatbot_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    messages: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list


class PatientAnalysisRecord(Base):
    __tablename__ = "patient_analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    patient_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )
    file_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    uploaded_file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    uploaded_file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Raw bytes of the file the patient uploaded (PDF / image). Stored in-row
    # so downloads survive container restarts and don't depend on /tmp.
    uploaded_file_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    findings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # JSON
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specialists: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # JSON
    urgency: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    diet_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)      # JSON
    exercise_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    precautions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # JSON
    generated_pdf_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    generated_pdf_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Raw bytes of the AI-generated health-guide PDF. Same rationale as above.
    generated_pdf_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)


class PatientChatSession(Base):
    """A single chat session between a patient and Medisense AI.

    A `session_summary` paragraph is generated by the LLM after every 10
    messages and again when the session is explicitly ended, so future
    sessions can replay a compact memory of past conversations.
    """
    __tablename__ = "patient_chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Short, human-readable title — auto-set from the first user turn so the
    # sidebar can show something more meaningful than "Apr 28, 5:16 PM" before
    # the agent has produced a summary.
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    session_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    last_summary_at_count: Mapped[int] = mapped_column(Integer, default=0)
    doctor_joined: Mapped[bool] = mapped_column(Integer, default=False)  # Using Integer for boolean cross-db compatibility

    # Specialty the patient picked when starting this chat (id from
    # services.specialties). Drives the AI's role-play system prompt and
    # routes the session to doctors of the matching specialty.
    specialty: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # The specific doctor the patient chose. The AI plays this doctor's
    # role/specialty until the human takes over. Indexed so the doctor's
    # sidebar (listing all chats assigned to them) is cheap.
    assigned_doctor_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )

    # Authoritative live mode: "ai" (AI replies) or "doctor" (the assigned
    # doctor is replying directly). The legacy `doctor_joined` flag mirrors
    # this for backwards compatibility on existing read paths.
    session_mode: Mapped[str] = mapped_column(String, default="ai")

    __table_args__ = (
        Index("ix_patient_chat_sessions_patient_started", "patient_id", "started_at"),
    )


class PatientChatMessage(Base):
    """One message in a patient chat session (user or assistant).

    `message_metadata` is an opaque JSON column used for any extracted
    medical entities (symptoms, conditions, medications) we want to keep
    alongside the raw text for later analytics.
    """
    __tablename__ = "patient_chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("patient_chat_sessions.id"), nullable=False, index=True
    )
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String, nullable=False)  # "user" | "assistant" | "doctor"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    message_metadata: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    # JSON list of {filename, mime_type, size_bytes, kind: "image"|"pdf"} entries
    # describing files the patient attached on this turn. Raw bytes are not stored.
    file_references: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Canonical attribution. `sender_type` is one of "ai" | "doctor" | "patient".
    # `sender_id` is the user.id of the doctor or patient (NULL for AI). The
    # legacy `role` column is kept in sync for back-compat.
    sender_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sender_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_patient_chat_messages_session_created", "session_id", "created_at"),
        Index("ix_patient_chat_messages_patient_created", "patient_id", "created_at"),
    )


class PatientChatAttachment(Base):
    """Raw bytes of every file the patient has uploaded inside a chat session.

    Stored once per upload (not per turn) and scoped to the session so
    Medisense AI can recall the contents on later turns of the same
    conversation without the patient re-uploading. `extracted_text` holds the
    OCR / PDF text we already had to compute for the LLM, so subsequent
    look-ups don't rerun OCR.
    """
    __tablename__ = "patient_chat_attachments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("patient_chat_sessions.id"), nullable=False, index=True
    )
    message_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("patient_chat_messages.id"), nullable=True, index=True
    )
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    filename: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)  # "image" | "pdf"
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_patient_chat_attachments_session_created", "session_id", "created_at"),
    )


class DoctorChatSession(Base):
    """Junction row linking a doctor to a patient chat session.

    Created the moment the patient picks a doctor on the chat picker — that's
    what powers the doctor's "Patient Chats" sidebar. We keep this as a
    separate row (not just a FK on the session) so the doctor's listing query
    is index-only and we can later support handoffs to a different doctor
    by deactivating this row and creating a new one.
    """
    __tablename__ = "doctor_chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    doctor_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("patient_chat_sessions.id"), nullable=False, index=True
    )
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Integer, default=True)

    __table_args__ = (
        Index(
            "ix_doctor_chat_sessions_doctor_assigned",
            "doctor_id",
            "assigned_at",
        ),
    )


class PatientMedication(Base):
    """A medication a patient is currently (or was previously) taking.

    Rows are written by three sources: extraction from an uploaded
    prescription, extraction from a chatbot mention, and manual entry from
    the patient's medication tracker UI. Soft-delete is via `is_active`.
    """
    __tablename__ = "patient_medications"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    drug_name: Mapped[str] = mapped_column(String, nullable=False)
    dosage: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    prescribed_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Integer, default=True)
    # "prescription_upload" | "chatbot_mention" | "manual"
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_patient_medications_patient_active", "patient_id", "is_active"),
    )


class MedicationInteractionAlert(Base):
    """A pairwise drug-drug interaction surfaced for a patient.

    Each row represents one (drug_a, drug_b) pair the system has flagged.
    The patient (and downstream UI) can dismiss alerts they have already
    acknowledged so they don't keep re-appearing on every interaction check.
    """
    __tablename__ = "medication_interaction_alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    drug_a: Mapped[str] = mapped_column(String, nullable=False)
    drug_b: Mapped[str] = mapped_column(String, nullable=False)
    # "contraindicated" | "major" | "moderate" | "minor"
    severity: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False, default="openfda")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_dismissed: Mapped[bool] = mapped_column(Integer, default=False)

    __table_args__ = (
        Index(
            "ix_medication_alerts_patient_dismissed",
            "patient_id",
            "is_dismissed",
        ),
    )


class LabBiomarker(Base):
    """One quantitative biomarker reading extracted from a lab report.

    Multiple rows per analysis are normal — a single CBC produces a dozen
    readings. The (`patient_id`, `biomarker_name`, `report_date`) tuple is
    what the trends endpoint groups on, so we keep `biomarker_name`
    canonical (e.g. "HbA1c", not "A1C" / "Glycated Haemoglobin"); the
    extraction prompt is responsible for that normalization.
    """
    __tablename__ = "lab_biomarkers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    analysis_record_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("patient_analyses.id"), nullable=True, index=True
    )
    biomarker_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reference_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reference_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # "normal" | "low" | "high" | "critical"
    status: Mapped[str] = mapped_column(String, nullable=False, default="normal")
    # ISO-ish date string. Free text so we can store relative phrases the
    # report uses ("collected on 2026-04-12") without losing data.
    report_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index(
            "ix_lab_biomarkers_patient_name_date",
            "patient_id",
            "biomarker_name",
            "report_date",
        ),
    )


class FollowUpPlan(Base):
    """Patient-facing follow-up extracted from a SOAP note's Plan section.

    Created automatically as a background task after every SOAP note is
    persisted (both audio-upload and Meet-transcript flows). Doctors can
    download a patient-friendly PDF and optionally push a copy into the
    patient's Dr. MediSense chat history.
    """
    __tablename__ = "followup_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    consultation_session_id: Mapped[str] = mapped_column(
        String, ForeignKey("consultation_sessions.id"), nullable=False, index=True
    )
    # Best-effort link to the patient's user account. NULL when the doctor
    # uploaded audio for an offline patient — in that case the "Send to
    # Patient Chat" path is disabled by the UI and the API.
    patient_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True, index=True
    )
    # Free-text date or relative phrase ("In 6 weeks", "2026-08-15").
    follow_up_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    follow_up_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON list of strings.
    monitoring_items: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warning_signs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dietary_restrictions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    activity_restrictions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON list of {drug, dose, frequency} objects.
    medications_to_start: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    follow_up_specialist: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    patient_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_sent_to_patient: Mapped[bool] = mapped_column(Integer, default=False)


class PatientChatAudit(Base):
    """Append-only audit trail for every patient-chat API access."""
    __tablename__ = "patient_chat_audit"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(String, nullable=True)


async def init_db():
    """Create all tables. For existing databases, add any newly-introduced
    columns in an idempotent manner that works across both SQLite and PostgreSQL."""
    from sqlalchemy import text, inspect

    async with engine.begin() as conn:
        # Create tables that don't exist yet
        await conn.run_sync(Base.metadata.create_all)

        # Pick the right binary column type for the active dialect — Postgres
        # uses BYTEA, SQLite uses BLOB.
        binary_type = "BYTEA" if _is_postgres else "BLOB"

        # ── Idempotent column additions (works on both SQLite & PostgreSQL) ──
        # For each table, define columns that may have been added after the
        # initial schema. We introspect the live table to avoid duplicate
        # ADD COLUMN errors.
        new_columns: dict[str, list[tuple[str, str]]] = {
            "consultation_sessions": [
                ("doctor_id", "VARCHAR"),
                ("patient_name", "VARCHAR"),
                ("soap_audit", "TEXT"),
                ("soap_pdf_path", "VARCHAR"),
                ("soap_pdf_size", "INTEGER"),
                ("meet_conference_id", "VARCHAR"),
                ("processing_status", "VARCHAR"),
                ("processing_task_id", "VARCHAR"),
                ("scheduled_at", "TIMESTAMP"),
                ("duration_minutes", "INTEGER"),
                ("reason", "TEXT"),
                ("patient_email", "VARCHAR"),
                ("doctor_email", "VARCHAR"),
                ("organizer_id", "VARCHAR"),
                ("organizer_role", "VARCHAR"),
                ("meet_link", "VARCHAR"),
                ("google_event_id", "VARCHAR"),
                ("google_event_link", "VARCHAR"),
                ("google_invite_status", "VARCHAR"),
                ("google_invite_error", "TEXT"),
            ],
            "patient_analyses": [
                ("patient_id", "VARCHAR"),
                ("uploaded_file_path", "VARCHAR"),
                ("uploaded_file_size", "INTEGER"),
                ("uploaded_file_data", binary_type),
                ("generated_pdf_path", "VARCHAR"),
                ("generated_pdf_size", "INTEGER"),
                ("generated_pdf_data", binary_type),
            ],
            "chatbot_sessions": [
                ("user_id", "VARCHAR"),
                ("message_count", "INTEGER DEFAULT 0"),
            ],
            "patient_chat_messages": [
                ("file_references", "TEXT"),
                ("sender_type", "VARCHAR"),
                ("sender_id", "VARCHAR"),
            ],
            "patient_chat_sessions": [
                ("title", "VARCHAR"),
                ("doctor_joined", "INTEGER DEFAULT 0"),
                ("specialty", "VARCHAR"),
                ("assigned_doctor_id", "VARCHAR"),
                ("session_mode", "VARCHAR DEFAULT 'ai'"),
            ],
            "users": [
                ("google_email", "VARCHAR"),
                ("google_refresh_token", "TEXT"),
                ("google_access_token", "TEXT"),
                ("google_token_expiry", "TIMESTAMP"),
                ("google_scopes", "TEXT"),
                ("specialty", "VARCHAR"),
                ("phone_number", "VARCHAR"),
                ("bio", "TEXT"),
                ("profile_pic_data", binary_type),
                ("profile_pic_mime", "VARCHAR"),
                ("date_of_birth", "TIMESTAMP"),
                ("gender", "VARCHAR"),
                ("blood_group", "VARCHAR"),
                ("address", "TEXT"),
                ("emergency_contact_name", "VARCHAR"),
                ("emergency_contact_phone", "VARCHAR"),
                ("preferred_language", "VARCHAR DEFAULT 'en'"),
            ],
        }

        def _get_existing_columns(sync_conn):
            """Use SQLAlchemy Inspector to get column names — works on all backends."""
            insp = inspect(sync_conn)
            result = {}
            for table_name in new_columns:
                try:
                    cols = insp.get_columns(table_name)
                    result[table_name] = {c["name"] for c in cols}
                except Exception:
                    result[table_name] = set()
            return result

        existing = await conn.run_sync(_get_existing_columns)

        for table, cols in new_columns.items():
            table_cols = existing.get(table, set())
            for col_name, col_type in cols:
                if col_name not in table_cols:
                    try:
                        await conn.execute(
                            text(f'ALTER TABLE "{table}" ADD COLUMN "{col_name}" {col_type}')
                        )
                        logger.info(f"Added column {table}.{col_name}")
                    except Exception as e:
                        # Column may already exist (race, or type mismatch with
                        # introspection cache). Log and continue.
                        logger.debug(f"Skipping {table}.{col_name}: {e}")


async def get_db():
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
