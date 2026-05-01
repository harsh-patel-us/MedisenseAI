"""
claude_service.py — All AI API calls via OpenRouter (OpenAI-compatible SDK)
Uses openai/gpt-4o-mini model through OpenRouter endpoint.
"""
import base64
import json
import logging
from openai import AsyncOpenAI

from config import settings
from prompts import (
    SAFETY_SYSTEM_MESSAGE,
    SOAP_NOTE_PROMPT,
    REPORT_ANALYSIS_PROMPT,
    SUMMARY_SPECIALIST_PROMPT,
    LIFESTYLE_GUIDE_PROMPT,
    PATIENT_EXPLANATION_PROMPT,
)
from utils.helpers import extract_json_from_response

logger = logging.getLogger(__name__)

# ── OpenRouter client (OpenAI-compatible) ──────────────────────────────────
_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            default_headers={
                "HTTP-Referer": "https://medisense.ai",
                "X-Title": "MediSense AI",
            },
        )
    return _client


async def _chat(system: str, user: str, model: str | None = None) -> str:
    """
    Internal helper — sends a chat completion request to OpenRouter
    and returns the text content of the first choice.
    """
    client = get_client()
    response = await client.chat.completions.create(
        model=model or settings.ai_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.1,
        max_tokens=4096,
    )
    return response.choices[0].message.content or ""


# ── Public service functions ───────────────────────────────────────────────

async def generate_soap_note(
    labeled_transcript: str,
    symptoms: list[str],
    medications: list[str],
    diagnoses: list[str],
    vitals: list[str],
) -> dict:
    """
    Prompt 1 — Given a labeled transcript and extracted entities,
    generate a structured SOAP clinical note as JSON.
    """
    prompt = SOAP_NOTE_PROMPT.format(
        labeled_transcript=labeled_transcript,
        symptoms=", ".join(symptoms) if symptoms else "None documented",
        medications=", ".join(medications) if medications else "None documented",
        diagnoses=", ".join(diagnoses) if diagnoses else "None documented",
        vitals=", ".join(vitals) if vitals else "None documented",
    )
    raw = await _chat(SAFETY_SYSTEM_MESSAGE, prompt)
    cleaned = extract_json_from_response(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"SOAP note JSON parse error: {e}\nRaw: {raw[:500]}")
        # Return a safe fallback
        return {
            "subjective": {
                "chief_complaint": "Unable to parse AI response — please regenerate.",
                "history_of_present_illness": "",
                "review_of_systems": "",
                "patient_reported_medications": "",
            },
            "objective": {"vitals": "", "physical_examination": "", "relevant_findings": ""},
            "assessment": {"primary_diagnosis": "", "differential_diagnoses": "", "clinical_impression": ""},
            "plan": {"investigations_ordered": "", "medications_prescribed": "", "referrals": "", "patient_instructions": "", "follow_up": ""},
        }


async def generate_patient_explanation(
    soap_dict: dict,
    patient_name: str = "Patient",
    doctor_name: str = "Doctor",
) -> dict:
    """
    Prompt 5 — Given a completed SOAP note, generate a patient-friendly
    consultation guide that explains the diagnosis, treatment, and next steps
    in plain, compassionate language. Uses the medical model for best accuracy.
    """
    prompt = PATIENT_EXPLANATION_PROMPT.format(
        soap_note_json=json.dumps(soap_dict, indent=2),
        patient_name=patient_name,
        doctor_name=doctor_name,
    )
    raw = await _chat(SAFETY_SYSTEM_MESSAGE, prompt, model=settings.medical_model)
    cleaned = extract_json_from_response(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error(f"Patient explanation JSON parse error: {exc}\nRaw: {raw[:500]}")
        return {
            "greeting": f"Dear {patient_name}, here is a summary of your consultation with Dr. {doctor_name}.",
            "what_was_found": {
                "diagnosis": "Please review the consultation notes with your doctor.",
                "in_simple_terms": "",
                "why_this_happened": "",
                "what_it_means_for_you": "",
            },
            "your_treatment": {"overview": "", "medications": [], "tests_ordered": []},
            "what_to_do_next": {
                "immediate_steps": [],
                "lifestyle_changes": [],
                "follow_up": "Please schedule a follow-up appointment with your doctor.",
                "when_to_seek_help_immediately": [
                    "Severe chest pain or difficulty breathing",
                    "Sudden weakness or confusion",
                ],
            },
            "reassurance": "Please follow up with your doctor if you have any questions or concerns.",
        }


async def extract_text_from_image_vision(image_bytes: bytes, mime: str = "image/png") -> str:
    """
    Vision-based OCR via OpenRouter. No local OCR binary required.
    Uses settings.vision_model (defaults to a vision-capable model such as
    openai/gpt-4o-mini). Returns the extracted text, or empty string on
    failure / no readable text.
    """
    if not image_bytes:
        logger.warning("Vision OCR: empty image bytes")
        return ""

    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/webp"):
        mime = "image/png"
    # OpenAI/OpenRouter expect 'image/jpeg' rather than 'image/jpg'
    if mime == "image/jpg":
        mime = "image/jpeg"

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_uri = f"data:{mime};base64,{b64}"

    system_msg = (
        "You are an OCR engine for medical documents. Your ONLY task is to "
        "transcribe every visible character in the image, exactly as it appears. "
        "Rules:\n"
        "1. Output the raw text only — no commentary, no markdown, no headings "
        "you invent.\n"
        "2. Preserve numbers, units (mg/dL, mmol/L, g/dL, %, etc.), reference "
        "ranges, dates, names, table rows, and line breaks.\n"
        "3. For tables, output each row on its own line, columns separated by "
        "spaces or pipes.\n"
        "4. Include EVERY value you can see, even if blurry — write your best "
        "guess; do not skip rows.\n"
        "5. If the image is genuinely blank or contains no characters at all, "
        "output exactly: NO_TEXT_FOUND"
    )

    client = get_client()
    model_to_use = settings.vision_model or settings.ai_model
    logger.info(
        f"Vision OCR: sending {len(image_bytes)} bytes ({mime}) to model={model_to_use}"
    )

    try:
        response = await client.chat.completions.create(
            model=model_to_use,
            messages=[
                {"role": "system", "content": system_msg},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Transcribe every visible word, number, and "
                                "symbol from this medical document image."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                },
            ],
            temperature=0.0,
            max_tokens=8192,
        )
        text = (response.choices[0].message.content or "").strip()
        logger.info(f"Vision OCR: extracted {len(text)} chars; preview={text[:200]!r}")

        if not text or text.upper().startswith("NO_TEXT_FOUND"):
            return ""
        return text
    except Exception as e:
        logger.error(f"Vision OCR failed: {e}", exc_info=True)
        return ""


async def analyze_report(raw_report_text: str) -> dict:
    """
    Prompt 2 — Extract all test findings from a lab report text.
    Returns structured findings JSON.
    """
    prompt = REPORT_ANALYSIS_PROMPT.format(raw_report_text=raw_report_text)
    raw = await _chat(SAFETY_SYSTEM_MESSAGE, prompt)
    cleaned = extract_json_from_response(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"Report analysis JSON parse error: {e}\nRaw: {raw[:500]}")
        return {"report_type": "other", "findings": [], "conditions_suggested": [], "critical_alerts": []}


async def generate_summary_and_specialists(findings_json: dict) -> dict:
    """
    Prompt 3 — Generate plain-language patient summary + specialist recommendations.
    """
    prompt = SUMMARY_SPECIALIST_PROMPT.format(
        findings_json=json.dumps(findings_json, indent=2)
    )
    raw = await _chat(SAFETY_SYSTEM_MESSAGE, prompt)
    cleaned = extract_json_from_response(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"Summary/Specialist JSON parse error: {e}\nRaw: {raw[:500]}")
        return {
            "plain_summary": "Unable to generate summary. Please try again.",
            "what_this_means": "",
            "specialists": [],
            "urgency": "routine",
            "urgency_reason": "",
        }


async def generate_lifestyle_guide(conditions: list[str], findings_summary: str) -> dict:
    """
    Prompt 4 — Generate diet, exercise, and precautions plan.
    """
    prompt = LIFESTYLE_GUIDE_PROMPT.format(
        conditions=", ".join(conditions) if conditions else "General health maintenance",
        findings_summary=findings_summary,
    )
    raw = await _chat(SAFETY_SYSTEM_MESSAGE, prompt)
    cleaned = extract_json_from_response(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"Lifestyle guide JSON parse error: {e}\nRaw: {raw[:500]}")
        return {
            "diet_plan": {"foods_to_eat": [], "foods_to_avoid": [], "meal_timing_tips": ""},
            "exercise_plan": [],
            "exercises_to_avoid": [],
            "precautions": {"daily_habits": [], "lifestyle_warnings": [], "emergency_signs": []},
        }
