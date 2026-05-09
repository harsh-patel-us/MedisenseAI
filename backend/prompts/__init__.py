"""
prompts — Loads all AI system prompts from .txt files in this directory.

Each prompt is stored as a plain-text file so non-developers (prompt engineers,
clinicians) can edit them without touching Python code. The module reads every
file once at import time and exposes the content as module-level constants.

Template placeholders like {patient_name} are preserved — callers use
`.format(...)` as before.
"""
from pathlib import Path

_DIR = Path(__file__).resolve().parent


def _load(filename: str) -> str:
    """Read a prompt text file and return its contents."""
    return (_DIR / filename).read_text(encoding="utf-8").strip()


# ── Prompt constants (same names as the old config.py exports) ───────────
PATIENT_EXPLANATION_PROMPT = _load("patient_explanation.txt")
CHATBOT_SYSTEM_PROMPT = _load("chatbot_system.txt")
PATIENT_CHATBOT_SYSTEM_PROMPT = _load("patient_chatbot_system.txt")
PATIENT_CHATBOT_SUMMARY_PROMPT = _load("patient_chatbot_summary.txt")
SAFETY_SYSTEM_MESSAGE = _load("safety_system.txt")
SOAP_NOTE_PROMPT = _load("soap_note.txt")
REPORT_ANALYSIS_PROMPT = _load("report_analysis.txt")
SUMMARY_SPECIALIST_PROMPT = _load("summary_specialist.txt")
LIFESTYLE_GUIDE_PROMPT = _load("lifestyle_guide.txt")
MEDICATION_EXTRACTION_PROMPT = _load("medication_extraction.txt")
MEDICATION_INTERACTION_PROMPT = _load("medication_interaction.txt")
ADHERENCE_REMINDER_PROMPT = _load("adherence_reminder.txt")
EMERGENCY_SCREENING_PROMPT = _load("emergency_screening.txt")
SOAP_AUDIT_PROMPT = _load("soap_audit.txt")
LANGUAGE_INSTRUCTION_TEMPLATE = _load("language_instruction.txt")
FOLLOWUP_EXTRACTION_PROMPT = _load("followup_extraction.txt")
BIOMARKER_EXTRACTION_PROMPT = _load("biomarker_extraction.txt")
INTAKE_SUMMARY_PROMPT = _load("intake_summary.txt")
WEARABLE_NARRATIVE_PROMPT = _load("wearable_narrative.txt")
