import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.appointment import AppointmentStatus, BookingSource


class AppointmentCreateRequest(BaseModel):
    doctor_id: str
    date: datetime.date
    time_slot: str = Field(..., min_length=5, max_length=60)
    reason: str = Field(..., min_length=2, max_length=255)


class AppointmentRescheduleRequest(BaseModel):
    new_date: datetime.date
    new_time_slot: str = Field(..., min_length=5, max_length=60)


class AppointmentCancelRequest(BaseModel):
    cancellation_reason: str = Field(
        ..., min_length=3, max_length=255, description="Reason for cancellation is required"
    )


class AdminAppointmentCreateRequest(BaseModel):
    patient_id: str
    doctor_id: str
    date: datetime.date
    time_slot: str = Field(..., min_length=5, max_length=60)
    reason: str = Field(..., min_length=2, max_length=255)


class AdminAppointmentReassignRequest(BaseModel):
    new_doctor_id: str
    new_date: datetime.date
    new_time_slot: str = Field(..., min_length=5, max_length=60)


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    doctor_id: str
    patient_name: str
    patient_phone: str
    doctor_name: str
    specialization: str
    date: datetime.date
    time_slot: str
    reason: str
    status: AppointmentStatus
    created_via: BookingSource
    cancellation_reason: Optional[str] = None
    is_late_cancellation: bool = False
    needs_reassignment: bool = False
    reassigned_from_doctor_id: Optional[str] = None
    created_at: datetime.datetime


class DoctorSlotAvailabilityResponse(BaseModel):
    doctor_id: str
    doctor_name: str
    specialization: str
    date: datetime.date
    available_slots: List[str]
    is_working_day: bool
    message: Optional[str] = None
