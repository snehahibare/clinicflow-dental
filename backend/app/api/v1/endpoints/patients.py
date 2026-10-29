from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.appointment import Appointment
from app.models.billing import Bill
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.treatment import TreatmentRecord
from app.models.user import User, UserRole
from app.schemas.patient import (
    PatientBillItem,
    PatientProfileResponse,
    PatientProfileUpdate,
    PatientRecordItem,
    PatientSearchItem,
)

router = APIRouter()


@router.get(
    "/me",
    response_model=PatientProfileResponse,
    summary="Get current logged-in patient profile",
    dependencies=[Depends(require_role("patient"))],
)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Patient)
        .where(Patient.user_id == current_user.id)
        .options(selectinload(Patient.user))
    )
    result = await db.execute(stmt)
    patient = result.scalars().first()

    if not patient:
        # Create profile if not yet created
        patient = Patient(user_id=current_user.id)
        db.add(patient)
        await db.commit()
        await db.refresh(patient, ["user"])

    return PatientProfileResponse(
        id=patient.id,
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        dob=patient.dob,
        gender=patient.gender,
        address=patient.address,
        allergies=patient.allergies,
        emergency_contact=patient.emergency_contact,
        created_at=patient.created_at,
    )


@router.put(
    "/me",
    response_model=PatientProfileResponse,
    summary="Update current logged-in patient profile",
    dependencies=[Depends(require_role("patient"))],
)
async def update_my_profile(
    payload: PatientProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Patient)
        .where(Patient.user_id == current_user.id)
        .options(selectinload(Patient.user))
    )
    result = await db.execute(stmt)
    patient = result.scalars().first()

    if not patient:
        patient = Patient(user_id=current_user.id)
        db.add(patient)

    # Update patient medical details
    if payload.dob is not None:
        patient.dob = payload.dob
    if payload.gender is not None:
        patient.gender = payload.gender
    if payload.address is not None:
        patient.address = payload.address.strip()
    if payload.allergies is not None:
        patient.allergies = payload.allergies.strip()
    if payload.emergency_contact is not None:
        patient.emergency_contact = payload.emergency_contact.strip()

    # Update user basic details if provided
    if payload.name is not None:
        current_user.name = payload.name.strip()
    if payload.phone is not None:
        # Check if phone number conflicts with another account
        existing_phone = await db.execute(
            select(User).where(User.phone == payload.phone.strip(), User.id != current_user.id)
        )
        if existing_phone.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this phone number already exists.",
            )
        current_user.phone = payload.phone.strip()

    await db.commit()
    await db.refresh(patient)
    await db.refresh(current_user)

    return PatientProfileResponse(
        id=patient.id,
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        dob=patient.dob,
        gender=patient.gender,
        address=patient.address,
        allergies=patient.allergies,
        emergency_contact=patient.emergency_contact,
        created_at=patient.created_at,
    )


@router.get(
    "/me/records",
    response_model=List[PatientRecordItem],
    summary="Get logged-in patient's treatment and appointment history",
    dependencies=[Depends(require_role("patient"))],
)
async def get_my_records(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patient_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
    patient = patient_res.scalars().first()
    if not patient:
        return []

    stmt = (
        select(Appointment)
        .where(Appointment.patient_id == patient.id)
        .options(
            selectinload(Appointment.doctor).selectinload(Doctor.user),
            selectinload(Appointment.treatment_record),
        )
        .order_by(Appointment.date.desc())
    )
    result = await db.execute(stmt)
    appointments = result.scalars().all()

    records: List[PatientRecordItem] = []
    for appt in appointments:
        doc_name = appt.doctor.user.name if appt.doctor and appt.doctor.user else "Staff Doctor"
        spec = appt.doctor.specialization if appt.doctor else "General Dentistry"
        tr = appt.treatment_record

        records.append(
            PatientRecordItem(
                id=tr.id if tr else appt.id,
                appointment_id=appt.id,
                date=appt.date,
                doctor_name=doc_name,
                specialization=spec,
                reason=appt.reason,
                diagnosis=tr.diagnosis if tr else None,
                procedure=tr.procedure if tr else None,
                prescription=tr.prescription if tr else None,
                follow_up_date=tr.follow_up_date if tr else None,
            )
        )
    return records


@router.get(
    "/me/bills",
    response_model=List[PatientBillItem],
    summary="Get logged-in patient's billing history",
    dependencies=[Depends(require_role("patient"))],
)
async def get_my_bills(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patient_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
    patient = patient_res.scalars().first()
    if not patient:
        return []

    stmt = (
        select(Bill)
        .join(Appointment, Bill.appointment_id == Appointment.id)
        .where(Appointment.patient_id == patient.id)
        .options(
            selectinload(Bill.appointment)
            .selectinload(Appointment.doctor)
            .selectinload(Doctor.user)
        )
        .order_by(Bill.created_at.desc())
    )
    result = await db.execute(stmt)
    bills = result.scalars().all()

    items: List[PatientBillItem] = []
    for b in bills:
        doc_name = "Staff Doctor"
        if b.appointment and b.appointment.doctor and b.appointment.doctor.user:
            doc_name = b.appointment.doctor.user.name

        items.append(
            PatientBillItem(
                id=b.id,
                appointment_id=b.appointment_id,
                date=b.appointment.date if b.appointment else b.created_at.date(),
                doctor_name=doc_name,
                amount=float(b.amount),
                status=b.status.value if hasattr(b.status, "value") else str(b.status),
                payment_date=b.payment_date,
            )
        )
    return items


@router.get(
    "/search",
    response_model=List[PatientSearchItem],
    summary="Search patients by name or phone (case-insensitive partial match)",
    dependencies=[Depends(require_role("admin", "doctor"))],
)
async def search_patients(
    q: str = Query("", description="Partial name or phone number query"),
    db: AsyncSession = Depends(get_db),
):
    query_str = q.strip().lower()

    stmt = (
        select(Patient)
        .join(User, Patient.user_id == User.id)
        .options(selectinload(Patient.user))
        .order_by(User.name.asc())
    )

    if query_str:
        stmt = stmt.where(
            or_(
                func.lower(User.name).contains(query_str),
                User.phone.contains(query_str),
            )
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
    "/{patient_id}",
    response_model=PatientProfileResponse,
    summary="Get patient details by patient ID (Admin/Doctor only)",
    dependencies=[Depends(require_role("admin", "doctor"))],
)
async def get_patient_by_id(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Patient)
        .where(Patient.id == patient_id)
        .options(selectinload(Patient.user))
    )
    result = await db.execute(stmt)
    patient = result.scalars().first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )

    return PatientProfileResponse(
        id=patient.id,
        user_id=patient.user_id,
        name=patient.user.name,
        email=patient.user.email,
        phone=patient.user.phone,
        dob=patient.dob,
        gender=patient.gender,
        address=patient.address,
        allergies=patient.allergies,
        emergency_contact=patient.emergency_contact,
        created_at=patient.created_at,
    )


@router.put(
    "/{patient_id}",
    response_model=PatientProfileResponse,
    summary="Update patient profile by ID (Admin or authorized owner)",
)
async def update_patient_by_id(
    patient_id: str,
    payload: PatientProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Patient)
        .where(Patient.id == patient_id)
        .options(selectinload(Patient.user))
    )
    result = await db.execute(stmt)
    patient = result.scalars().first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )

    # Edge case: Patient CANNOT edit another patient's profile!
    user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if user_role == "patient" and patient.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot modify another patient's profile.",
        )

    # Only Admin or the patient themselves can edit
    if user_role not in ["admin", "patient"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Insufficient permissions to edit patient records.",
        )

    if payload.dob is not None:
        patient.dob = payload.dob
    if payload.gender is not None:
        patient.gender = payload.gender
    if payload.address is not None:
        patient.address = payload.address.strip()
    if payload.allergies is not None:
        patient.allergies = payload.allergies.strip()
    if payload.emergency_contact is not None:
        patient.emergency_contact = payload.emergency_contact.strip()

    if payload.name is not None and patient.user:
        patient.user.name = payload.name.strip()
    if payload.phone is not None and patient.user:
        patient.user.phone = payload.phone.strip()

    await db.commit()
    await db.refresh(patient)

    return PatientProfileResponse(
        id=patient.id,
        user_id=patient.user_id,
        name=patient.user.name,
        email=patient.user.email,
        phone=patient.user.phone,
        dob=patient.dob,
        gender=patient.gender,
        address=patient.address,
        allergies=patient.allergies,
        emergency_contact=patient.emergency_contact,
        created_at=patient.created_at,
    )
