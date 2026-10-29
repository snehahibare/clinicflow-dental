import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TreatmentRecordCreateRequest(BaseModel):
    diagnosis: str = Field(..., min_length=2, description="Clinical diagnosis or findings")
    procedure: str = Field(..., min_length=2, description="Procedures or treatment performed")
    prescription: str = Field(..., min_length=2, description="Prescribed medications, dosage, and instructions")
    follow_up_date: Optional[datetime.date] = Field(None, description="Optional recommended follow-up date")
    bill_amount: Optional[Decimal] = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Amount to invoice for this treatment (defaults to 0.00)",
    )


class TreatmentRecordUpdateRequest(BaseModel):
    diagnosis: Optional[str] = Field(None, min_length=2)
    procedure: Optional[str] = Field(None, min_length=2)
    prescription: Optional[str] = Field(None, min_length=2)
    follow_up_date: Optional[datetime.date] = None


class TreatmentRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    appointment_id: str
    patient_id: str
    patient_name: str
    doctor_id: str
    doctor_name: str
    specialization: str
    date: datetime.date
    diagnosis: str
    procedure: str
    prescription: str
    follow_up_date: Optional[datetime.date] = None
    bill_id: Optional[str] = None
    bill_amount: Optional[Decimal] = None
    bill_status: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class DoctorFollowUpItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    treatment_record_id: str
    appointment_id: str
    patient_id: str
    patient_name: str
    patient_phone: str
    procedure: str
    follow_up_date: datetime.date
    days_until: int
