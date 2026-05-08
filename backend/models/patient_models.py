"""
patient_models.py — Pydantic models for patient-side API
"""
from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class UrgencyLevel(str, Enum):
    routine = "routine"
    within_1_week = "within_1_week"
    go_today = "go_today"


class Finding(BaseModel):
    test_name: str
    patient_value: str
    unit: str = ""
    reference_range: str = ""
    status: str  # "low" | "high" | "normal"
    flag: bool = False


class Specialist(BaseModel):
    type: str
    reason: str
    priority: int = 1


class DietItem(BaseModel):
    food: str
    reason: str
    how_much: Optional[str] = None


class AvoidItem(BaseModel):
    food: str
    reason: str


class ExerciseItem(BaseModel):
    activity: str
    duration: str
    frequency: str
    benefit: str
    caution: Optional[str] = None


class DietPlan(BaseModel):
    foods_to_eat: List[DietItem] = []
    foods_to_avoid: List[AvoidItem] = []
    meal_timing_tips: str = ""


class Precautions(BaseModel):
    daily_habits: List[str] = []
    lifestyle_warnings: List[str] = []
    emergency_signs: List[str] = []


class MedicationAlert(BaseModel):
    """One pairwise drug-drug interaction surfaced for this patient."""
    id: str
    drug_a: str
    drug_b: str
    severity: str  # "contraindicated" | "major" | "moderate" | "minor"
    description: str = ""


class PatientAnalysis(BaseModel):
    report_type: str = "other"
    findings: List[Finding] = []
    conditions_suggested: List[str] = []
    critical_alerts: List[str] = []
    plain_summary: str = ""
    what_this_means: str = ""
    specialists: List[Specialist] = []
    urgency: UrgencyLevel = UrgencyLevel.routine
    urgency_reason: str = ""
    diet_plan: DietPlan = DietPlan()
    exercise_plan: List[ExerciseItem] = []
    exercises_to_avoid: List[str] = []
    precautions: Precautions = Precautions()
    # Drug-drug interaction alerts already on file for this patient at the
    # moment the analysis returned. The report's own medication extraction
    # runs in the background, so newly-extracted drugs may show up on the
    # next call to /medications/{patient_id}/interactions.
    medication_alerts: List[MedicationAlert] = []


class UploadResponse(BaseModel):
    file_id: str
    file_name: str
    raw_text: str
    file_type: str
    char_count: int


class AnalyzeRequest(BaseModel):
    file_id: str
    raw_text: str


class ExportPdfRequest(BaseModel):
    analysis_result: PatientAnalysis
    patient_name: Optional[str] = "Anonymous Patient"
    file_id: Optional[str] = None


# ── Patient history ───────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    """One row in /patient/history — light enough for a sidebar/list."""
    id: str
    created_at: str
    file_name: str = ""
    file_type: str = ""
    file_size: Optional[int] = None
    summary: str = ""
    urgency: str = ""
    has_uploaded_file: bool = False
    has_generated_pdf: bool = False
    generated_pdf_size: Optional[int] = None


class HistoryListResponse(BaseModel):
    patient_id: str
    items: List[HistoryItem] = []


class BiomarkerReading(BaseModel):
    """One quantitative reading for a single biomarker on a single report."""
    id: str
    biomarker_name: str
    value: float
    unit: str = ""
    reference_min: Optional[float] = None
    reference_max: Optional[float] = None
    status: str = "normal"  # "normal" | "low" | "high" | "critical"
    report_date: Optional[str] = None
    created_at: Optional[str] = None
    analysis_record_id: Optional[str] = None


class BiomarkerTrend(BaseModel):
    """Time-series of one biomarker for a patient, plus trend metadata."""
    biomarker_name: str
    unit: str = ""
    reference_min: Optional[float] = None
    reference_max: Optional[float] = None
    latest_value: Optional[float] = None
    previous_value: Optional[float] = None
    latest_status: str = "normal"
    # "improving" | "worsening" | "stable" | "new"
    trend: str = "new"
    percent_change: Optional[float] = None
    history: List[BiomarkerReading] = []


class BiomarkerTrendResponse(BaseModel):
    patient_id: str
    biomarkers: List[BiomarkerTrend] = []


class HistoryDetail(BaseModel):
    """Full payload for a single past analysis — drives the re-render."""
    id: str
    created_at: str
    file_name: str = ""
    file_type: str = ""
    file_size: Optional[int] = None
    summary: str = ""
    urgency: str = ""
    findings: list = []
    specialists: list = []
    diet_plan: dict = {}
    exercise_plan: list = []
    precautions: dict = {}
    has_uploaded_file: bool = False
    has_generated_pdf: bool = False
    generated_pdf_size: Optional[int] = None
