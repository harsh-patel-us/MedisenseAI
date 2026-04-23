"""
transcription.py — Speech-to-text via Gemini Flash on OpenRouter

Sends audio as base64 to google/gemini-2.5-flash-preview through
the OpenRouter chat completions API (multimodal audio support).
No local Whisper model or ffmpeg required.
"""
import base64
import logging

from openai import AsyncOpenAI
from config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None

TRANSCRIPTION_MODEL = "google/gemini-2.5-flash"

TRANSCRIPTION_PROMPT = (
    "You are an expert medical transcription service. "
    "Transcribe the following audio recording verbatim. "
    "Include every word spoken, preserving the natural speech patterns. "
    "If multiple speakers are present, start each speaker turn on a new line. "
    "CRITICAL INSTRUCTIONS: "
    "- Return ONLY the transcription text — no commentary, no labels, no timestamps, no markdown formatting. "
    "- If the audio contains only silence, background noise, or is unintelligible/invalid, you MUST output EXACTLY the word '<silence>'. "
    "- DO NOT hallucinate, invent, or create a mock transcript under any circumstances."
)


def _get_client() -> AsyncOpenAI:
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


def _detect_mime(data: bytes) -> str:
    """Detect audio MIME type from magic bytes."""
    if data[:4] == b"RIFF":
        return "audio/wav"
    if data[:4] == b"OggS":
        return "audio/ogg"
    if data[:4] == b"\x1aE\xdf\xa3":  # EBML header (WebM/Matroska)
        return "audio/webm"
    if data[:3] == b"ID3" or data[:2] == b"\xff\xfb":
        return "audio/mp3"
    if data[:4] == b"fLaC":
        return "audio/flac"
    return "audio/webm"


async def transcribe_audio(audio_bytes: bytes, model_size: str = "base") -> dict:
    """
    Transcribe raw audio bytes using Gemini Flash via OpenRouter.

    Returns a dict with 'text' and 'segments'.
    Each segment: {id, start, end, text}
    """
    if not settings.openrouter_api_key:
        logger.error("OPENROUTER_API_KEY is not set.")
        return {"text": "", "segments": []}

    if not audio_bytes or len(audio_bytes) < 100:
        logger.warning(f"Audio chunk too small ({len(audio_bytes)} bytes), skipping")
        return {"text": "", "segments": []}

    try:
        client = _get_client()
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        mime_type = _detect_mime(audio_bytes)

        logger.debug(f"Transcribing {len(audio_bytes)} bytes ({mime_type}) via {TRANSCRIPTION_MODEL}")

        response = await client.chat.completions.create(
            model=TRANSCRIPTION_MODEL,
            messages=[
                {"role": "system", "content": TRANSCRIPTION_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": audio_b64,
                                "format": mime_type.split("/")[-1],
                            },
                        },
                        {
                            "type": "text",
                            "text": "Please transcribe this audio recording.",
                        },
                    ],
                },
            ],
            temperature=0.0,
            max_tokens=4096,
        )

        text = (response.choices[0].message.content or "").strip()
        logger.info(f"Transcription complete: {len(text)} chars")

        segments = []
        if text and "<silence>" not in text.lower():
            segments.append({
                "id": 0,
                "start": 0.0,
                "end": 0.0,
                "text": text,
            })
        else:
            text = ""

        return {"text": text, "segments": segments}

    except Exception as e:
        logger.error(f"Gemini transcription failed: {e}")
        return {"text": "", "segments": []}


async def get_raw_transcript_text(audio_bytes: bytes, model_size: str = "base") -> str:
    """Convenience wrapper — returns just the full transcript text."""
    result = await transcribe_audio(audio_bytes, model_size)
    return result.get("text", "").strip()
