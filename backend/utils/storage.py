"""
storage.py — Persistent on-disk storage for uploaded files and generated PDFs.

Files are written under settings.upload_dir in role-specific subfolders so the
DB only needs to track a path + size, not raw bytes. Paths are returned as
strings so they can be stored in SQLite columns.
"""
from pathlib import Path
from typing import Optional

from config import settings
from utils.helpers import safe_filename

PATIENT_UPLOADS_DIR = "patient_uploads"
PATIENT_PDFS_DIR = "patient_pdfs"
DOCTOR_PDFS_DIR = "soap_pdfs"


def _base_dir() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _subdir(name: str) -> Path:
    d = _base_dir() / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ext_for_content_type(content_type: Optional[str], fallback: str = "bin") -> str:
    mapping = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
    }
    return mapping.get((content_type or "").lower(), fallback)


def save_patient_upload(file_id: str, content: bytes, original_name: str, content_type: str) -> str:
    ext = _ext_for_content_type(content_type, fallback=Path(original_name).suffix.lstrip(".") or "bin")
    path = _subdir(PATIENT_UPLOADS_DIR) / f"{file_id}_{safe_filename(original_name)}"
    if not path.suffix:
        path = path.with_suffix(f".{ext}")
    path.write_bytes(content)
    return str(path)


def save_patient_pdf(record_id: str, pdf_bytes: bytes) -> str:
    path = _subdir(PATIENT_PDFS_DIR) / f"{record_id}_health_guide.pdf"
    path.write_bytes(pdf_bytes)
    return str(path)


def save_soap_pdf(session_id: str, pdf_bytes: bytes) -> str:
    path = _subdir(DOCTOR_PDFS_DIR) / f"{session_id}_soap_note.pdf"
    path.write_bytes(pdf_bytes)
    return str(path)
