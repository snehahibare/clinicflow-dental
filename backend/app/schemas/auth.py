import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.patient import Gender
from app.schemas.user import UserResponse


class PatientRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=20)
    password: str = Field(..., min_length=6, max_length=100)
    dob: Optional[datetime.date] = None
    gender: Optional[Gender] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None


class LoginRequest(BaseModel):
    email_or_phone: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class OTPRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=20)


class OTPVerifyRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=20)
    otp_code: str = Field(..., min_length=4, max_length=8)


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6, max_length=100)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
    data: Optional[dict] = None
