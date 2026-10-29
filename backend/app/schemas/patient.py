import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.patient import Gender
from app.models.user import UserRole


class PatientProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    email: EmailStr
    phone: str
    dob: Optional[datetime.date] = None
    gender: Optional[Gender] = None
    address: Optional[str] = None
    allergies: Optional[str] = None
    emergency_contact: Optional[str] = None
    created_at: datetime.datetime


class PatientProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    phone: Optional[str] = Field(None, min_length=7, max_length=20)
    dob: Optional[datetime.date] = None
    gender: Optional[Gender] = None
    address: Optional[str] = None
    allergies: Optional[str] = None
    emergency_contact: Optional[str] = None


class PatientSearchItem(BaseModel):
    id: str
    user_id: str
    name: str
    email: EmailStr
    phone: str
    dob: Optional[datetime.date] = None
    gender: Optional[Gender] = None
    allergies: Optional[str] = None
    emergency_contact: Optional[str] = None


class PatientRecordItem(BaseModel):
    id: str
    appointment_id: str
    date: datetime.date
    doctor_name: str
    specialization: str
    reason: str
    diagnosis: Optional[str] = None
    procedure: Optional[str] = None
    prescription: Optional[str] = None
    follow_up_date: Optional[datetime.date] = None


class PatientBillItem(BaseModel):
    id: str
    appointment_id: str
    date: datetime.date
    doctor_name: str
    amount: float
    status: str
    payment_date: Optional[datetime.date] = None
