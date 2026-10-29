from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    OTPRequest,
    OTPVerifyRequest,
    PatientRegisterRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserProfileUpdate, UserResponse
from app.services.auth_service import AuthService

router = APIRouter()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Patient self-registration",
)
async def register_patient(
    payload: PatientRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    user, access_token, refresh_token = await AuthService.register_patient(db, payload)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Password-based login for all roles (patient, doctor, admin)",
)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user, access_token, refresh_token = await AuthService.authenticate_user(
        db, payload.email_or_phone, payload.password
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/otp/request",
    response_model=MessageResponse,
    summary="Request OTP for patient phone number",
)
async def request_otp(
    payload: OTPRequest,
    db: AsyncSession = Depends(get_db),
):
    code = await AuthService.request_otp_for_phone(db, payload.phone)
    return MessageResponse(
        message="OTP sent successfully.",
        data={"phone": payload.phone, "debug_otp": code},  # Exposed in dev for easy verification
    )


@router.post(
    "/otp/verify",
    response_model=TokenResponse,
    summary="Verify OTP and log in patient",
)
async def verify_otp(
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    user, access_token, refresh_token = await AuthService.authenticate_by_otp(
        db, payload.phone, payload.otp_code
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    summary="Refresh access token using valid refresh token",
)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    access_token, new_refresh_token = await AuthService.refresh_tokens(db, payload.refresh_token)
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Initiate forgot-password flow",
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    token = await AuthService.request_password_reset(db, payload.email)
    return MessageResponse(
        message="If this email is registered, a password reset link has been dispatched.",
        data={"debug_reset_token": token},
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password using valid reset token",
)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    await AuthService.reset_password(db, payload.token, payload.new_password)
    return MessageResponse(message="Password has been successfully updated. You may now log in.")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current logged in user details",
)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Edit current user profile details",
)
async def update_me(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.name is not None:
        current_user.name = payload.name.strip()
    if payload.phone is not None:
        current_user.phone = payload.phone.strip()
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change password for logged-in user",
)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await AuthService.change_password(
        db, current_user, payload.current_password, payload.new_password
    )
    return MessageResponse(message="Password changed successfully.")
