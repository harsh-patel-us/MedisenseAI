"""
config.py — Centralised settings for MediSense AI.
Reads ALL variables from .env via pydantic-settings / python-dotenv.
All ML models run via cloud APIs (OpenRouter, Sarvam AI) — nothing is loaded locally.

System prompts have been moved to the `prompts/` package — import them
from `prompts` instead (e.g. `from prompts import SAFETY_SYSTEM_MESSAGE`).
"""
from functools import lru_cache
import os
from dotenv import load_dotenv

# Load environment variables before setting class attributes
load_dotenv()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All runtime configuration, loaded from environment variables / .env file.
    Fields mirror the keys in /backend/.env exactly (case-insensitive).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── OpenRouter / LLM ──────────────────────────────────────────────────
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_base_url: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    ai_model: str = os.getenv("AI_MODEL", "openai/gpt-4o-mini")

    # ── Chatbot widget (OpenAI Agents SDK over OpenRouter) ───────────────
    chatbot_model: str = os.getenv("CHATBOT_MODEL", "openai/gpt-4o-mini")

    # ── Patient persistent chatbot (Medisense AI) — same provider ───────
    patient_chatbot_model: str = os.getenv("PATIENT_CHATBOT_MODEL", "openai/gpt-4o-mini")
    patient_chatbot_summary_every: int = int(os.getenv("PATIENT_CHATBOT_SUMMARY_EVERY", "10"))
    # Vision-capable model used for OCR of uploaded images / scanned PDFs.
    # Override in .env if you want to use a different vision model.
    vision_model: str = os.getenv("VISION_MODEL", "openai/gpt-4o-mini")

    # ── App ───────────────────────────────────────────────────────────────
    app_host: str = os.getenv("APP_HOST", "127.0.0.1")
    app_port: int = int(os.getenv("APP_PORT", "8000"))
    environment: str = os.getenv("ENVIRONMENT", "development")

    # ── File upload ───────────────────────────────────────────────────────
    upload_dir: str = os.getenv("UPLOAD_DIR", "./tmp/medisense_uploads")
    max_file_size_mb: int = int(os.getenv("MAX_FILE_SIZE_MB", "20"))
    allowed_file_types: str = os.getenv("ALLOWED_FILE_TYPES", "application/pdf,image/jpeg,image/png")

    # ── Speech / NLP ──────────────────────────────────────────────────────
    whisper_model: str = os.getenv("WHISPER_MODEL", "google/gemini-3-flash-preview")
    hf_token: str = os.getenv("HF_TOKEN", "")

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = os.getenv("DATABASE_URL")

    # ── CORS ─────────────────────────────────────────────────────────────
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # ── Consultation / Medical LLM ────────────────────────────────────────
    # Best OpenRouter models for medical reasoning:
    #   anthropic/claude-opus-4       — highest quality, best for complex medical
    #   anthropic/claude-sonnet-4-5   — good balance of speed + quality
    #   openai/gpt-4o                 — solid general-purpose medical reasoning
    # Falls back to ai_model if not set.
    medical_model: str = os.getenv("MEDICAL_MODEL", "openai/gpt-4o-mini")

    # ── Auth / JWT ───────────────────────────────────────────────────────
    jwt_secret: str = os.getenv("JWT_SECRET")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expires_minutes: int = int(os.getenv("JWT_EXPIRES_MINUTES", "10080"))

    # ── Google Calendar OAuth ────────────────────────────────────────────
    # Configure these in /backend/.env. Get them from the Google Cloud
    # console: APIs & Services → Credentials → OAuth 2.0 Client ID
    # (Application type: Web application). Add the redirect URI exactly as
    # configured here, e.g. http://localhost:8000/integrations/google/callback
    # The frontend URL is where the user is bounced back to after OAuth.
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/integrations/google/callback")
    google_post_auth_redirect: str = os.getenv("GOOGLE_POST_AUTH_REDIRECT", "http://localhost:5173/consultation/schedule")

    # ── Platform-level Google account (single-account mode) ──────────────
    # Run `python scripts/setup_google_calendar.py` once to obtain these.
    # When set, every consultation scheduled through MediSense creates an
    # event on this calendar with both the doctor and patient added as
    # attendees, so neither party has to connect their own Google account.
    google_refresh_token: str = os.getenv("GOOGLE_REFRESH_TOKEN", "")
    google_calendar_email: str = os.getenv("GOOGLE_CALENDAR_EMAIL", "")

    # ── Google Meet transcript webhook ───────────────────────────────────
    # Shared secret used to validate inbound HMAC-SHA256 signatures from
    # Google's Meet "meeting ended" event push. Empty disables verification.
    google_meet_webhook_secret: str = os.getenv("GOOGLE_MEET_WEBHOOK_SECRET", "")

    # ── Sarvam AI (Indic STT / TTS) ──────────────────────────────────────
    # When SARVAM_API_KEY is empty, the patient chatbot voice endpoints fall
    # back to the existing Gemini Flash transcription path. Doctor consult
    # flows keep using their own pipeline until you enable Sarvam there.
    sarvam_api_key: str = os.getenv("SARVAM_API_KEY", "")
    sarvam_stt_model: str = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
    sarvam_tts_model: str = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
    sarvam_base_url: str = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai")
    sarvam_ws_base_url: str = os.getenv("SARVAM_WS_BASE_URL", "wss://api.sarvam.ai")
    # Default speaker for Sarvam TTS bulbul:v3.
    sarvam_tts_speaker: str = os.getenv("SARVAM_TTS_SPEAKER", "anushka")
    sarvam_tts_language: str = os.getenv("SARVAM_TTS_LANGUAGE", "en-IN")


@lru_cache()
def get_settings() -> Settings:
    from dotenv import load_dotenv
    load_dotenv()
    return Settings()


settings: Settings = get_settings()


# ── Multilingual support ────────────────────────────────────────────────
# Language codes the patient can pick. Keys are ISO-639-1 (or close to it);
# values are the display labels surfaced in the UI and substituted into the
# language instruction template before being sent to the LLM. This lives in
# config.py rather than prompts/ because it is static reference data, not a
# template — the actual instruction text is in prompts/language_instruction.txt.
SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "gu": "Gujarati (ગુજરાતી)",
    "bn": "Bengali (বাংলা)",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
    "mr": "Marathi (मराठी)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "ml": "Malayalam (മലയാളം)",
    "pa": "Punjabi (ਪੰਜਾਬੀ)",
    "ur": "Urdu (اردو)",
}


def normalize_language(code: str | None) -> str:
    """Coerce any input to a supported language code; default to 'en'."""
    if not code:
        return "en"
    code = code.strip().lower()
    return code if code in SUPPORTED_LANGUAGES else "en"
