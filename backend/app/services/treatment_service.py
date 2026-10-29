import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Bill, BillStatus
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.treatment import TreatmentRecord
from app.models.user import User, UserRole
from app.schemas.treatment import (
    DoctorFollowUpItem,
    TreatmentRecordCreateRequest,
    TreatmentRecordResponse,
    TreatmentRecordUpdateRequest,
)


class TreatmentService:
    @classmethod
    async def create_treatment_record(
        cls,
        db: AsyncSession,
        appointment_id: str,
        current_user: User,
        payload: TreatmentRecordCreateRequest,
    ) -> TreatmentRecordResponse:
        # Load appointment with relations
        stmt = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                selectinload(Appointment.doctor).selectinload(Doctor.user),
                selectinload(Appointment.patient).selectinload(Patient.user),
                selectinload(Appointment.treatment_record),
                selectinload(Appointment.bill),
            )
        )
        res = await db.execute(stmt)
        appointment = res.scalars().first()

        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found.",
            )

        # 1. Strict Doctor Ownership: Only the doctor who conducted this appointment can add its record
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role != "doctor" or not appointment.doctor or appointment.doctor.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: Only the doctor who conducted this appointment can add clinical records.",
            )

        # 2. Cannot add record to cancelled or no-show appointment
        if appointment.status in (AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add treatment record to an appointment with status '{appointment.status.value}'.",
            )

        # 3. Only one treatment record per appointment
        if appointment.treatment_record:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A treatment record already exists for this appointment.",
            )

        # 4. Create TreatmentRecord
        record = TreatmentRecord(
            appointment_id=appointment.id,
            diagnosis=payload.diagnosis.strip(),
            procedure=payload.procedure.strip(),
            prescription=payload.prescription.strip(),
            follow_up_date=payload.follow_up_date,
        )
        db.add(record)

        # 5. Flip appointment status to completed
        appointment.status = AppointmentStatus.COMPLETED

        # 6. Auto-generate linked Bill if not already present
        bill_amount = payload.bill_amount if payload.bill_amount is not None else Decimal("0.00")
        bill_stmt = select(Bill).where(Bill.appointment_id == appointment.id)
        existing_bill = (await db.execute(bill_stmt)).scalars().first()
        if not existing_bill:
            bill = Bill(
                appointment_id=appointment.id,
                amount=bill_amount,
                status=BillStatus.PENDING,
                payment_date=None,
            )
            db.add(bill)
        else:
            bill = existing_bill
            if payload.bill_amount is not None:
                bill.amount = bill_amount

        await db.commit()
        await db.refresh(record)

        return await cls._serialize_treatment_record(db, record.id)

    @classmethod
    async def update_treatment_record(
        cls,
        db: AsyncSession,
        appointment_id: str,
        current_user: User,
        payload: TreatmentRecordUpdateRequest,
    ) -> TreatmentRecordResponse:
        stmt = (
            select(TreatmentRecord)
            .where(TreatmentRecord.appointment_id == appointment_id)
            .options(
                selectinload(TreatmentRecord.appointment)
                .selectinload(Appointment.doctor)
                .selectinload(Doctor.user)
            )
        )
        res = await db.execute(stmt)
        record = res.scalars().first()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Treatment record not found for this appointment.",
            )

        # Strict Doctor Ownership: Only the conducting doctor can edit
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if (
            user_role != "doctor"
            or not record.appointment.doctor
            or record.appointment.doctor.user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: Only the conducting doctor can edit this treatment record.",
            )

        if payload.diagnosis is not None:
            record.diagnosis = payload.diagnosis.strip()
        if payload.procedure is not None:
            record.procedure = payload.procedure.strip()
        if payload.prescription is not None:
            record.prescription = payload.prescription.strip()
        if payload.follow_up_date is not None:
            record.follow_up_date = payload.follow_up_date

        await db.commit()
        await db.refresh(record)
        return await cls._serialize_treatment_record(db, record.id)

    @classmethod
    async def get_treatment_record_by_appointment(
        cls,
        db: AsyncSession,
        appointment_id: str,
        current_user: User,
    ) -> TreatmentRecordResponse:
        stmt = (
            select(TreatmentRecord)
            .where(TreatmentRecord.appointment_id == appointment_id)
            .options(
                selectinload(TreatmentRecord.appointment)
                .selectinload(Appointment.doctor)
                .selectinload(Doctor.user),
                selectinload(TreatmentRecord.appointment)
                .selectinload(Appointment.patient)
                .selectinload(Patient.user),
                selectinload(TreatmentRecord.appointment).selectinload(Appointment.bill),
            )
        )
        res = await db.execute(stmt)
        record = res.scalars().first()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No treatment record found for this appointment.",
            )

        # Authorization: Conducting doctor, Patient (if own), or Admin (oversight)
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        appt = record.appointment
        if user_role == "patient":
            if not appt.patient or appt.patient.user_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        elif user_role == "doctor":
            if not appt.doctor or appt.doctor.user_id != current_user.id:
                # Other doctors cannot view private consultation notes
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

        return await cls._serialize_treatment_record(db, record.id)

    @classmethod
    async def get_doctor_upcoming_follow_ups(
        cls,
        db: AsyncSession,
        current_user: User,
    ) -> List[DoctorFollowUpItem]:
        # Find doctor record
        doc_res = await db.execute(select(Doctor).where(Doctor.user_id == current_user.id))
        doctor = doc_res.scalars().first()
        if not doctor:
            return []

        today = datetime.date.today()
        stmt = (
            select(TreatmentRecord)
            .join(Appointment, TreatmentRecord.appointment_id == Appointment.id)
            .where(
                Appointment.doctor_id == doctor.id,
                TreatmentRecord.follow_up_date.isnot(None),
                TreatmentRecord.follow_up_date >= today,
            )
            .options(
                selectinload(TreatmentRecord.appointment)
                .selectinload(Appointment.patient)
                .selectinload(Patient.user)
            )
            .order_by(TreatmentRecord.follow_up_date.asc())
        )
        res = await db.execute(stmt)
        records = res.scalars().all()

        items = []
        for r in records:
            pat = r.appointment.patient
            pat_user = pat.user if pat else None
            days_until = (r.follow_up_date - today).days if r.follow_up_date else 0

            items.append(
                DoctorFollowUpItem(
                    treatment_record_id=r.id,
                    appointment_id=r.appointment_id,
                    patient_id=pat.id if pat else "",
                    patient_name=pat_user.name if pat_user else "Patient",
                    patient_phone=pat_user.phone if pat_user else "",
                    procedure=r.procedure,
                    follow_up_date=r.follow_up_date,
                    days_until=days_until,
                )
            )
        return items

    @classmethod
    async def _serialize_treatment_record(
        cls, db: AsyncSession, record_id: str
    ) -> TreatmentRecordResponse:
        stmt = (
            select(TreatmentRecord)
            .where(TreatmentRecord.id == record_id)
            .options(
                selectinload(TreatmentRecord.appointment)
                .selectinload(Appointment.doctor)
                .selectinload(Doctor.user),
                selectinload(TreatmentRecord.appointment)
                .selectinload(Appointment.patient)
                .selectinload(Patient.user),
                selectinload(TreatmentRecord.appointment).selectinload(Appointment.bill),
            )
        )
        res = await db.execute(stmt)
        record = res.scalars().first()
        appt = record.appointment
        doc = appt.doctor
        pat = appt.patient
        bill = appt.bill
        if not bill and appt:
            bill_res = await db.execute(select(Bill).where(Bill.appointment_id == appt.id))
            bill = bill_res.scalars().first()

        return TreatmentRecordResponse(
            id=record.id,
            appointment_id=appt.id,
            patient_id=pat.id if pat else "",
            patient_name=pat.user.name if pat and pat.user else "Unknown Patient",
            doctor_id=doc.id if doc else "",
            doctor_name=doc.user.name if doc and doc.user else "Unknown Doctor",
            specialization=doc.specialization if doc else "General Dentist",
            date=appt.date,
            diagnosis=record.diagnosis,
            procedure=record.procedure,
            prescription=record.prescription,
            follow_up_date=record.follow_up_date,
            bill_id=bill.id if bill else None,
            bill_amount=bill.amount if bill else None,
            bill_status=bill.status.value if bill and hasattr(bill.status, "value") else (str(bill.status) if bill else None),
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
