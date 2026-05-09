"""
medications.py — Medication tracker + drug-interaction API.

All routes require an authenticated user. Routes are scoped by patient_id;
non-admin callers can only operate on their own ledger (the patient
themselves). The patient's own user record is used as the source of truth
for ownership.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    MedicationInteractionAlert,
    PatientMedication,
    User,
    get_db,
)
from services import claude_service
from services.auth_service import get_current_user
from services.medication_service import (
    generate_adherence_reminder,
    get_patient_medications,
    run_interaction_check,
    save_medications,
)
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/medications", tags=["medications"])


# ── Pydantic shapes ──────────────────────────────────────────────────────

class MedicationOut(BaseModel):
    id: str
    drug_name: str
    dosage: str | None = None
    frequency: str | None = None
    prescribed_by: str | None = None
    start_date: str | None = None
    is_active: bool
    source: str
    notes: str | None = None
    created_at: str


class MedicationListResponse(BaseModel):
    patient_id: str
    medications: list[MedicationOut] = Field(default_factory=list)


class AddMedicationRequest(BaseModel):
    drug_name: str
    dosage: str | None = None
    frequency: str | None = None
    notes: str | None = None


class InteractionAlertOut(BaseModel):
    id: str
    drug_a: str
    drug_b: str
    severity: str
    description: str | None = None
    source: str
    created_at: str
    is_dismissed: bool


class InteractionListResponse(BaseModel):
    patient_id: str
    alerts: list[InteractionAlertOut] = Field(default_factory=list)


class AdherenceReminderResponse(BaseModel):
    patient_id: str
    message: str


# ── Helpers ──────────────────────────────────────────────────────────────

def _ensure_owner(patient_id: str, user: User) -> None:
    """Patients may only touch their own ledger; anyone else is denied."""
    if user.role != "patient" or user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _serialize_med(m: PatientMedication) -> MedicationOut:
    return MedicationOut(
        id=m.id,
        drug_name=m.drug_name,
        dosage=m.dosage,
        frequency=m.frequency,
        prescribed_by=m.prescribed_by,
        start_date=m.start_date,
        is_active=bool(m.is_active),
        source=m.source,
        notes=m.notes,
        created_at=m.created_at.isoformat() if m.created_at else "",
    )


def _serialize_alert(a: MedicationInteractionAlert) -> InteractionAlertOut:
    return InteractionAlertOut(
        id=a.id,
        drug_a=a.drug_a,
        drug_b=a.drug_b,
        severity=a.severity,
        description=a.description,
        source=a.source,
        created_at=a.created_at.isoformat() if a.created_at else "",
        is_dismissed=bool(a.is_dismissed),
    )


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/{patient_id}", response_model=MedicationListResponse)
async def list_medications(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ensure_owner(patient_id, user)
    meds = await get_patient_medications(patient_id, db)
    return MedicationListResponse(
        patient_id=patient_id,
        medications=[_serialize_med(m) for m in meds],
    )


@router.post("/{patient_id}/add", response_model=MedicationOut)
async def add_medication(
    patient_id: str,
    body: AddMedicationRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ensure_owner(patient_id, user)
    name = (body.drug_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="drug_name is required")

    saved = await save_medications(
        patient_id=patient_id,
        medications=[{
            "drug_name": name,
            "dosage": body.dosage or "",
            "frequency": body.frequency or "",
            "notes": body.notes or "",
        }],
        source="manual",
        db_session=db,
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Could not save medication")
    return _serialize_med(saved[0])


@router.delete("/{patient_id}/{med_id}", response_model=MedicationOut)
async def soft_delete_medication(
    patient_id: str,
    med_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ensure_owner(patient_id, user)
    result = await db.execute(
        select(PatientMedication).where(
            PatientMedication.id == med_id,
            PatientMedication.patient_id == patient_id,
        )
    )
    med = result.scalar_one_or_none()
    if med is None:
        raise HTTPException(status_code=404, detail="Medication not found")
    # Integer column under the hood — assign 0, not Python False, so the
    # UPDATE bind-param round-trip on Postgres is unambiguous.
    med.is_active = 0
    await db.commit()
    await db.refresh(med)
    return _serialize_med(med)


@router.get("/{patient_id}/interactions", response_model=InteractionListResponse)
async def check_interactions(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ensure_owner(patient_id, user)
    alerts = await run_interaction_check(patient_id, db, claude_service)
    return InteractionListResponse(
        patient_id=patient_id,
        alerts=[_serialize_alert(a) for a in alerts],
    )


@router.post(
    "/{patient_id}/dismiss-alert/{alert_id}",
    response_model=InteractionAlertOut,
)
async def dismiss_alert(
    patient_id: str,
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ensure_owner(patient_id, user)
    result = await db.execute(
        select(MedicationInteractionAlert).where(
            MedicationInteractionAlert.id == alert_id,
            MedicationInteractionAlert.patient_id == patient_id,
        )
    )
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_dismissed = 1
    await db.commit()
    await db.refresh(alert)
    return _serialize_alert(alert)


@router.get(
    "/{patient_id}/adherence-reminder",
    response_model=AdherenceReminderResponse,
)
async def adherence_reminder(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ensure_owner(patient_id, user)
    meds = await get_patient_medications(patient_id, db)
    first_name = (user.full_name or "").split(" ")[0] if user.full_name else ""
    message = await generate_adherence_reminder(first_name, meds, claude_service)
    return AdherenceReminderResponse(patient_id=patient_id, message=message)
