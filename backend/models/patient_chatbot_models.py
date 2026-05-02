"""
patient_chatbot_models.py — Pydantic schemas for the patient-side persistent
medical chatbot ("Medisense AI").
"""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


ChatRole = Literal["user", "assistant"]
AttachmentKind = Literal["image", "pdf"]


class ChatAttachmentDTO(BaseModel):
    """One file attached to a patient chat turn (sent base64-encoded)."""
    filename: str = Field(..., max_length=200)
    mime_type: str = Field(..., max_length=80)
    # Raw base64 (no data: URI prefix). Capped to ~10 MB encoded which is
    # roughly 7.5 MB of binary content — within max_file_size_mb.
    data_base64: str = Field(..., max_length=14_000_000)
    kind: AttachmentKind


class ChatFileReference(BaseModel):
    """Persisted descriptor of an attachment that was sent on a turn.

    `attachment_id` points at the `PatientChatAttachment` row that holds
    the raw bytes + extracted text. The frontend can use it to fetch
    /patient/chat/attachment/{id} for re-download or preview.
    """
    filename: str
    mime_type: str
    size_bytes: int
    kind: AttachmentKind
    attachment_id: Optional[str] = None


class PatientChatMessageDTO(BaseModel):
    id: str
    role: ChatRole
    content: str
    created_at: datetime
    file_references: List[ChatFileReference] = Field(default_factory=list)


class PatientChatSessionSummary(BaseModel):
    id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    title: Optional[str] = None
    session_summary: Optional[str] = None
    message_count: int


class PatientChatRequest(BaseModel):
    """A turn from the patient.

    `message` is optional — if omitted (or empty) and no attachments are
    provided, the server treats this as a "give me my personalised welcome"
    request, creates a new session, and returns a greeting that already
    references the patient's history.
    """
    patient_id: str
    session_id: Optional[str] = None
    message: Optional[str] = Field(default=None, max_length=4000)
    attachments: List[ChatAttachmentDTO] = Field(default_factory=list)


class PatientChatResponse(BaseModel):
    session_id: str
    reply: str
    is_new_session: bool


class PatientChatHistoryResponse(BaseModel):
    patient_id: str
    sessions: List[PatientChatSessionSummary]


class PatientChatSessionMessagesResponse(BaseModel):
    session_id: str
    patient_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    session_summary: Optional[str] = None
    messages: List[PatientChatMessageDTO]


class EndSessionRequest(BaseModel):
    patient_id: str
    session_id: str


class EndSessionResponse(BaseModel):
    session_id: str
    ended_at: datetime
    summary_generated: bool


# ── Voice (Sarvam STT + TTS) ─────────────────────────────────────────────


class PatientVoiceMessageRequest(BaseModel):
    """Audio captured from the patient's mic, sent base64-encoded."""
    patient_id: str
    mime_type: str = Field(default="audio/webm", max_length=80)
    audio_base64: str = Field(..., max_length=20_000_000)


class PatientVoiceMessageResponse(BaseModel):
    transcript: str
    language: Optional[str] = None
    provider: str  # "sarvam" | "gemini" | "none"


class PatientTTSRequest(BaseModel):
    text: str = Field(..., max_length=4000)
    language_code: Optional[str] = Field(default=None, max_length=10)
    speaker: Optional[str] = Field(default=None, max_length=40)


class PatientTTSResponse(BaseModel):
    audio_base64: str
    mime_type: str  # "audio/wav" or "" when synthesis skipped
    provider: str   # "sarvam" | "none"
    language: Optional[str] = None
    speaker: Optional[str] = None
