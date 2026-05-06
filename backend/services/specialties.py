"""
specialties.py — Canonical list of medical specialties offered to patients
when they start a new MediSense AI chat.

The `id` is the stable key persisted on `PatientChatSession.specialty` and
`User.specialty` (for doctors). The `name` is the user-facing label, and
`description` powers the picker tile. The `system_role` line is what is
spliced into the system prompt so the AI plays that specialist.
"""
from typing import Optional


SPECIALTIES: list[dict[str, str]] = [
    {
        "id": "general_physician",
        "name": "General Physician",
        "description": "Everyday symptoms, fevers, infections, primary care.",
        "system_role": (
            "a board-certified General Physician who handles primary care, "
            "common infections, fevers, and overall wellbeing"
        ),
    },
    {
        "id": "cardiologist",
        "name": "Cardiologist",
        "description": "Heart, blood pressure, chest pain, palpitations.",
        "system_role": (
            "a board-certified Cardiologist who specialises in the heart, "
            "blood pressure, ECG interpretation, and cardiovascular disease"
        ),
    },
    {
        "id": "neurologist",
        "name": "Neurologist",
        "description": "Headaches, seizures, nerve pain, dizziness.",
        "system_role": (
            "a board-certified Neurologist who specialises in the brain, "
            "spinal cord, headaches, seizures, and disorders of the nervous system"
        ),
    },
    {
        "id": "dermatologist",
        "name": "Dermatologist",
        "description": "Skin, hair, nails, rashes, acne.",
        "system_role": (
            "a board-certified Dermatologist who specialises in the skin, hair, "
            "nails, rashes, acne, and visible skin conditions"
        ),
    },
    {
        "id": "pediatrician",
        "name": "Pediatrician",
        "description": "Infant, child, and adolescent health.",
        "system_role": (
            "a board-certified Pediatrician who specialises in the health of "
            "infants, children, and adolescents"
        ),
    },
    {
        "id": "gynecologist",
        "name": "Gynecologist",
        "description": "Women's reproductive and menstrual health.",
        "system_role": (
            "a board-certified Gynecologist who specialises in women's "
            "reproductive health, menstrual issues, and prenatal care"
        ),
    },
    {
        "id": "orthopedist",
        "name": "Orthopedist",
        "description": "Bones, joints, fractures, back pain.",
        "system_role": (
            "a board-certified Orthopedic specialist who treats bones, joints, "
            "fractures, sports injuries, and musculoskeletal pain"
        ),
    },
    {
        "id": "psychiatrist",
        "name": "Psychiatrist",
        "description": "Mental health, anxiety, depression, sleep.",
        "system_role": (
            "a board-certified Psychiatrist who treats mental-health conditions "
            "such as anxiety, depression, sleep disorders, and stress"
        ),
    },
    {
        "id": "endocrinologist",
        "name": "Endocrinologist",
        "description": "Diabetes, thyroid, hormones.",
        "system_role": (
            "a board-certified Endocrinologist who specialises in diabetes, "
            "thyroid disorders, and hormonal imbalances"
        ),
    },
    {
        "id": "gastroenterologist",
        "name": "Gastroenterologist",
        "description": "Stomach, liver, digestion, acidity.",
        "system_role": (
            "a board-certified Gastroenterologist who specialises in the "
            "stomach, intestines, liver, and digestive disorders"
        ),
    },
]

SPECIALTY_IDS: set[str] = {s["id"] for s in SPECIALTIES}


def get_specialty(specialty_id: Optional[str]) -> Optional[dict[str, str]]:
    """Return the specialty entry by id, or None if unknown / missing."""
    if not specialty_id:
        return None
    for s in SPECIALTIES:
        if s["id"] == specialty_id:
            return s
    return None


def specialty_name(specialty_id: Optional[str]) -> str:
    """Human-readable name for a specialty id, with a sensible fallback."""
    s = get_specialty(specialty_id)
    return s["name"] if s else "MediSense AI"
