"""
sarvam_stt_service.py — Sarvam AI streaming + batch speech-to-text.

Two modes:
  • translate — Saaras v3 translates Indic speech to English.
                Used by doctor consultation flows where the SOAP pipeline
                expects English text downstream.
  • codemix   — Saarika v2.5 / saaras transcribe verbatim (preserves
                Hinglish / language switches). Used by the patient chatbot
                so Dr. MediSense replies in the patient's own register.

When SARVAM_API_KEY is not configured (or the sarvamai SDK is missing),
every call transparently falls back to `services.transcription.transcribe_audio`
which is the existing Gemini Flash via OpenRouter implementation.

Public surface
--------------
is_available()                                                 → bool
transcribe(audio_bytes, mime, *, mode)                         → dict
                              mode = "translate" | "codemix"
stream_session(*, mode, language_code)                         → SarvamStreamSession
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Optional

from config import settings
from services.transcription import transcribe_audio as gemini_transcribe_audio

logger = logging.getLogger(__name__)


# ── Capability check ─────────────────────────────────────────────────────

def is_available() -> bool:
    return bool(settings.sarvam_api_key)


def _sdk_client():
    """Return an instantiated sarvamai client, or None if the SDK isn't installed."""
    if not settings.sarvam_api_key:
        return None
    try:
        from sarvamai import SarvamAI  # type: ignore

        return SarvamAI(api_subscription_key=settings.sarvam_api_key)
    except Exception as exc:  # pragma: no cover — sdk optional
        logger.info(f"sarvamai SDK unavailable ({exc}); using HTTP fallback.")
        return None


# ── Audio helpers ────────────────────────────────────────────────────────

_MIME_TO_EXT = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
}


def _extension_for(mime: str) -> str:
    return _MIME_TO_EXT.get(mime.lower(), "webm")


# ── Batch transcription ──────────────────────────────────────────────────

@dataclass
class SarvamTranscript:
    text: str
    language: Optional[str]
    provider: str  # "sarvam" | "gemini"
    raw: dict


async def transcribe(
    audio_bytes: bytes,
    mime: str = "audio/webm",
    *,
    mode: str = "codemix",
) -> SarvamTranscript:
    """Transcribe a single audio blob.

    `mode="translate"` calls Saaras v3 (Indic → English). `mode="codemix"`
    calls Saarika v2.5 which preserves the spoken language. When Sarvam isn't
    configured, falls back to the existing Gemini Flash transcription path.
    """
    if not audio_bytes:
        return SarvamTranscript(text="", language=None, provider="none", raw={})

    if not is_available():
        logger.debug("Sarvam not configured — falling back to Gemini Flash STT.")
        result = await gemini_transcribe_audio(audio_bytes)
        return SarvamTranscript(
            text=(result.get("text") or "").strip(),
            language=None,
            provider="gemini",
            raw=result,
        )

    client = _sdk_client()
    if client is None:
        # SDK missing → still respect the fallback contract.
        logger.warning(
            "SARVAM_API_KEY is set but sarvamai SDK is not installed. "
            "Falling back to Gemini Flash. Run `pip install sarvamai`."
        )
        result = await gemini_transcribe_audio(audio_bytes)
        return SarvamTranscript(
            text=(result.get("text") or "").strip(),
            language=None,
            provider="gemini",
            raw=result,
        )

    ext = _extension_for(mime)
    filename = f"chunk.{ext}"

    def _call_sdk() -> dict:
        # The SDK accepts a (filename, bytes, mime) tuple per HTTP file-upload conventions.
        file_arg = (filename, audio_bytes, mime)
        if mode == "translate":
            res = client.speech_to_text.translate(
                file=file_arg,
                model=settings.sarvam_stt_model,
            )
        else:
            # Saarika is Sarvam's codemix-friendly transcription model.
            res = client.speech_to_text.transcribe(
                file=file_arg,
                model="saarika:v2.5",
                language_code="unknown",
            )
        if hasattr(res, "model_dump"):
            return res.model_dump()
        if isinstance(res, dict):
            return res
        return json.loads(json.dumps(res, default=str))

    try:
        payload = await asyncio.to_thread(_call_sdk)
    except Exception as exc:
        logger.error(f"Sarvam {mode} STT failed: {exc} — falling back to Gemini.")
        result = await gemini_transcribe_audio(audio_bytes)
        return SarvamTranscript(
            text=(result.get("text") or "").strip(),
            language=None,
            provider="gemini",
            raw=result,
        )

    text = (payload.get("transcript") or payload.get("text") or "").strip()
    language = (
        payload.get("language_code")
        or payload.get("detected_language_code")
        or payload.get("source_language_code")
    )
    return SarvamTranscript(text=text, language=language, provider="sarvam", raw=payload)


# ── Streaming WebSocket session ──────────────────────────────────────────

class SarvamStreamSession:
    """Thin async wrapper around Sarvam's STT streaming WebSocket.

    Used by the doctor consultation router to feed live audio chunks and
    receive partial / final transcript events. Falls back to per-chunk batch
    transcription when the Sarvam WebSocket can't be reached.
    """

    def __init__(self, *, mode: str, language_code: str = "unknown"):
        self.mode = mode
        self.language_code = language_code
        self._ws = None
        self._fallback = not is_available()

    async def __aenter__(self) -> "SarvamStreamSession":
        if self._fallback:
            return self
        try:
            import websockets  # type: ignore

            url = (
                f"{settings.sarvam_ws_base_url}/speech-to-text/ws/v1/stream"
                f"?language-code={self.language_code}&model={settings.sarvam_stt_model}"
                f"&mode={self.mode}"
            )
            self._ws = await websockets.connect(
                url,
                additional_headers={"api-subscription-key": settings.sarvam_api_key},
                max_size=8 * 1024 * 1024,
            )
        except Exception as exc:
            logger.warning(f"Sarvam streaming unavailable ({exc}); using batch fallback.")
            self._fallback = True
            self._ws = None
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    async def send_chunk(self, audio_bytes: bytes, mime: str = "audio/webm") -> Optional[str]:
        """Send one audio chunk; return any decoded transcript text or None."""
        if self._fallback or self._ws is None:
            result = await transcribe(audio_bytes, mime, mode=self.mode)
            return result.text or None
        try:
            await self._ws.send(audio_bytes)
            raw = await asyncio.wait_for(self._ws.recv(), timeout=8.0)
            data = json.loads(raw) if isinstance(raw, (str, bytes)) else {}
            return (data.get("transcript") or data.get("text") or "").strip() or None
        except Exception as exc:
            logger.warning(f"Sarvam stream recv failed ({exc}); using batch fallback.")
            self._fallback = True
            result = await transcribe(audio_bytes, mime, mode=self.mode)
            return result.text or None


@asynccontextmanager
async def stream_session(
    *,
    mode: str = "translate",
    language_code: str = "unknown",
) -> AsyncIterator[SarvamStreamSession]:
    sess = SarvamStreamSession(mode=mode, language_code=language_code)
    async with sess:
        yield sess
