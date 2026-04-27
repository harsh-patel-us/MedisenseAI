"""
database.py — SQLite async database setup via SQLAlchemy
"""
import json
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import Text, String, DateTime, ForeignKey, Integer, func
from typing import Optional

from config import settings

engine = create_async_engine(settings.database_url, echo=False)
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


async def init_db():
    """Create all tables on startup, and add newly introduced columns to
    pre-existing tables. SQLite won't ALTER an existing table via create_all,
    so we issue idempotent ADD COLUMN statements for the schema upgrade."""
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        new_columns = {
            "consultation_sessions": [
                ("doctor_id", "VARCHAR"),
                ("patient_name", "VARCHAR"),
                ("soap_pdf_path", "VARCHAR"),
                ("soap_pdf_size", "INTEGER"),
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
        }

        for table, cols in new_columns.items():
            existing_cols_result = await conn.execute(text(f"PRAGMA table_info({table})"))
            existing_cols = {row[1] for row in existing_cols_result.fetchall()}
            for col_name, col_type in cols:
                if col_name not in existing_cols:
                    await conn.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
                    )


async def get_db():
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
