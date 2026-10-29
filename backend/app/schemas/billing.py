import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.billing import BillStatus


class BillUpdateStatusRequest(BaseModel):
    status: BillStatus
    payment_date: Optional[datetime.date] = None


class BillResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    appointment_id: str
    patient_id: str
    patient_name: str
    patient_phone: str
    doctor_name: str
    specialization: str
    date: datetime.date
    procedure: Optional[str] = None
    amount: Decimal
    status: BillStatus
    payment_date: Optional[datetime.date] = None
    created_at: datetime.datetime


class BillingOverviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_outstanding: Decimal
    total_collected_this_month: Decimal
    total_bills_count: int
    bills: List[BillResponse]
