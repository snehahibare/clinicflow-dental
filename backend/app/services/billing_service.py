import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.appointment import Appointment
from app.models.billing import Bill, BillStatus
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.treatment import TreatmentRecord
from app.models.user import User
from app.schemas.billing import (
    BillingOverviewResponse,
    BillResponse,
    BillUpdateStatusRequest,
)


class BillingService:
    @classmethod
    async def get_billing_overview(
        cls,
        db: AsyncSession,
        status_filter: Optional[str] = None,
    ) -> BillingOverviewResponse:
        # 1. Base query for bills with eager loading
        stmt = (
            select(Bill)
            .join(Appointment, Bill.appointment_id == Appointment.id)
            .options(
                selectinload(Bill.appointment)
                .selectinload(Appointment.doctor)
                .selectinload(Doctor.user),
                selectinload(Bill.appointment)
                .selectinload(Appointment.patient)
                .selectinload(Patient.user),
                selectinload(Bill.appointment).selectinload(Appointment.treatment_record),
            )
            .order_by(desc(Bill.created_at))
        )

        if status_filter and status_filter.lower() != "all":
            stmt = stmt.where(Bill.status == status_filter.lower())

        res = await db.execute(stmt)
        all_matched_bills = res.scalars().all()

        # 2. Compute running totals across ALL clinic bills (unfiltered by status tab)
        # Total Outstanding: sum of PENDING and PARTIAL bills
        outstanding_stmt = (
            select(func.coalesce(func.sum(Bill.amount), Decimal("0.00")))
            .where(Bill.status.in_([BillStatus.PENDING, BillStatus.PARTIAL]))
        )
        total_outstanding = (await db.execute(outstanding_stmt)).scalar_one()

        # Total Collected This Month: sum of PAID bills with payment_date in current month
        today = datetime.date.today()
        first_day_of_month = today.replace(day=1)
        collected_stmt = (
            select(func.coalesce(func.sum(Bill.amount), Decimal("0.00")))
            .where(
                Bill.status == BillStatus.PAID,
                Bill.payment_date >= first_day_of_month,
                Bill.payment_date <= today,
            )
        )
        total_collected = (await db.execute(collected_stmt)).scalar_one()

        # Total bills count
        count_stmt = select(func.count(Bill.id))
        total_bills_count = (await db.execute(count_stmt)).scalar_one()

        # 3. Serialize bills
        bill_responses = [cls._serialize_bill_model(b) for b in all_matched_bills]

        return BillingOverviewResponse(
            total_outstanding=Decimal(str(total_outstanding)),
            total_collected_this_month=Decimal(str(total_collected)),
            total_bills_count=total_bills_count,
            bills=bill_responses,
        )

    @classmethod
    async def update_bill_status(
        cls,
        db: AsyncSession,
        bill_id: str,
        current_user: User,
        payload: BillUpdateStatusRequest,
    ) -> BillResponse:
        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: Only clinic administrators can update billing status.",
            )

        stmt = (
            select(Bill)
            .where(Bill.id == bill_id)
            .options(
                selectinload(Bill.appointment)
                .selectinload(Appointment.doctor)
                .selectinload(Doctor.user),
                selectinload(Bill.appointment)
                .selectinload(Appointment.patient)
                .selectinload(Patient.user),
                selectinload(Bill.appointment).selectinload(Appointment.treatment_record),
            )
        )
        res = await db.execute(stmt)
        bill = res.scalars().first()
        if not bill:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found.")

        bill.status = payload.status

        # If marked paid or partial, set payment date
        if payload.status in (BillStatus.PAID, BillStatus.PARTIAL):
            bill.payment_date = payload.payment_date or datetime.date.today()
        elif payload.status == BillStatus.PENDING:
            bill.payment_date = None

        await db.commit()
        await db.refresh(bill)

        return cls._serialize_bill_model(bill)

    @classmethod
    def _serialize_bill_model(cls, b: Bill) -> BillResponse:
        appt = b.appointment
        pat = appt.patient if appt else None
        pat_user = pat.user if pat else None
        doc = appt.doctor if appt else None
        doc_user = doc.user if doc else None
        tr = appt.treatment_record if appt else None

        return BillResponse(
            id=b.id,
            appointment_id=b.appointment_id,
            patient_id=pat.id if pat else "",
            patient_name=pat_user.name if pat_user else "Patient",
            patient_phone=pat_user.phone if pat_user else "",
            doctor_name=doc_user.name if doc_user else "Doctor",
            specialization=doc.specialization if doc else "General Dentistry",
            date=appt.date if appt else b.created_at.date(),
            procedure=tr.procedure if tr else appt.reason if appt else "Consultation",
            amount=b.amount,
            status=b.status,
            payment_date=b.payment_date,
            created_at=b.created_at,
        )
