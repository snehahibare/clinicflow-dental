import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.appointment import Appointment, AppointmentStatus, BookingSource
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.user import User
from app.schemas.appointment import (
    AdminAppointmentCreateRequest,
    AdminAppointmentReassignRequest,
    AppointmentCancelRequest,
    AppointmentCreateRequest,
    AppointmentRescheduleRequest,
    AppointmentResponse,
    DoctorSlotAvailabilityResponse,
)
from app.services.appointment_service import AppointmentService, clean_display_slot

router = APIRouter()


def _serialize_appointment(appt: Appointment) -> AppointmentResponse:
    pat_name = appt.patient.user.name if appt.patient and appt.patient.user else "Patient"
    pat_phone = appt.patient.user.phone if appt.patient and appt.patient.user else ""
    doc_name = appt.doctor.user.name if appt.doctor and appt.doctor.user else "Doctor"
    spec = appt.doctor.specialization if appt.doctor else "General Dentistry"

    return AppointmentResponse(
        id=appt.id,
        patient_id=appt.patient_id,
        doctor_id=appt.doctor_id,
        patient_name=pat_name,
        patient_phone=pat_phone,
        doctor_name=doc_name,
        specialization=spec,
        date=appt.date,
        time_slot=clean_display_slot(appt.time_slot),
        reason=appt.reason,
        status=appt.status,
        created_via=appt.created_via,
        cancellation_reason=appt.cancellation_reason,
        is_late_cancellation=appt.is_late_cancellation,
        needs_reassignment=appt.needs_reassignment,
        reassigned_from_doctor_id=appt.reassigned_from_doctor_id,
        created_at=appt.created_at,
    )


@router.get(
    "/available-slots",
    response_model=DoctorSlotAvailabilityResponse,
    summary="Get free slots for a doctor on a specific date",
)
async def get_available_slots(
    doctor_id: str = Query(..., description="Doctor ID"),
    date: datetime.date = Query(..., description="Target appointment date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
):
    slots, doctor, is_working = await AppointmentService.get_available_slots(db, doctor_id, date)
    doc_name = doctor.user.name if doctor.user else "Doctor"
    msg = None
    if not is_working:
        msg = f"{doc_name} does not have practice shifts scheduled for {date.strftime('%A')}s."

    return DoctorSlotAvailabilityResponse(
        doctor_id=doctor.id,
        doctor_name=doc_name,
        specialization=doctor.specialization,
        date=date,
        available_slots=slots,
        is_working_day=is_working,
        message=msg,
    )


@router.post(
    "/book",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Patient books an appointment",
    dependencies=[Depends(require_role("patient"))],
)
async def book_appointment(
    payload: AppointmentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Resolve Patient profile
    pat_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
    patient = pat_res.scalars().first()
    if not patient:
        patient = Patient(user_id=current_user.id)
        db.add(patient)
        await db.flush()

    appt = await AppointmentService.book_appointment(
        db=db,
        patient_id=patient.id,
        doctor_id=payload.doctor_id,
        appointment_date=payload.date,
        time_slot=payload.time_slot,
        reason=payload.reason,
        created_via=BookingSource.APP,
    )
    return _serialize_appointment(appt)


@router.get(
    "/my",
    response_model=List[AppointmentResponse],
    summary="Patient retrieves their appointments",
    dependencies=[Depends(require_role("patient"))],
)
async def get_my_appointments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pat_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
    patient = pat_res.scalars().first()
    if not patient:
        return []

    stmt = (
        select(Appointment)
        .where(Appointment.patient_id == patient.id)
        .options(
            selectinload(Appointment.patient).selectinload(Patient.user),
            selectinload(Appointment.doctor).selectinload(Doctor.user),
        )
        .order_by(desc(Appointment.date), desc(Appointment.created_at))
    )
    result = await db.execute(stmt)
    appts = result.scalars().all()
    return [_serialize_appointment(a) for a in appts]


@router.post(
    "/{appointment_id}/reschedule",
    response_model=AppointmentResponse,
    summary="Reschedule an appointment to a new date/slot",
)
async def reschedule_appointment(
    appointment_id: str,
    payload: AppointmentRescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    appt = await AppointmentService.reschedule_appointment(
        db=db,
        appointment_id=appointment_id,
        current_user=current_user,
        new_date=payload.new_date,
        new_time_slot=payload.new_time_slot,
    )
    return _serialize_appointment(appt)


@router.post(
    "/{appointment_id}/cancel",
    response_model=AppointmentResponse,
    summary="Cancel an appointment with required reason",
)
async def cancel_appointment(
    appointment_id: str,
    payload: AppointmentCancelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    appt = await AppointmentService.cancel_appointment(
        db=db,
        appointment_id=appointment_id,
        current_user=current_user,
        cancellation_reason=payload.cancellation_reason,
    )
    return _serialize_appointment(appt)


@router.get(
    "/doctor/schedule",
    response_model=List[AppointmentResponse],
    summary="Doctor views their daily schedule",
    dependencies=[Depends(require_role("doctor"))],
)
async def get_doctor_daily_schedule(
    date: Optional[datetime.date] = Query(None, description="Date (defaults to today)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_date = date or datetime.date.today()
    doc_res = await db.execute(select(Doctor).where(Doctor.user_id == current_user.id))
    doctor = doc_res.scalars().first()
    if not doctor:
        return []

    stmt = (
        select(Appointment)
        .where(
            Appointment.doctor_id == doctor.id,
            Appointment.date == target_date,
        )
        .options(
            selectinload(Appointment.patient).selectinload(Patient.user),
            selectinload(Appointment.doctor).selectinload(Doctor.user),
        )
        .order_by(Appointment.time_slot.asc())
    )
    result = await db.execute(stmt)
    appts = result.scalars().all()
    return [_serialize_appointment(a) for a in appts]


@router.get(
    "/admin/schedule",
    response_model=List[AppointmentResponse],
    summary="Admin views full clinic schedule across all doctors",
    dependencies=[Depends(require_role("admin"))],
)
async def get_admin_clinic_schedule(
    date: Optional[datetime.date] = Query(None, description="Date (defaults to today)"),
    doctor_id: Optional[str] = Query(None, description="Optional doctor filter"),
    db: AsyncSession = Depends(get_db),
):
    target_date = date or datetime.date.today()
    stmt = (
        select(Appointment)
        .where(Appointment.date == target_date)
        .options(
            selectinload(Appointment.patient).selectinload(Patient.user),
            selectinload(Appointment.doctor).selectinload(Doctor.user),
        )
        .order_by(Appointment.time_slot.asc())
    )
    if doctor_id:
        stmt = stmt.where(Appointment.doctor_id == doctor_id)

    result = await db.execute(stmt)
    appts = result.scalars().all()
    return [_serialize_appointment(a) for a in appts]


@router.get(
    "/admin/schedule/week",
    response_model=List[AppointmentResponse],
    summary="Admin views full clinic schedule for a 7-day week window",
    dependencies=[Depends(require_role("admin"))],
)
async def get_admin_week_schedule(
    start_date: Optional[datetime.date] = Query(None, description="Week start date (defaults to current Monday)"),
    doctor_id: Optional[str] = Query(None, description="Optional doctor filter"),
    db: AsyncSession = Depends(get_db),
):
    if not start_date:
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=today.weekday())
    end_date = start_date + datetime.timedelta(days=6)

    stmt = (
        select(Appointment)
        .where(Appointment.date >= start_date, Appointment.date <= end_date)
        .options(
            selectinload(Appointment.patient).selectinload(Patient.user),
            selectinload(Appointment.doctor).selectinload(Doctor.user),
        )
        .order_by(Appointment.date.asc(), Appointment.time_slot.asc())
    )
    if doctor_id:
        stmt = stmt.where(Appointment.doctor_id == doctor_id)

    result = await db.execute(stmt)
    appts = result.scalars().all()
    return [_serialize_appointment(a) for a in appts]


@router.post(
    "/admin/book",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Admin manually books on behalf of a patient",
    dependencies=[Depends(require_role("admin"))],
)
async def admin_book_appointment(
    payload: AdminAppointmentCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    appt = await AppointmentService.book_appointment(
        db=db,
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id,
        appointment_date=payload.date,
        time_slot=payload.time_slot,
        reason=payload.reason,
        created_via=BookingSource.ADMIN,
    )
    return _serialize_appointment(appt)


@router.put(
    "/admin/{appointment_id}/reassign",
    response_model=AppointmentResponse,
    summary="Admin reassigns appointment to another doctor/slot",
    dependencies=[Depends(require_role("admin"))],
)
async def admin_reassign_appointment(
    appointment_id: str,
    payload: AdminAppointmentReassignRequest,
    db: AsyncSession = Depends(get_db),
):
    appt = await AppointmentService.reassign_appointment(
        db=db,
        appointment_id=appointment_id,
        new_doctor_id=payload.new_doctor_id,
        new_date=payload.new_date,
        new_time_slot=payload.new_time_slot,
    )
    return _serialize_appointment(appt)


@router.get(
    "/admin/reassignments-needed",
    response_model=List[AppointmentResponse],
    summary="Admin retrieves list of appointments flagged for reassignment",
    dependencies=[Depends(require_role("admin"))],
)
async def get_reassignments_needed(
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    stmt = (
        select(Appointment)
        .where(
            Appointment.needs_reassignment == True,
            Appointment.date >= today,
            Appointment.status == AppointmentStatus.BOOKED,
        )
        .options(
            selectinload(Appointment.patient).selectinload(Patient.user),
            selectinload(Appointment.doctor).selectinload(Doctor.user),
        )
        .order_by(Appointment.date.asc())
    )
    result = await db.execute(stmt)
    appts = result.scalars().all()
    return [_serialize_appointment(a) for a in appts]
