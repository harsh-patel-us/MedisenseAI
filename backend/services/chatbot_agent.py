"""
chatbot_agent.py — Multi-agent backend for the website chatbot widget.

Architecture (OpenAI Agents SDK):

    Triage Agent  ──handoff──►  Platform Support Agent
                  ──handoff──►  Health Info Agent

The triage agent receives every visitor turn, applies the global safety rules
(emergency shortcut, no diagnoses, etc.) and routes the request to a
specialist sub-agent. Specialist agents have their own focused tools.

LLM provider: OpenRouter (chat-completions endpoint), model openai/gpt-4o-mini.
Configured via `OpenAIChatCompletionsModel` so we never hit the Responses API
(which OpenRouter does not support).
"""
from __future__ import annotations

import logging
from typing import Any

from agents import (
    Agent,
    OpenAIChatCompletionsModel,
    Runner,
    function_tool,
    set_tracing_disabled,
)
from openai import AsyncOpenAI

from config import settings
from prompts import CHATBOT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# OpenAI tracing hits api.openai.com — turn it off for OpenRouter-only setups.
set_tracing_disabled(True)


# ── Tool data ────────────────────────────────────────────────────────────

PLATFORM_FEATURES: dict[str, str] = {
    "soap_notes": (
        "The doctor side records consultations and auto-generates a structured SOAP note "
        "(Subjective, Objective, Assessment, Plan). Editable in-app and exportable as PDF."
    ),
    "lab_report_analysis": (
        "Patients upload a PDF or image lab report. We extract the text (OCR if scanned) and "
        "return a plain-English summary, flagged abnormal values, a specialist recommendation, "
        "and a personalised diet / exercise / precautions plan."
    ),
    "video_consultation": (
        "Browser-native WebRTC video calls. The patient joins with a 6-character room code — no "
        "app install. Live transcription and SOAP generation work just like in-person visits."
    ),
    "pricing": (
        "Free for individual clinicians up to 20 consults/month. Clinic plans start at "
        "$79 per provider per month. See the Pricing page for full tier details."
    ),
    "ehr_integration": (
        "FHIR R4 integration with Epic, Cerner, athenahealth, DrChrono, and OpenEMR. "
        "One-click PDF export works with every other system."
    ),
    "security": (
        "Encryption in transit and at rest, HIPAA-aligned controls, and session data is "
        "auto-purged on close. See the Trust / Security page for the full posture."
    ),
    "supported_files": (
        "Patient uploads accept PDF, JPEG, and PNG up to 20 MB. Scanned documents are OCR'd "
        "automatically before analysis."
    ),
}

SPECIALIST_MAP: list[tuple[tuple[str, ...], str]] = [
    (("diabetes", "blood sugar", "hba1c", "hyperglyc"), "endocrinologist"),
    (("thyroid",), "endocrinologist"),
    (("heart", "cardiac", "chest pain", "blood pressure", "hypertension"), "cardiologist"),
    (("kidney", "renal"), "nephrologist"),
    (("liver", "hepatic", "jaundice"), "hepatologist or gastroenterologist"),
    (("lung", "asthma", "copd", "respiratory"), "pulmonologist"),
    (("skin", "rash", "acne", "eczema"), "dermatologist"),
    (("mental health", "anxiety", "depression"), "psychiatrist or therapist"),
    (("joint", "arthritis"), "rheumatologist"),
    (("bone", "fracture", "back pain"), "orthopedist"),
    (("eye", "vision"), "ophthalmologist"),
    (("ear", "hearing", "throat", "sinus"), "ENT specialist"),
    (("pregnan", "menstrual", "gyn"), "gynecologist"),
    (("child", "pediatric", "infant"), "pediatrician"),
]


# ── Tools (available to specialist sub-agents) ───────────────────────────

@function_tool
def lookup_feature(feature_name: str) -> str:
    """Look up a MediSense AI platform feature by name.

    Args:
        feature_name: One of: soap_notes, lab_report_analysis, video_consultation,
                      pricing, ehr_integration, security, supported_files.
    """
    key = feature_name.lower().strip().replace(" ", "_").replace("-", "_")
    info = PLATFORM_FEATURES.get(key)
    if info:
        return info
    return (
        f"No detailed info on '{feature_name}'. Available keys: "
        + ", ".join(PLATFORM_FEATURES.keys())
    )


@function_tool
def find_specialist(condition: str) -> str:
    """Recommend the type of medical specialist for a given condition or symptom area."""
    text = condition.lower()
    for keywords, specialist in SPECIALIST_MAP:
        if any(kw in text for kw in keywords):
            return f"For {condition}, an {specialist} is typically the right specialist."
    return (
        f"For {condition}, start with a General Physician — they can refer to the "
        "right specialist after an initial assessment."
    )


# ── Agent prompts ────────────────────────────────────────────────────────

PLATFORM_AGENT_INSTRUCTIONS = (
    "You are the MediSense AI Platform Support specialist. Answer questions about how the "
    "MediSense product works: doctor side (consultation recording, SOAP generation, video calls), "
    "patient side (lab report upload, summary, diet/exercise/specialist plan), pricing, EHR "
    "integrations, supported file types, and security/HIPAA posture.\n\n"
    "Use the `lookup_feature` tool whenever a question maps to a known feature key. Reply in "
    "2-4 short sentences, plain text only, no markdown headings or code fences. If a question "
    "is about personal medical advice, say it's outside your scope and recommend consulting a "
    "doctor — do NOT prescribe drugs or diagnose."
)

HEALTH_AGENT_INSTRUCTIONS = (
    "You are the MediSense AI Health Information specialist. Answer general health/biology "
    "questions in plain language a non-clinician can understand.\n\n"
    "Use the `find_specialist` tool when the user asks which kind of doctor to see for a "
    "condition. Reply in 2-4 short sentences, plain text only.\n\n"
    "HARD RULES:\n"
    "- Never prescribe drugs, give dosages, or make a definitive diagnosis.\n"
    "- End every health answer with: \"Remember to consult your doctor before making any "
    "health decisions.\"\n"
    "- If the user describes an emergency (chest pain, difficulty breathing, fainting, stroke "
    "signs, severe bleeding, suicidal thoughts), reply ONLY with: \"This sounds urgent. Please "
    "call emergency services (112 in India / 911 in US) or go to the nearest ER immediately. "
    "Do not wait.\""
)

OFF_TOPIC_REPLY = (
    "I can only help with medical questions or the MediSense AI platform. "
    "Try asking me about a health concern, a symptom, a medication category, "
    "which kind of doctor to see, or how MediSense works."
)

TRIAGE_INSTRUCTIONS = (
    CHATBOT_SYSTEM_PROMPT
    + "\n\nSCOPE — MEDICAL DOMAIN ONLY:\n"
    "You are a medical-domain support assistant. You may ONLY answer:\n"
    "  1. Questions about the MediSense AI platform itself (features, how to use it, pricing, "
    "security, integrations, supported file types).\n"
    "  2. General health, anatomy, biology, nutrition, fitness, medication categories, lab-test "
    "meaning, or 'which doctor should I see for X' questions.\n\n"
    "For ANYTHING ELSE (programming, recipes, weather, sports, news, math help, general "
    "knowledge, opinions, jokes, code, translations, etc.), do NOT hand off and do NOT try to "
    "help. Reply ONLY with this exact sentence and nothing else:\n"
    f"  \"{OFF_TOPIC_REPLY}\"\n"
    "Do not engage with off-topic questions even if the user insists or rephrases. Refuse the "
    "same way every time.\n\n"
    "ROUTING (only for in-scope questions):\n"
    "- Product / platform questions → hand off to the Platform Support agent.\n"
    "- General health, symptom, or 'which specialist' questions → hand off to the Health Info agent.\n"
    "- Greetings or small talk from a first-time visitor → answer directly in 1-2 short "
    "sentences and invite them to ask about the platform or a health topic."
)


# ── Agent factory (lazy, single-shot) ────────────────────────────────────

_triage_agent: Agent | None = None


def _build_model() -> OpenAIChatCompletionsModel:
    """Fresh chat-completions model bound to OpenRouter."""
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set — chatbot is unavailable.")
    client = AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        default_headers={
            "HTTP-Referer": "https://medisense.ai",
            "X-Title": "MediSense AI Chatbot",
        },
    )
    return OpenAIChatCompletionsModel(
        model=settings.chatbot_model,
        openai_client=client,
    )


def get_triage_agent() -> Agent:
    """Lazily construct the agent graph on first use."""
    global _triage_agent
    if _triage_agent is not None:
        return _triage_agent

    platform_agent = Agent(
        name="Platform Support",
        handoff_description="Knows MediSense AI product features, pricing, integrations, security, and how to use the doctor / patient flows.",
        instructions=PLATFORM_AGENT_INSTRUCTIONS,
        tools=[lookup_feature],
        model=_build_model(),
    )

    health_agent = Agent(
        name="Health Info",
        handoff_description="Answers general health and biology questions and recommends the right specialist.",
        instructions=HEALTH_AGENT_INSTRUCTIONS,
        tools=[find_specialist],
        model=_build_model(),
    )

    _triage_agent = Agent(
        name="MediSense Triage",
        instructions=TRIAGE_INSTRUCTIONS,
        handoffs=[platform_agent, health_agent],
        model=_build_model(),
    )
    return _triage_agent


# ── Public entrypoint ────────────────────────────────────────────────────

def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
    """
    Drop empty entries and any leading assistant turns (e.g. the client-side
    welcome bubble) so the conversation seen by the SDK starts with a user
    message and uses only valid roles.
    """
    cleaned: list[dict[str, str]] = []
    for m in messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if not content or role not in ("user", "assistant"):
            continue
        if not cleaned and role != "user":
            continue
        cleaned.append({"role": role, "content": content})
    return cleaned


async def run_chatbot(messages: list[dict[str, Any]]) -> str:
    """Run a single chatbot turn through the triage agent.

    `messages` is the full conversation as [{role, content}, ...]; the latest
    user turn must be last. Returns the assistant's reply text.
    """
    cleaned = _normalize_messages(messages)
    if not cleaned or cleaned[-1]["role"] != "user":
        raise ValueError("Conversation must end with a user message.")

    agent = get_triage_agent()
    result = await Runner.run(agent, input=cleaned, max_turns=8)
    reply = str(result.final_output or "").strip()
    return reply or "Sorry, I didn't catch that. Could you rephrase?"
