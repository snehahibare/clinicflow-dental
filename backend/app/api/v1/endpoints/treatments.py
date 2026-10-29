from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.user import User
from app.schemas.treatment import (
    DoctorFollowUpItem,
    TreatmentRecordCreateRequest,
    TreatmentRecordResponse,
    TreatmentRecordUpdateRequest,
)
from app.services.treatment_service import TreatmentService

router = APIRouter(prefix="/treatments", tags=["Treatment Records"])


@router.post(
    "/appointment/{appointment_id}",
    response_model=TreatmentRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Conducting doctor adds treatment record, flips appointment to completed, and creates bill",
    dependencies=[Depends(require_role("doctor"))],
)
async def create_treatment_record(
    appointment_id: str,
    payload: TreatmentRecordCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await TreatmentService.create_treatment_record(
        db=db,
        appointment_id=appointment_id,
        current_user=current_user,
        payload=payload,
    )


@router.put(
    "/appointment/{appointment_id}",
    response_model=TreatmentRecordResponse,
    summary="Conducting doctor updates an existing treatment record",
    dependencies=[Depends(require_role("doctor"))],
)
async def update_treatment_record(
    appointment_id: str,
    payload: TreatmentRecordUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await TreatmentService.update_treatment_record(
        db=db,
        appointment_id=appointment_id,
        current_user=current_user,
        payload=payload,
    )


@router.get(
    "/appointment/{appointment_id}",
    response_model=TreatmentRecordResponse,
    summary="Get treatment record for an appointment (Conducting Doctor, Patient, or Admin)",
)
async def get_treatment_record(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await TreatmentService.get_treatment_record_by_appointment(
        db=db,
        appointment_id=appointment_id,
        current_user=current_user,
    )


@router.get(
    "/doctor/follow-ups",
    response_model=List[DoctorFollowUpItem],
    summary="Doctor views upcoming patient follow-ups",
    dependencies=[Depends(require_role("doctor"))],
)
async def get_doctor_follow_ups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await TreatmentService.get_doctor_upcoming_follow_ups(
        db=db,
        current_user=current_user,
    )
