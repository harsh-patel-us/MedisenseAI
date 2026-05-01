"""
sarvam_tts_service.py — Sarvam AI text-to-speech (bulbul:v3).

Two delivery modes:
  • REST       — single POST returns base64 audio chunks. Used by the patient
                 chatbot to read back assistant replies.
  • Streaming  — async generator over a WebSocket that yields audio chunks as
                 they become available. Useful for incremental playback.

When SARVAM_API_KEY (or the sarvamai SDK) isn't present, every call returns
an empty payload so the frontend can quietly skip audio playback. The chat
itself keeps working — TTS is purely additive.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, List, Optional

from config import settings

logger = logging.getLogger(__name__)


def is_available() -> bool:
    return bool(settings.sarvam_api_key)


def _sdk_client():
    if not settings.sarvam_api_key:
        return None
    try:
        from sarvamai import SarvamAI  # type: ignore

        return SarvamAI(api_subscription_key=settings.sarvam_api_key)
    except Exception as exc:  # pragma: no cover — sdk optional
        logger.info(f"sarvamai SDK unavailable for TTS ({exc}).")
        return None


@dataclass
class SarvamTTSResult:
    audio_base64: str          # WAV bytes encoded as base64; empty when unavailable
    mime_type: str             # "audio/wav" when present
    speaker: Optional[str]
    language: Optional[str]
    provider: str              # "sarvam" | "none"


# ── REST synthesis (one-shot) ────────────────────────────────────────────

async def synthesize(
    text: str,
    *,
    language_code: Optional[str] = None,
    speaker: Optional[str] = None,
) -> SarvamTTSResult:
    """Convert one chunk of text into base64 WAV audio. Returns empty payload
    when Sarvam isn't configured so callers can silently skip playback."""
    cleaned = (text or "").strip()
    if not cleaned:
        return SarvamTTSResult("", "audio/wav", None, None, "none")

    if not is_available():
        return SarvamTTSResult("", "audio/wav", None, None, "none")

    client = _sdk_client()
    if client is None:
        return SarvamTTSResult("", "audio/wav", None, None, "none")

    target_lang = language_code or settings.sarvam_tts_language
    chosen_speaker = speaker or settings.sarvam_tts_speaker

    def _call_sdk() -> dict:
        res = client.text_to_speech.convert(
            text=cleaned,
            target_language_code=target_lang,
            model=settings.sarvam_tts_model,
            speaker=chosen_speaker,
        )
        if hasattr(res, "model_dump"):
            return res.model_dump()
        if isinstance(res, dict):
            return res
        return json.loads(json.dumps(res, default=str))

    try:
        payload = await asyncio.to_thread(_call_sdk)
    except Exception as exc:
        logger.error(f"Sarvam TTS failed: {exc}")
        return SarvamTTSResult("", "audio/wav", None, None, "none")

    chunks = payload.get("audios") or []
    if not chunks and payload.get("audio"):
        chunks = [payload["audio"]]

    audio_b64 = _concat_wav_chunks(chunks) if chunks else ""
    return SarvamTTSResult(
        audio_base64=audio_b64,
        mime_type="audio/wav",
        speaker=chosen_speaker,
        language=target_lang,
        provider="sarvam" if audio_b64 else "none",
    )


def _concat_wav_chunks(chunks: List[str]) -> str:
    """Concatenate Sarvam's base64 WAV chunks. Each chunk is a self-contained
    WAV file; we strip the 44-byte header from every chunk after the first
    and recompute the riff/data lengths so the result plays as one clip."""
    decoded: List[bytes] = []
    for c in chunks:
        if not c:
            continue
        try:
            decoded.append(base64.b64decode(c))
        except Exception:
            continue

    if not decoded:
        return ""
    if len(decoded) == 1:
        return base64.b64encode(decoded[0]).decode("ascii")

    header = decoded[0][:44]
    pcm = bytearray(decoded[0][44:])
    for blob in decoded[1:]:
        # Strip header if it looks like a WAV file; otherwise append as-is.
        if blob[:4] == b"RIFF" and blob[8:12] == b"WAVE":
            pcm.extend(blob[44:])
        else:
            pcm.extend(blob)

    data_size = len(pcm)
    riff_size = 36 + data_size
    rebuilt = bytearray(header)
    rebuilt[4:8] = riff_size.to_bytes(4, "little")
    rebuilt[40:44] = data_size.to_bytes(4, "little")
    rebuilt.extend(pcm)
    return base64.b64encode(bytes(rebuilt)).decode("ascii")


# ── Streaming TTS over WebSocket ─────────────────────────────────────────

@asynccontextmanager
async def stream_synthesis(
    *,
    language_code: Optional[str] = None,
    speaker: Optional[str] = None,
) -> AsyncIterator["SarvamTTSStream"]:
    sess = SarvamTTSStream(language_code=language_code, speaker=speaker)
    await sess.open()
    try:
        yield sess
    finally:
        await sess.close()


class SarvamTTSStream:
    """Incremental TTS — push text and yield base64 audio chunks as they arrive."""

    def __init__(
        self,
        *,
        language_code: Optional[str] = None,
        speaker: Optional[str] = None,
    ):
        self.language_code = language_code or settings.sarvam_tts_language
        self.speaker = speaker or settings.sarvam_tts_speaker
        self._ws = None
        self._available = is_available()

    async def open(self) -> None:
        if not self._available:
            return
        try:
            import websockets  # type: ignore

            url = (
                f"{settings.sarvam_ws_base_url}/text-to-speech/ws"
                f"?model={settings.sarvam_tts_model}"
                f"&speaker={self.speaker}"
                f"&target_language_code={self.language_code}"
            )
            self._ws = await websockets.connect(
                url,
                additional_headers={"api-subscription-key": settings.sarvam_api_key},
                max_size=8 * 1024 * 1024,
            )
        except Exception as exc:
            logger.warning(f"Sarvam TTS streaming unavailable ({exc}).")
            self._ws = None
            self._available = False

    async def push(self, text: str) -> AsyncIterator[str]:
        """Send one chunk of text and yield base64 WAV chunks coming back."""
        if not self._available or self._ws is None:
            result = await synthesize(
                text, language_code=self.language_code, speaker=self.speaker
            )
            if result.audio_base64:
                yield result.audio_base64
            return
        try:
            await self._ws.send(json.dumps({"text": text}))
            while True:
                raw = await asyncio.wait_for(self._ws.recv(), timeout=10.0)
                if isinstance(raw, bytes):
                    yield base64.b64encode(raw).decode("ascii")
                else:
                    data = json.loads(raw)
                    chunk = data.get("audio") or data.get("audio_base64") or ""
                    if chunk:
                        yield chunk
                    if data.get("type") == "done" or data.get("done"):
                        break
        except asyncio.TimeoutError:
            return
        except Exception as exc:
            logger.warning(f"Sarvam TTS stream recv failed ({exc}); falling back.")
            result = await synthesize(
                text, language_code=self.language_code, speaker=self.speaker
            )
            if result.audio_base64:
                yield result.audio_base64

    async def close(self) -> None:
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
