"""
diarization.py — Speaker diarization service
Primary: pyannote.audio (requires HF token)
Fallback: Rule-based mock diarization (alternates speakers on long pauses)
"""
import logging
import re
from typing import List

logger = logging.getLogger(__name__)


def mock_diarize(whisper_segments: list) -> List[dict]:
    """
    Mock diarization — labels segments DOCTOR / PATIENT based on a
    simple heuristic: long gaps (>1.5s) between segments suggest a
    speaker change. First speaker is always DOCTOR.
    """
    labeled = []
    current_speaker = "DOCTOR"
    last_end = 0.0

    for seg in whisper_segments:
        start = seg.get("start", 0.0)
        end = seg.get("end", 0.0)
        text = seg.get("text", "").strip()

        # Speaker switch heuristic: pause > 1.5 seconds
        if start - last_end > 1.5 and labeled:
            current_speaker = "PATIENT" if current_speaker == "DOCTOR" else "DOCTOR"

        labeled.append({
            "speaker": current_speaker,
            "text": text,
            "start": round(start, 2),
            "end": round(end, 2),
            "confidence": 0.75,  # Mock confidence
        })
        last_end = end

    return labeled


def pyannote_diarize(audio_bytes: bytes, whisper_segments: list, hf_token: str) -> List[dict]:
    """
    Real diarization using pyannote.audio.
    Maps pyannote speaker labels to DOCTOR/PATIENT.
    """
    try:
        import torch
        from pyannote.audio import Pipeline
        import tempfile, os

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        diarization = pipeline(tmp_path)
        os.unlink(tmp_path)

        # Build speaker timeline: [(start, end, speaker_label), ...]
        timeline = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            timeline.append((turn.start, turn.end, speaker))

        # Map first speaker → DOCTOR, second → PATIENT
        seen_speakers = {}
        role_map = {}
        for _, _, sp in timeline:
            if sp not in seen_speakers:
                seen_speakers[sp] = len(seen_speakers)
        for sp, idx in seen_speakers.items():
            role_map[sp] = "DOCTOR" if idx == 0 else "PATIENT"

        # Align whisper segments to diarization timeline
        labeled = []
        for seg in whisper_segments:
            mid = (seg.get("start", 0) + seg.get("end", 0)) / 2
            assigned = "DOCTOR"
            for (start, end, sp) in timeline:
                if start <= mid <= end:
                    assigned = role_map.get(sp, "DOCTOR")
                    break
            labeled.append({
                "speaker": assigned,
                "text": seg.get("text", "").strip(),
                "start": round(seg.get("start", 0), 2),
                "end": round(seg.get("end", 0), 2),
                "confidence": 0.9,
            })

        return labeled

    except ImportError:
        logger.warning("pyannote.audio not installed — using mock diarization")
        return mock_diarize(whisper_segments)
    except Exception as e:
        logger.error(f"pyannote diarization failed: {e} — using mock")
        return mock_diarize(whisper_segments)


def diarize(audio_bytes: bytes, whisper_segments: list, hf_token: str) -> List[dict]:
    """
    Main entrypoint — use pyannote if HF token available, else mock.
    """
    if hf_token:
        return pyannote_diarize(audio_bytes, whisper_segments, hf_token)
    logger.info("No HF token — using mock diarization")
    return mock_diarize(whisper_segments)
