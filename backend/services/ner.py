"""
ner.py — Medical Named Entity Recognition (regex-based)

Pure regex keyword matching for extracting symptoms, medications,
diagnoses, and vitals from consultation transcripts. No local models
are downloaded or loaded — all pattern matching runs on plain Python regex.
"""
import re
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

# ── Regex keyword lists ───────────────────────────────────────────────────
SYMPTOM_KEYWORDS = [
    r"\bpain\b", r"\bache\b", r"\bfever\b", r"\bcough\b", r"\bdyspnea\b",
    r"\bshortness of breath\b", r"\bnausea\b", r"\bvomiting\b", r"\bdizziness\b",
    r"\bfatigue\b", r"\bweakness\b", r"\bswelling\b", r"\brash\b", r"\bheadache\b",
    r"\bchest (pain|tightness|pressure)\b", r"\bpalpitation\b", r"\bsyncope\b",
    r"\bchills\b", r"\bsweating\b", r"\bloss of (appetite|weight)\b",
]

MEDICATION_KEYWORDS = [
    r"\bmetformin\b", r"\binsulin\b", r"\bamlodipine\b", r"\batorvastatin\b",
    r"\baspirin\b", r"\bibuprofen\b", r"\bparacetamol\b", r"\bamoxicillin\b",
    r"\bomeprazole\b", r"\bramipril\b", r"\bbisoprolol\b", r"\bwarfarin\b",
    r"\blevothyroxine\b", r"\bmetoprolol\b", r"\blisinopril\b",
]

DIAGNOSIS_KEYWORDS = [
    r"\bdiabetes\b", r"\bhypertension\b", r"\banemia\b", r"\banaemia\b",
    r"\bhypothyroidism\b", r"\bCAD\b", r"\bangina\b", r"\bCOPD\b", r"\basthma\b",
    r"\bheart failure\b", r"\bstroke\b", r"\barrhythmia\b", r"\bATRIAL FIBRILLATION\b",
    r"\bgastritis\b", r"\bGERD\b", r"\bdepression\b", r"\banxiety\b",
    r"\bachest pain\b", r"\bpneumonia\b", r"\bUTI\b",
]

VITALS_PATTERN = re.compile(
    r"(?:BP|blood pressure|pulse|heart rate|temp(?:erature)?|SpO2|RR|respiration)[:\s]+"
    r"[\d/\.\s]+(?:mmHg|bpm|°[CF]|%|breaths)?",
    re.IGNORECASE,
)


def _regex_extract(text: str, patterns: list) -> List[str]:
    found = set()
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            found.add(match.group(0).strip().lower())
    return sorted(found)


def extract_medical_entities(text: str) -> Dict[str, List[str]]:
    """Extract medical entities using regex keyword matching.

    Returns dict with keys: symptoms, medications, diagnoses, vitals, allergies.
    """
    vitals = [m.group(0).strip() for m in VITALS_PATTERN.finditer(text)]
    return {
        "symptoms": _regex_extract(text, SYMPTOM_KEYWORDS),
        "medications": _regex_extract(text, MEDICATION_KEYWORDS),
        "diagnoses": _regex_extract(text, DIAGNOSIS_KEYWORDS),
        "vitals": vitals,
        "allergies": [],
    }
