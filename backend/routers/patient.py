"""
patient.py — Patient-side API router
POST /patient/upload                  → parse file, extract text
POST /patient/analyze                 → run 3 AI prompts, return full analysis
POST /patient/export-pdf              → generate downloadable health guide PDF
GET  /patient/history                 → list this patient's past analyses
GET  /patient/history/{id}            → full analysis for one record
GET  /patient/history/{id}/file       → download the original uploaded file
GET  /patient/history/{id}/pdf        → download the AI-generated PDF
"""
import asyncio
import json
import logging
from urllib.parse import quote

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import Response

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.patient_models import (
    UploadResponse,
    AnalyzeRequest,
    BiomarkerReading,
    BiomarkerTrend,
    BiomarkerTrendResponse,
    MedicationAlert,
    PatientAnalysis,
    ExportPdfRequest,
    HistoryItem,
    HistoryListResponse,
    HistoryDetail,
)
from services import claude_service as claude_service_module
from services.report_parser import parse_uploaded_file, looks_like_extraction_failure
from services.claude_service import analyze_report, generate_summary_and_specialists, generate_lifestyle_guide
from services.biomarker_service import (
    extract_biomarkers,
    get_patient_biomarker_trends,
)
from services.medication_service import (
    extract_medications_from_text,
    run_interaction_check,
    save_medications,
)
from services.pdf_export import generate_patient_pdf
from services.auth_service import require_role
from utils.helpers import generate_id, validate_file_type, validate_file_size, safe_filename
from database import (
    AsyncSessionLocal,
    MedicationInteractionAlert,
    PatientAnalysisRecord,
    User,
    get_db,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/patient", tags=["patient"])

# In-memory store for uploaded bytes + extracted text, keyed by file_id.
# This is short-lived: /upload populates it, /analyze drains it into the DB.
# Files are persisted as BYTEA/BLOB on PatientAnalysisRecord — nothing is
# written to the local filesystem.
_upload_cache: dict[str, dict] = {}


async def _extract_and_check_meds_bg(patient_id: str, raw_text: str) -> None:
    """Background medication extraction + interaction check for /analyze.

    Runs in its own DB session so the request handler can return immediately
    while OpenFDA + LLM calls finish in the background. Failures are logged
    and swallowed.
    """
    try:
        async with AsyncSessionLocal() as bg_db:
            extracted = await extract_medications_from_text(
                raw_text, claude_service_module
            )
            if not extracted:
                return
            await save_medications(
                patient_id=patient_id,
                medications=extracted,
                source="prescription_upload",
                db_session=bg_db,
            )
            await run_interaction_check(patient_id, bg_db, claude_service_module)
    except Exception as exc:
        logger.warning(f"Background medication processing failed: {exc}")


async def _current_medication_alerts(
    patient_id: str, db: AsyncSession
) -> list[MedicationAlert]:
    """Snapshot of undismissed interaction alerts on file right now."""
    result = await db.execute(
        select(MedicationInteractionAlert)
        .where(
            MedicationInteractionAlert.patient_id == patient_id,
            MedicationInteractionAlert.is_dismissed == False,  # noqa: E712
        )
        .order_by(MedicationInteractionAlert.created_at.desc())
    )
    return [
        MedicationAlert(
            id=a.id,
            drug_a=a.drug_a,
            drug_b=a.drug_b,
            severity=a.severity,
            description=a.description or "",
        )
        for a in result.scalars().all()
    ]


@router.post("/upload", response_model=UploadResponse)
async def upload_report(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """
    Accepts a PDF or image file, extracts text using PyMuPDF / Tesseract,
    persists the raw upload to disk, and returns extracted text with a file_id.
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

    # Hold the bytes in memory until /analyze persists them on the DB record.
    file_id = generate_id()
    _upload_cache[file_id] = {
        "raw_text": raw_text,
        "file_name": filename,
        "file_type": content_type,
        "file_bytes": content,
        "file_size": len(content),
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
    Persists the full analysis (linked to the patient) and returns it.
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

    # Patient's UI language drives all three AI calls. Defaults to English
    # if the user record predates the multilingual feature.
    patient_lang = getattr(_user, "preferred_language", "en") or "en"

    try:
        # Step 1: Extract findings
        logger.info(f"[{request.file_id}] Running report analysis...")
        findings_data = await analyze_report(raw_text, language=patient_lang)

        # Step 2: Summary + specialists
        logger.info(f"[{request.file_id}] Generating summary and specialist routing...")
        summary_data = await generate_summary_and_specialists(
            findings_data, language=patient_lang
        )

        # Step 3: Lifestyle guide
        conditions = findings_data.get("conditions_suggested", [])
        findings_summary = summary_data.get("plain_summary", "")
        logger.info(f"[{request.file_id}] Generating lifestyle guide...")
        lifestyle_data = await generate_lifestyle_guide(
            conditions, findings_summary, language=patient_lang
        )

        # Snapshot alerts already on file BEFORE we kick off the background
        # extraction so the response includes the patient's most recent
        # known interactions even on a fresh report.
        current_alerts = await _current_medication_alerts(_user.id, db)

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
            medication_alerts=current_alerts,
        )

        # Persist to DB, linked to the authenticated patient.
        upload_meta = _upload_cache.get(request.file_id, {})
        record = PatientAnalysisRecord(
            id=request.file_id,
            patient_id=_user.id,
            file_name=upload_meta.get("file_name", ""),
            file_type=upload_meta.get("file_type", ""),
            uploaded_file_data=upload_meta.get("file_bytes"),
            uploaded_file_size=upload_meta.get("file_size"),
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

        # Bytes are now safe in the DB; drop the in-memory copy.
        _upload_cache.pop(request.file_id, None)

        # Fire-and-forget medication extraction so a slow OpenFDA / LLM
        # round-trip never blocks the analysis response. Newly-extracted
        # drugs surface on the next /medications/{patient_id}/interactions
        # call from the medication tracker UI.
        asyncio.create_task(_extract_and_check_meds_bg(_user.id, raw_text))

        # Same pattern for the lab biomarker timeline. Newly-extracted
        # readings appear under GET /patient/{id}/biomarker-trends once
        # the background task lands.
        asyncio.create_task(
            extract_biomarkers(
                raw_text=raw_text,
                analysis_record_id=request.file_id,
                patient_id=_user.id,
                claude_service=claude_service_module,
                db=None,
            )
        )

        return analysis

    except Exception as e:
        logger.error(f"Analysis failed for file_id={request.file_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/export-pdf")
async def export_patient_pdf(
    request: ExportPdfRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """
    Generate a branded patient health guide PDF, persist it to disk, update
    the analysis record with its path, and return the PDF as a download.
    """
    analysis_dict = request.analysis_result.model_dump()

    actual_patient_name = _user.full_name if _user and getattr(_user, "full_name", None) else (request.patient_name or "Patient")

    pdf_bytes = generate_patient_pdf(
        analysis_dict,
        patient_name=actual_patient_name,
        language=getattr(_user, "preferred_language", "en") or "en",
    )

    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF generation failed. Ensure reportlab is installed.")

    # Persist PDF bytes onto the analysis record when we can identify it. The
    # PDF lives in the DB so patients can re-download it from /history later.
    record_id = getattr(request, "file_id", None) or getattr(request, "analysis_id", None)
    if record_id:
        try:
            result = await db.execute(
                select(PatientAnalysisRecord).where(
                    PatientAnalysisRecord.id == record_id,
                    PatientAnalysisRecord.patient_id == _user.id,
                )
            )
            record = result.scalar_one_or_none()
            if record is not None:
                record.generated_pdf_data = pdf_bytes
                record.generated_pdf_size = len(pdf_bytes)
                await db.commit()
        except Exception as exc:
            logger.warning(f"Could not persist patient PDF: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="medisense_health_guide.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


# ── Patient history ───────────────────────────────────────────────────────

def _safe_text(value: str | None) -> str:
    return value or ""


def _parse_specialists(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


@router.get("/history", response_model=HistoryListResponse)
async def list_patient_history(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """List every analysis this patient has ever uploaded, newest first."""
    result = await db.execute(
        select(PatientAnalysisRecord)
        .where(PatientAnalysisRecord.patient_id == _user.id)
        .order_by(PatientAnalysisRecord.created_at.desc())
    )
    records = result.scalars().all()

    items: list[HistoryItem] = []
    for r in records:
        items.append(
            HistoryItem(
                id=r.id,
                created_at=r.created_at.isoformat() if r.created_at else "",
                file_name=_safe_text(r.file_name),
                file_type=_safe_text(r.file_type),
                file_size=r.uploaded_file_size,
                summary=_safe_text(r.summary),
                urgency=_safe_text(r.urgency),
                has_uploaded_file=r.uploaded_file_data is not None,
                has_generated_pdf=r.generated_pdf_data is not None,
                generated_pdf_size=r.generated_pdf_size,
            )
        )

    return HistoryListResponse(patient_id=_user.id, items=items)


async def _load_owned_record(
    record_id: str, user_id: str, db: AsyncSession
) -> PatientAnalysisRecord:
    result = await db.execute(
        select(PatientAnalysisRecord).where(
            PatientAnalysisRecord.id == record_id,
            PatientAnalysisRecord.patient_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return record


@router.get("/history/{record_id}", response_model=HistoryDetail)
async def get_patient_history_item(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """Full detail for one past analysis — used to re-render the tab UI."""
    record = await _load_owned_record(record_id, _user.id, db)

    return HistoryDetail(
        id=record.id,
        created_at=record.created_at.isoformat() if record.created_at else "",
        file_name=_safe_text(record.file_name),
        file_type=_safe_text(record.file_type),
        file_size=record.uploaded_file_size,
        summary=_safe_text(record.summary),
        urgency=_safe_text(record.urgency),
        findings=json.loads(record.findings) if record.findings else [],
        specialists=_parse_specialists(record.specialists),
        diet_plan=json.loads(record.diet_plan) if record.diet_plan else {},
        exercise_plan=json.loads(record.exercise_plan) if record.exercise_plan else [],
        precautions=json.loads(record.precautions) if record.precautions else {},
        has_uploaded_file=record.uploaded_file_data is not None,
        has_generated_pdf=record.generated_pdf_data is not None,
        generated_pdf_size=record.generated_pdf_size,
    )


@router.get("/history/{record_id}/file")
async def download_history_upload(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """Stream the original file the patient uploaded back to the browser."""
    record = await _load_owned_record(record_id, _user.id, db)
    if not record.uploaded_file_data:
        raise HTTPException(status_code=404, detail="Original file not stored for this report")

    filename = safe_filename(record.file_name or f"report_{record_id}")
    return Response(
        content=record.uploaded_file_data,
        media_type=record.file_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Content-Length": str(len(record.uploaded_file_data)),
        },
    )


@router.get("/history/{record_id}/pdf")
async def download_history_pdf(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """Re-download the AI-generated health guide PDF from a past analysis."""
    record = await _load_owned_record(record_id, _user.id, db)
    if not record.generated_pdf_data:
        raise HTTPException(
            status_code=404,
            detail="No generated PDF for this report yet. Open it and click Download PDF first.",
        )

    return Response(
        content=record.generated_pdf_data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="medisense_health_guide_{record_id}.pdf"',
            "Content-Length": str(len(record.generated_pdf_data)),
        },
    )


# ── Lab biomarker trends ──────────────────────────────────────────────────


@router.get(
    "/{patient_id}/biomarker-trends",
    response_model=BiomarkerTrendResponse,
)
async def get_biomarker_trends(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("patient")),
):
    """Group every biomarker reading the patient has on file by canonical
    name and return a per-biomarker trend block (latest, previous, %
    change, direction, full history) ready for the trends chart."""
    if patient_id != _user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    grouped = await get_patient_biomarker_trends(patient_id, db)

    # Stable order: most-recently-updated biomarker first so the dashboard
    # opens to whatever the patient just uploaded.
    def _latest_iso(entry: dict) -> str:
        if entry["history"]:
            last = entry["history"][-1]
            return last.get("report_date") or last.get("created_at") or ""
        return ""

    sorted_entries = sorted(grouped.values(), key=_latest_iso, reverse=True)

    return BiomarkerTrendResponse(
        patient_id=patient_id,
        biomarkers=[
            BiomarkerTrend(
                biomarker_name=entry["biomarker_name"],
                unit=entry["unit"] or "",
                reference_min=entry["reference_min"],
                reference_max=entry["reference_max"],
                latest_value=entry["latest_value"],
                previous_value=entry["previous_value"],
                latest_status=entry["latest_status"],
                trend=entry["trend"],
                percent_change=entry["percent_change"],
                history=[BiomarkerReading(**r) for r in entry["history"]],
            )
            for entry in sorted_entries
        ],
    )
