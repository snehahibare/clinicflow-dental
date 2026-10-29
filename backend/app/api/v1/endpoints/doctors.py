from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.appointment import Appointment
from app.models.doctor import Doctor, DoctorStatus
from app.models.patient import Patient
from app.models.user import User
from app.schemas.doctor import (
    DoctorResponse,
    DoctorScheduleResponse,
    DoctorStatusUpdate,
    DoctorUpdate,
)
from app.schemas.patient import PatientSearchItem

router = APIRouter()


def _serialize_doctor(doctor: Doctor) -> DoctorResponse:
    # Ensure available_slots format is JSON-serializable list of dicts
    clean_slots = {}
    if doctor.available_slots and isinstance(doctor.available_slots, dict):
        for day, slots in doctor.available_slots.items():
            if isinstance(slots, list):
                clean_slots[day] = [
                    s if isinstance(s, dict) else s.model_dump() for s in slots
                ]
            else:
                clean_slots[day] = []

    return DoctorResponse(
        id=doctor.id,
        user_id=doctor.user_id,
        name=doctor.user.name if doctor.user else "Doctor",
        email=doctor.user.email if doctor.user else "",
        phone=doctor.user.phone if doctor.user else "",
        specialization=doctor.specialization,
        available_days=doctor.available_days or [],
        available_slots=clean_slots,
        status=doctor.status,
        created_at=doctor.created_at,
    )


@router.get(
    "/",
    response_model=List[DoctorResponse],
    summary="List all clinic doctors",
)
async def list_doctors(
    status_filter: Optional[DoctorStatus] = Query(None, alias="status"),
    specialization: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Doctor)
        .options(selectinload(Doctor.user))
        .order_by(Doctor.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Doctor.status == status_filter)
    if specialization:
        stmt = stmt.where(Doctor.specialization.ilike(f"%{specialization}%"))

    result = await db.execute(stmt)
    doctors = result.scalars().all()
    return [_serialize_doctor(doc) for doc in doctors]


@router.get(
    "/me/schedule",
    response_model=DoctorScheduleResponse,
    summary="Logged-in doctor views their own schedule",
    dependencies=[Depends(require_role("doctor"))],
)
async def get_my_schedule(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Doctor)
        .where(Doctor.user_id == current_user.id)
        .options(selectinload(Doctor.user))
    )
    result = await db.execute(stmt)
    doctor = result.scalars().first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found for this user account.",
        )

    clean_slots = {}
    if doctor.available_slots and isinstance(doctor.available_slots, dict):
        for day, slots in doctor.available_slots.items():
            if isinstance(slots, list):
                clean_slots[day] = [
                    s if isinstance(s, dict) else s.model_dump() for s in slots
                ]

    return DoctorScheduleResponse(
        doctor_id=doctor.id,
        name=current_user.name,
        specialization=doctor.specialization,
        status=doctor.status,
        available_days=doctor.available_days or [],
        available_slots=clean_slots,
    )


@router.get(
    "/me/patients",
    response_model=List[PatientSearchItem],
    summary="Doctor views assigned patients list",
    dependencies=[Depends(require_role("doctor"))],
)
async def get_my_assigned_patients(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt_doc = select(Doctor).where(Doctor.user_id == current_user.id)
    doc_res = await db.execute(stmt_doc)
    doctor = doc_res.scalars().first()
    if not doctor:
        return []

    # Query distinct patients who have appointments with this doctor
    stmt = (
        select(Patient)
        .join(Appointment, Appointment.patient_id == Patient.id)
        .where(Appointment.doctor_id == doctor.id)
        .options(selectinload(Patient.user))
        .distinct()
    )
    result = await db.execute(stmt)
    patients = result.scalars().all()

    return [
        PatientSearchItem(
            id=p.id,
            user_id=p.user_id,
            name=p.user.name,
            email=p.user.email,
            phone=p.user.phone,
            dob=p.dob,
            gender=p.gender,
            allergies=p.allergies,
            emergency_contact=p.emergency_contact,
        )
        for p in patients
        if p.user
    ]


@router.get(
    "/{doctor_id}",
    response_model=DoctorResponse,
    summary="Get doctor profile by ID",
)
async def get_doctor_by_id(
    doctor_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Doctor)
        .where(Doctor.id == doctor_id)
        .options(selectinload(Doctor.user))
    )
    result = await db.execute(stmt)
    doctor = result.scalars().first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )
    return _serialize_doctor(doctor)


@router.put(
    "/{doctor_id}",
    response_model=DoctorResponse,
    summary="Admin edits doctor profile (specialization, availability slots, status)",
    dependencies=[Depends(require_role("admin"))],
)
async def update_doctor_profile(
    doctor_id: str,
    payload: DoctorUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Doctor)
        .where(Doctor.id == doctor_id)
        .options(selectinload(Doctor.user))
    )
    result = await db.execute(stmt)
    doctor = result.scalars().first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    if payload.specialization is not None:
        doctor.specialization = payload.specialization.strip()

    if payload.available_days is not None:
        doctor.available_days = payload.available_days

    if payload.available_slots is not None:
        # Serialize TimeSlot objects to dicts for JSON storage
        serialized_slots = {
            day: [s.model_dump() for s in slots]
            for day, slots in payload.available_slots.items()
        }
        doctor.available_slots = serialized_slots

    if payload.status is not None:
        doctor.status = payload.status

    await db.commit()
    await db.refresh(doctor)
    return _serialize_doctor(doctor)


@router.patch(
    "/{doctor_id}/status",
    response_model=DoctorResponse,
    summary="Admin toggles doctor active/inactive status",
    dependencies=[Depends(require_role("admin"))],
)
async def toggle_doctor_status(
    doctor_id: str,
    payload: DoctorStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Doctor)
        .where(Doctor.id == doctor_id)
        .options(selectinload(Doctor.user))
    )
    result = await db.execute(stmt)
    doctor = result.scalars().first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    doctor.status = payload.status
    await db.commit()
    await db.refresh(doctor)

    if payload.status == DoctorStatus.INACTIVE:
        from app.services.appointment_service import AppointmentService
        await AppointmentService.flag_appointments_for_inactive_doctor(db, doctor.id)

    return _serialize_doctor(doctor)
