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
