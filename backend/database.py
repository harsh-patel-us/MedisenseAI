"""
database.py — Async database setup via SQLAlchemy.
Supports both PostgreSQL (Neon / Supabase) and SQLite (local dev).
"""
import json
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import Index, Text, String, DateTime, ForeignKey, Integer, func
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


class PatientChatSession(Base):
    """A single chat session between a patient and Dr. MediSense.

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
    role: Mapped[str] = mapped_column(String, nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    message_metadata: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    # JSON list of {filename, mime_type, size_bytes, kind: "image"|"pdf"} entries
    # describing files the patient attached on this turn. Raw bytes are not stored.
    file_references: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_patient_chat_messages_session_created", "session_id", "created_at"),
        Index("ix_patient_chat_messages_patient_created", "patient_id", "created_at"),
    )


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

        # ── Idempotent column additions (works on both SQLite & PostgreSQL) ──
        # For each table, define columns that may have been added after the
        # initial schema. We introspect the live table to avoid duplicate
        # ADD COLUMN errors.
        new_columns: dict[str, list[tuple[str, str]]] = {
            "consultation_sessions": [
                ("doctor_id", "VARCHAR"),
                ("patient_name", "VARCHAR"),
                ("soap_pdf_path", "VARCHAR"),
                ("soap_pdf_size", "INTEGER"),
                ("meet_conference_id", "VARCHAR"),
                ("processing_status", "VARCHAR"),
                ("processing_task_id", "VARCHAR"),
            ],
            "patient_analyses": [
                ("patient_id", "VARCHAR"),
                ("uploaded_file_path", "VARCHAR"),
                ("uploaded_file_size", "INTEGER"),
                ("generated_pdf_path", "VARCHAR"),
                ("generated_pdf_size", "INTEGER"),
            ],
            "chatbot_sessions": [
                ("user_id", "VARCHAR"),
                ("message_count", "INTEGER DEFAULT 0"),
            ],
            "patient_chat_messages": [
                ("file_references", "TEXT"),
            ],
            "patient_chat_sessions": [
                ("title", "VARCHAR"),
            ],
            "users": [
                ("google_email", "VARCHAR"),
                ("google_refresh_token", "TEXT"),
                ("google_access_token", "TEXT"),
                ("google_token_expiry", "TIMESTAMP"),
                ("google_scopes", "TEXT"),
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
