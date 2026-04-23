"""
helpers.py — Shared utility functions
"""
import uuid
import os
import re
from pathlib import Path
from typing import Optional


def generate_id() -> str:
    """Generate a unique session/file ID."""
    return str(uuid.uuid4())


def validate_file_type(content_type: str, allowed: str) -> bool:
    """Check if the uploaded file's content type is allowed."""
    allowed_list = [t.strip() for t in allowed.split(",")]
    return content_type in allowed_list


def validate_file_size(size_bytes: int, max_mb: int) -> bool:
    """Return True if file is within allowed size."""
    return size_bytes <= max_mb * 1024 * 1024


def safe_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal."""
    filename = os.path.basename(filename)
    filename = re.sub(r"[^\w\-_\. ]", "_", filename)
    return filename


def cleanup_temp_file(file_path: str) -> None:
    """Delete a temporary file if it exists."""
    try:
        Path(file_path).unlink(missing_ok=True)
    except Exception:
        pass


def format_transcript_for_prompt(segments: list) -> str:
    """Convert list of TranscriptSegment dicts into a readable string for the AI."""
    lines = []
    for seg in segments:
        speaker = seg.get("speaker", "UNKNOWN")
        text = seg.get("text", "")
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def extract_json_from_response(text: str) -> str:
    """
    Strip markdown code fences from an AI response to get raw JSON.
    Handles ```json ... ``` and plain JSON.
    """
    text = text.strip()
    # Remove ```json ... ``` fences
    if text.startswith("```"):
        lines = text.split("\n")
        # Drop first and last fence lines
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner).strip()
    return text
