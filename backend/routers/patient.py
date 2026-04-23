"""
patient.py — Patient-side API router
POST /patient/upload     → parse file, extract text
POST /patient/analyze    → run 3 AI prompts, return full analysis
POST /patient/export-pdf → generate downloadable health guide PDF
"""
import json
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response
import io

from config import settings
from models.patient_models import UploadResponse, AnalyzeRequest, PatientAnalysis, ExportPdfRequest
from services.report_parser import parse_uploaded_file, looks_like_extraction_failure
from services.claude_service import analyze_report, generate_summary_and_specialists, generate_lifestyle_guide
from services.pdf_export import generate_patient_pdf
from services.auth_service import require_role
from utils.helpers import generate_id, validate_file_type, validate_file_size, safe_filename
from database import get_db, PatientAnalysisRecord, User
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/patient", tags=["patient"])

# In-memory store for uploaded raw text (keyed by file_id)
# In production, store to DB or object storage
_upload_cache: dict[str, dict] = {}


@router.post("/upload", response_model=UploadResponse)
async def upload_report(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """
    Accepts a PDF or image file, extracts text using PyMuPDF / Tesseract,
    and returns the raw extracted text with a file_id for downstream analysis.
    """
    # Validate file size
    content = await file.read()
    if not validate_file_size(len(content), settings.max_file_size_mb):
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {settings.max_file_size_mb} MB."
        )

    # Validate file type
    content_type = file.content_type or "application/octet-stream"
    filename = safe_filename(file.filename or "upload")

    # Be generous with MIME detection
    if not validate_file_type(content_type, settings.allowed_file_types):
        # Try to infer from extension
        ext = filename.lower().split(".")[-1]
        type_map = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
        content_type = type_map.get(ext, content_type)
        if not validate_file_type(content_type, settings.allowed_file_types):
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {content_type}. Allowed: PDF, JPEG, PNG."
            )

    # Extract text (vision-OCR fallback runs inside parse_uploaded_file)
    raw_text = await parse_uploaded_file(content, content_type, filename)

    # Generate file ID and cache
    file_id = generate_id()
    _upload_cache[file_id] = {
        "raw_text": raw_text,
        "file_name": filename,
        "file_type": content_type,
    }

    return UploadResponse(
        file_id=file_id,
        file_name=filename,
        raw_text=raw_text,
        file_type=content_type,
        char_count=len(raw_text),
    )


@router.post("/analyze", response_model=PatientAnalysis)
async def analyze_patient_report(
    request: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """
    Runs all 3 AI prompts on the extracted report text:
    1. Report analysis → findings JSON
    2. Plain summary + specialist routing
    3. Lifestyle guide (diet, exercise, precautions)
    Returns complete PatientAnalysis object.
    """
    raw_text = request.raw_text

    # Fall back to cached text if raw_text is short
    if len(raw_text.strip()) < 20 and request.file_id in _upload_cache:
        raw_text = _upload_cache[request.file_id]["raw_text"]

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="No text found to analyze. Please re-upload the file.")

    # Refuse to analyse files where text extraction clearly failed — otherwise
    # the LLM hallucinates generic blood-test advice from its prompt examples.
    if looks_like_extraction_failure(raw_text):
        raise HTTPException(
            status_code=422,
            detail=(
                "We could not read meaningful text from this file. Please upload a clearer "
                "image, or a text-based PDF of your medical report."
            ),
        )

    try:
        # Step 1: Extract findings
        logger.info(f"[{request.file_id}] Running report analysis...")
        findings_data = await analyze_report(raw_text)

        # Step 2: Summary + specialists
        logger.info(f"[{request.file_id}] Generating summary and specialist routing...")
        summary_data = await generate_summary_and_specialists(findings_data)

        # Step 3: Lifestyle guide
        conditions = findings_data.get("conditions_suggested", [])
        findings_summary = summary_data.get("plain_summary", "")
        logger.info(f"[{request.file_id}] Generating lifestyle guide...")
        lifestyle_data = await generate_lifestyle_guide(conditions, findings_summary)

        # Merge everything into PatientAnalysis
        analysis = PatientAnalysis(
            report_type=findings_data.get("report_type", "other"),
            findings=findings_data.get("findings", []),
            conditions_suggested=conditions,
            critical_alerts=findings_data.get("critical_alerts", []),
            plain_summary=summary_data.get("plain_summary", ""),
            what_this_means=summary_data.get("what_this_means", ""),
            specialists=summary_data.get("specialists", []),
            urgency=summary_data.get("urgency", "routine"),
            urgency_reason=summary_data.get("urgency_reason", ""),
            diet_plan=lifestyle_data.get("diet_plan", {}),
            exercise_plan=lifestyle_data.get("exercise_plan", []),
            exercises_to_avoid=lifestyle_data.get("exercises_to_avoid", []),
            precautions=lifestyle_data.get("precautions", {}),
        )

        # Persist to DB
        record = PatientAnalysisRecord(
            id=request.file_id,
            file_name=_upload_cache.get(request.file_id, {}).get("file_name", ""),
            file_type=_upload_cache.get(request.file_id, {}).get("file_type", ""),
            raw_text=raw_text[:5000],  # Truncate for storage
            findings=json.dumps(findings_data.get("findings", [])),
            summary=analysis.plain_summary,
            specialists=json.dumps([s if isinstance(s, dict) else s.dict() for s in analysis.specialists]),
            urgency=analysis.urgency,
            diet_plan=json.dumps(lifestyle_data.get("diet_plan", {})),
            exercise_plan=json.dumps(lifestyle_data.get("exercise_plan", [])),
            precautions=json.dumps(lifestyle_data.get("precautions", {})),
        )
        db.add(record)
        await db.commit()

        return analysis

    except Exception as e:
        logger.error(f"Analysis failed for file_id={request.file_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/export-pdf")
async def export_patient_pdf(
    request: ExportPdfRequest,
    _user: User = Depends(require_role("patient")),
):
    """
    Generate a branded patient health guide PDF and return it as a download.
    """
    analysis_dict = request.analysis_result.model_dump()
    
    actual_patient_name = _user.full_name if _user and getattr(_user, "full_name", None) else (request.patient_name or "Patient")
    
    pdf_bytes = generate_patient_pdf(analysis_dict, patient_name=actual_patient_name)

    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF generation failed. Ensure reportlab is installed.")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="medisense_health_guide.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
