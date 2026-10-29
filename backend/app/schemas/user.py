import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.user import UserRole


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    phone: str
    role: UserRole
    is_active: bool
    created_at: datetime.datetime


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    phone: Optional[str] = Field(None, min_length=7, max_length=20)


class AdminUserCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=20)
    password: str = Field(..., min_length=6, max_length=100)
    role: UserRole = Field(..., description="Must be 'doctor' or 'admin'")
    specialization: Optional[str] = Field(
        None, description="Doctor specialization if role is doctor (e.g. General Dentist, Orthodontist)"
    )
    available_days: Optional[List[str]] = Field(
        default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        description="Weekly working days",
    )
