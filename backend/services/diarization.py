"""
diarization.py — Speaker diarization service

Rule-based heuristic diarization: alternates speakers (DOCTOR / PATIENT)
when it detects long pauses (>1.5 seconds) between transcript segments.
First speaker is always DOCTOR.

No local models are used — all ML processing happens via cloud APIs.
"""
import logging
from typing import List

logger = logging.getLogger(__name__)


def diarize(segments: list) -> List[dict]:
    """
    Label transcript segments as DOCTOR or PATIENT using a pause-based
    heuristic. A gap >1.5 seconds between segments signals a speaker change.

    Args:
        segments: List of dicts with 'text', 'start', 'end' keys
                  (produced by the transcription service).

    Returns:
        List of dicts: {speaker, text, start, end, confidence}
    """
    labeled = []
    current_speaker = "DOCTOR"
    last_end = 0.0

    for seg in segments:
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
            "confidence": 0.75,
        })
        last_end = end

    return labeled
