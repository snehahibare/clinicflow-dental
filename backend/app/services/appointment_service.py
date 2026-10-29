import datetime
from typing import List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.appointment import Appointment, AppointmentStatus, BookingSource
from app.models.doctor import Doctor, DoctorStatus
from app.models.notification import NotificationChannel, NotificationLog, NotificationStatus
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.services.notification_service import NotificationService


def clean_display_slot(slot_str: str) -> str:
    # Strips internal #cancelled tag if present
    if "#cancelled" in slot_str:
        return slot_str.split("#cancelled")[0]
    return slot_str


def parse_slot_start_time(slot_str: str) -> datetime.time:
    # Extracts starting HH:MM from "09:00 - 09:30" or "09:00"
    clean = clean_display_slot(slot_str)
    start_part = clean.split("-")[0].strip()
    return datetime.datetime.strptime(start_part, "%H:%M").time()


def generate_30min_slots(start_str: str, end_str: str) -> List[str]:
    slots = []
    curr = datetime.datetime.strptime(start_str.strip(), "%H:%M")
    end = datetime.datetime.strptime(end_str.strip(), "%H:%M")
    step = datetime.timedelta(minutes=30)

    while curr + step <= end:
        next_t = curr + step
        slot_label = f"{curr.strftime('%H:%M')} - {next_t.strftime('%H:%M')}"
        slots.append(slot_label)
        curr = next_t
    return slots


class AppointmentService:
    @classmethod
    async def get_full_appointment(cls, db: AsyncSession, appointment_id: str) -> Optional[Appointment]:
        stmt = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                selectinload(Appointment.patient).selectinload(Patient.user),
                selectinload(Appointment.doctor).selectinload(Doctor.user),
            )
        )
        res = await db.execute(stmt)
        return res.scalars().first()

    @classmethod
    async def get_available_slots(
        cls, db: AsyncSession, doctor_id: str, target_date: datetime.date
    ) -> Tuple[List[str], Doctor, bool]:
        today = datetime.date.today()
        if target_date < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot query or book appointment slots in the past.",
            )

        doc_stmt = (
            select(Doctor)
            .where(Doctor.id == doctor_id)
            .options(selectinload(Doctor.user))
        )
        res = await db.execute(doc_stmt)
        doctor = res.scalars().first()
        if not doctor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor not found.",
            )

        if doctor.status != DoctorStatus.ACTIVE:
            return [], doctor, False

        day_name = target_date.strftime("%A")
        if not doctor.available_days or day_name not in doctor.available_days:
            return [], doctor, False

        # Generate discrete slots from weekly availability
        day_shifts = doctor.available_slots.get(day_name, [])
        all_slots: List[str] = []
        for shift in day_shifts:
            start_t = shift.get("start") if isinstance(shift, dict) else shift.start
            end_t = shift.get("end") if isinstance(shift, dict) else shift.end
            if start_t and end_t:
                all_slots.extend(generate_30min_slots(start_t, end_t))

        # Query booked appointments for this doctor & date
        booked_stmt = (
            select(Appointment.time_slot)
            .where(
                Appointment.doctor_id == doctor_id,
                Appointment.date == target_date,
                Appointment.status == AppointmentStatus.BOOKED,
            )
        )
        booked_res = await db.execute(booked_stmt)
        booked_slots = set(booked_res.scalars().all())

        now_time = datetime.datetime.now().time()
        available = []
        for s in all_slots:
            if s in booked_slots:
                continue
            # If target_date is today, filter out slots already in the past
            if target_date == today:
                slot_start = parse_slot_start_time(s)
                if slot_start <= now_time:
                    continue
            available.append(s)

        return available, doctor, True

    @classmethod
    async def book_appointment(
        cls,
        db: AsyncSession,
        patient_id: str,
        doctor_id: str,
        appointment_date: datetime.date,
        time_slot: str,
        reason: str,
        created_via: BookingSource = BookingSource.APP,
    ) -> Appointment:
        clean_slot = clean_display_slot(time_slot)
        today = datetime.date.today()

        # Edge case: Block booking in the past
        if appointment_date < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot book appointments in the past.",
            )
        if appointment_date == today:
            slot_start = parse_slot_start_time(clean_slot)
            if slot_start <= datetime.datetime.now().time():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected time slot has already passed today.",
                )

        # Check doctor status
        doc_stmt = (
            select(Doctor)
            .where(Doctor.id == doctor_id)
            .options(selectinload(Doctor.user))
        )
        res = await db.execute(doc_stmt)
        doctor = res.scalars().first()
        if not doctor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")
        if doctor.status != DoctorStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doctor is currently inactive and cannot accept bookings.",
            )

        day_name = appointment_date.strftime("%A")
        if not doctor.available_days or day_name not in doctor.available_days:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Doctor does not practice on {day_name}s.",
            )

        # Layer 1: Concurrency check within transaction
        existing_stmt = (
            select(Appointment)
            .where(
                Appointment.doctor_id == doctor_id,
                Appointment.date == appointment_date,
                Appointment.time_slot == clean_slot,
                Appointment.status == AppointmentStatus.BOOKED,
            )
        )
        existing = (await db.execute(existing_stmt)).scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time slot is no longer available. Please select another slot.",
            )

        # Layer 2: Insert appointment protected by DB UniqueConstraint
        appointment = Appointment(
            patient_id=patient_id,
            doctor_id=doctor_id,
            date=appointment_date,
            time_slot=clean_slot,
            reason=reason.strip(),
            status=AppointmentStatus.BOOKED,
            created_via=created_via,
            is_late_cancellation=False,
            needs_reassignment=False,
        )
        db.add(appointment)

        try:
            await db.commit()
            await db.refresh(appointment, ["patient", "doctor"])
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time slot is no longer available. Please select another slot.",
            )

        full_appt = await cls.get_full_appointment(db, appointment.id)
        if full_appt:
            await NotificationService.send_booking_confirmation(db, full_appt)
        return full_appt

    @classmethod
    async def cancel_appointment(
        cls,
        db: AsyncSession,
        appointment_id: str,
        current_user: User,
        cancellation_reason: str,
    ) -> Appointment:
        stmt = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                selectinload(Appointment.patient).selectinload(Patient.user),
                selectinload(Appointment.doctor).selectinload(Doctor.user),
            )
        )
        res = await db.execute(stmt)
        appointment = res.scalars().first()
        if not appointment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

        if appointment.status == AppointmentStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Appointment is already cancelled.")

        # RBAC Check
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role == "patient":
            if not appointment.patient or appointment.patient.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden: You cannot cancel another patient's appointment.",
                )
        elif user_role == "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctors cannot cancel patient appointments directly. Please contact clinic administration.",
            )

        # Calculate time to appointment for late cancellation check
        clean_slot = clean_display_slot(appointment.time_slot)
        start_time = parse_slot_start_time(clean_slot)
        appointment_dt = datetime.datetime.combine(appointment.date, start_time)
        now_dt = datetime.datetime.now()
        hours_until = (appointment_dt - now_dt).total_seconds() / 3600.0

        is_late = 0 <= hours_until < 2.0

        appointment.is_late_cancellation = is_late
        appointment.cancellation_reason = cancellation_reason.strip()
        appointment.status = AppointmentStatus.CANCELLED
        appointment.time_slot = clean_slot

        await db.commit()
        await db.refresh(appointment)

        full_appt = await cls.get_full_appointment(db, appointment.id)
        if full_appt:
            await NotificationService.send_cancellation_confirmation(
                db, full_appt, cancellation_reason=cancellation_reason, is_late=is_late
            )
        return full_appt

    @classmethod
    async def reschedule_appointment(
        cls,
        db: AsyncSession,
        appointment_id: str,
        current_user: User,
        new_date: datetime.date,
        new_time_slot: str,
    ) -> Appointment:
        clean_new_slot = clean_display_slot(new_time_slot)
        today = datetime.date.today()

        if new_date < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reschedule to a past date.",
            )
        if new_date == today:
            slot_start = parse_slot_start_time(clean_new_slot)
            if slot_start <= datetime.datetime.now().time():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected new time slot has already passed today.",
                )

        stmt = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                selectinload(Appointment.patient).selectinload(Patient.user),
                selectinload(Appointment.doctor).selectinload(Doctor.user),
            )
        )
        res = await db.execute(stmt)
        appointment = res.scalars().first()
        if not appointment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

        # RBAC Check
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role == "patient":
            if not appointment.patient or appointment.patient.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden: You cannot reschedule another patient's appointment.",
                )
        elif user_role == "doctor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctors cannot reschedule patient appointments directly.",
            )

        # Check that new slot is free
        existing_stmt = (
            select(Appointment)
            .where(
                Appointment.doctor_id == appointment.doctor_id,
                Appointment.date == new_date,
                Appointment.time_slot == clean_new_slot,
                Appointment.status == AppointmentStatus.BOOKED,
                Appointment.id != appointment.id,
            )
        )
        existing = (await db.execute(existing_stmt)).scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The requested new time slot is already booked. Please choose another.",
            )

        appointment.date = new_date
        appointment.time_slot = clean_new_slot
        appointment.status = AppointmentStatus.BOOKED
        appointment.is_late_cancellation = False

        try:
            await db.commit()
            await db.refresh(appointment)
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The requested new time slot is already booked. Please choose another.",
            )

        full_appt = await cls.get_full_appointment(db, appointment.id)
        if full_appt:
            await NotificationService.send_reschedule_confirmation(db, full_appt)
        return full_appt

    @classmethod
    async def flag_appointments_for_inactive_doctor(cls, db: AsyncSession, doctor_id: str) -> int:
        today = datetime.date.today()
        stmt = (
            update(Appointment)
            .where(
                Appointment.doctor_id == doctor_id,
                Appointment.date >= today,
                Appointment.status == AppointmentStatus.BOOKED,
            )
            .values(needs_reassignment=True)
        )
        res = await db.execute(stmt)
        await db.commit()
        return res.rowcount

    @classmethod
    async def reassign_appointment(
        cls,
        db: AsyncSession,
        appointment_id: str,
        new_doctor_id: str,
        new_date: datetime.date,
        new_time_slot: str,
    ) -> Appointment:
        clean_slot = clean_display_slot(new_time_slot)
        stmt = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                selectinload(Appointment.patient).selectinload(Patient.user),
                selectinload(Appointment.doctor).selectinload(Doctor.user),
            )
        )
        res = await db.execute(stmt)
        appointment = res.scalars().first()
        if not appointment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

        # Check new doctor is active
        doc_res = await db.execute(select(Doctor).where(Doctor.id == new_doctor_id))
        new_doc = doc_res.scalars().first()
        if not new_doc or new_doc.status != DoctorStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target doctor is not active or does not exist.",
            )

        # Check new slot is not booked
        existing_stmt = (
            select(Appointment)
            .where(
                Appointment.doctor_id == new_doctor_id,
                Appointment.date == new_date,
                Appointment.time_slot == clean_slot,
                Appointment.status == AppointmentStatus.BOOKED,
                Appointment.id != appointment.id,
            )
        )
        existing = (await db.execute(existing_stmt)).scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Selected slot is already taken for the target doctor.",
            )

        appointment.reassigned_from_doctor_id = appointment.doctor_id
        appointment.doctor_id = new_doctor_id
        appointment.date = new_date
        appointment.time_slot = clean_slot
        appointment.needs_reassignment = False
        appointment.status = AppointmentStatus.BOOKED

        try:
            await db.commit()
            await db.refresh(appointment)
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Selected slot is already taken for the target doctor.",
            )

        return await cls.get_full_appointment(db, appointment.id)
