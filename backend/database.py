"""
database.py — SQLite async database setup via SQLAlchemy
"""
import json
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import Text, String, DateTime, func
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
    doctor_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    patient_identifier: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    labeled_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    extracted_entities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON
    soap_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)             # JSON
    status: Mapped[str] = mapped_column(String, default="in_progress")


class PatientAnalysisRecord(Base):
    __tablename__ = "patient_analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    file_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    findings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # JSON
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specialists: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # JSON
    urgency: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    diet_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)      # JSON
    exercise_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    precautions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # JSON


async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
