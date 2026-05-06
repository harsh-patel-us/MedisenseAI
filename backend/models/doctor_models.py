"""
doctor_models.py — Pydantic models for doctor-side API
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class TranscriptSegment(BaseModel):
    speaker: str  # "DOCTOR" | "PATIENT"
    text: str
    start: float
    end: float
    confidence: Optional[float] = None


class SoapNoteSubjective(BaseModel):
    chief_complaint: str = ""
    history_of_present_illness: str = ""
    review_of_systems: str = ""
    patient_reported_medications: str = ""


class SoapNoteObjective(BaseModel):
    vitals: str = ""
    physical_examination: str = ""
    relevant_findings: str = ""


class SoapNoteAssessment(BaseModel):
    primary_diagnosis: str = ""
    differential_diagnoses: str = ""
    clinical_impression: str = ""


class SoapNotePlan(BaseModel):
    investigations_ordered: str = ""
    medications_prescribed: str = ""
    referrals: str = ""
    patient_instructions: str = ""
    follow_up: str = ""


class SoapNote(BaseModel):
    subjective: SoapNoteSubjective = Field(default_factory=SoapNoteSubjective)
    objective: SoapNoteObjective = Field(default_factory=SoapNoteObjective)
    assessment: SoapNoteAssessment = Field(default_factory=SoapNoteAssessment)
    plan: SoapNotePlan = Field(default_factory=SoapNotePlan)


class MedicalEntities(BaseModel):
    symptoms: List[str] = []
    medications: List[str] = []
    diagnoses: List[str] = []
    vitals: List[str] = []
    allergies: List[str] = []


class GenerateNoteRequest(BaseModel):
    transcript: List[TranscriptSegment]
    session_id: str


class GenerateNoteResponse(BaseModel):
    soap_note: SoapNote
    entities: MedicalEntities
    session_id: str


class ExportPdfRequest(BaseModel):
    soap_note: SoapNote
    patient_name: Optional[str] = "Anonymous Patient"
    doctor_name: Optional[str] = "Attending Physician"
    session_id: Optional[str] = None


class SessionSummary(BaseModel):
    id: str
    created_at: str
    doctor_name: Optional[str]
    patient_identifier: Optional[str]
    status: str


class UploadAudioResponse(BaseModel):
    session_id: str
    transcript: List[TranscriptSegment]
    raw_text: str


class DoctorChatActiveSession(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    started_at: str
    title: Optional[str]
    doctor_joined: bool
    specialty: Optional[str] = None
    specialty_name: Optional[str] = None


class DoctorChatListItem(BaseModel):
    """One row in the doctor's "Patient Chats" sidebar."""
    id: str
    patient_id: str
    patient_name: str
    started_at: str
    ended_at: Optional[str] = None
    title: Optional[str] = None
    specialty: Optional[str] = None
    specialty_name: Optional[str] = None
    session_mode: str  # "ai" | "doctor"
    last_message_at: Optional[str] = None
    last_message_preview: Optional[str] = None
    last_message_sender: Optional[str] = None  # "ai" | "doctor" | "patient"


class DoctorChatListResponse(BaseModel):
    items: List[DoctorChatListItem]


class DoctorChatMessageRequest(BaseModel):
    message: str
