import datetime
import secrets
from typing import Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.doctor import Doctor, DoctorStatus
from app.models.patient import Patient
from app.models.user import PasswordResetToken, User, UserRole
from app.schemas.auth import PatientRegisterRequest
from app.schemas.user import AdminUserCreateRequest
from app.services.otp_service import OTPService


class AuthService:
    @classmethod
    async def get_user_by_email_or_phone(
        cls, db: AsyncSession, identifier: str
    ) -> Optional[User]:
        stmt = select(User).where(
            or_(User.email == identifier.strip().lower(), User.phone == identifier.strip())
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    @classmethod
    async def register_patient(
        cls, db: AsyncSession, data: PatientRegisterRequest
    ) -> Tuple[User, str, str]:
        # Edge case: duplicate signup on email or phone
        existing_stmt = select(User).where(
            or_(User.email == data.email.lower(), User.phone == data.phone)
        )
        res = await db.execute(existing_stmt)
        existing = res.scalars().first()
        if existing:
            if existing.email.lower() == data.email.lower():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email address already exists.",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this phone number already exists.",
                )

        hashed_pw = get_password_hash(data.password)
        new_user = User(
            name=data.name.strip(),
            email=data.email.strip().lower(),
            phone=data.phone.strip(),
            password_hash=hashed_pw,
            role=UserRole.PATIENT,
            is_active=True,
        )
        db.add(new_user)
        await db.flush()  # Populates new_user.id

        # Create linked Patient profile
        patient_profile = Patient(
            user_id=new_user.id,
            dob=data.dob,
            gender=data.gender,
            address=data.address,
            emergency_contact=data.emergency_contact,
        )
        db.add(patient_profile)
        await db.commit()
        await db.refresh(new_user)

        access_token = create_access_token(new_user.id, new_user.role.value)
        refresh_token = create_refresh_token(new_user.id, new_user.role.value)
        return new_user, access_token, refresh_token

    @classmethod
    async def authenticate_user(
        cls, db: AsyncSession, email_or_phone: str, password: str
    ) -> Tuple[User, str, str]:
        user = await cls.get_user_by_email_or_phone(db, email_or_phone)
        if not user or not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email/phone or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Edge case: Deactivated account
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is deactivated. Please contact clinic administration.",
            )

        if not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email/phone or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token = create_access_token(user.id, user.role.value)
        refresh_token = create_refresh_token(user.id, user.role.value)
        return user, access_token, refresh_token

    @classmethod
    async def request_otp_for_phone(cls, db: AsyncSession, phone: str) -> str:
        # Check that a patient account exists for this phone
        stmt = select(User).where(User.phone == phone.strip())
        res = await db.execute(stmt)
        user = res.scalars().first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this phone number. Please sign up first.",
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is deactivated. Please contact clinic administration.",
            )

        code = await OTPService.create_otp(db, phone.strip())
        return code

    @classmethod
    async def authenticate_by_otp(
        cls, db: AsyncSession, phone: str, otp_code: str
    ) -> Tuple[User, str, str]:
        stmt = select(User).where(User.phone == phone.strip())
        res = await db.execute(stmt)
        user = res.scalars().first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this phone number.",
            )

        # Edge case: Deactivated account
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is deactivated. Please contact clinic administration.",
            )

        # Edge case: Expired or incorrect OTP
        is_valid = await OTPService.verify_otp(db, phone.strip(), otp_code.strip())
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP code. Please request a new one.",
            )

        access_token = create_access_token(user.id, user.role.value)
        refresh_token = create_refresh_token(user.id, user.role.value)
        return user, access_token, refresh_token

    @classmethod
    async def refresh_tokens(cls, db: AsyncSession, refresh_token: str) -> Tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token type for refresh.",
                )
            user_id = payload.get("sub")
            role = payload.get("role")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token.",
            )

        user = await db.get(User, user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User inactive or no longer exists.",
            )

        new_access = create_access_token(user.id, user.role.value)
        new_refresh = create_refresh_token(user.id, user.role.value)
        return new_access, new_refresh

    @classmethod
    async def request_password_reset(cls, db: AsyncSession, email: str) -> str:
        stmt = select(User).where(User.email == email.strip().lower())
        res = await db.execute(stmt)
        user = res.scalars().first()
        if not user:
            # For security, return friendly message without confirming or denying email existence
            return "reset_token_simulated"

        token = secrets.token_urlsafe(32)
        token_hash = get_password_hash(token)
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = now + datetime.timedelta(minutes=15)

        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False,
        )
        db.add(reset_record)
        await db.commit()
        print(f"[RESET PASSWORD STUB] Token for {email}: {token}")
        return token

    @classmethod
    async def reset_password(cls, db: AsyncSession, token: str, new_password: str) -> None:
        now = datetime.datetime.now(datetime.timezone.utc)
        stmt = select(PasswordResetToken).where(PasswordResetToken.is_used == False)
        res = await db.execute(stmt)
        tokens = res.scalars().all()

        matched_record: Optional[PasswordResetToken] = None
        for rec in tokens:
            rec_exp = rec.expires_at
            if rec_exp.tzinfo is None:
                rec_exp = rec_exp.replace(tzinfo=datetime.timezone.utc)
            if rec_exp >= now and verify_password(token, rec.token_hash):
                matched_record = rec
                break

        if not matched_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired password reset token.",
            )

        user = await db.get(User, matched_record.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        user.password_hash = get_password_hash(new_password)
        matched_record.is_used = True
        await db.commit()

    @classmethod
    async def change_password(
        cls, db: AsyncSession, user: User, current_password: str, new_password: str
    ) -> None:
        if not user.password_hash or not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
        user.password_hash = get_password_hash(new_password)
        await db.commit()

    @classmethod
    async def admin_create_user(
        cls, db: AsyncSession, data: AdminUserCreateRequest
    ) -> User:
        if data.role == UserRole.PATIENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin staff endpoint is for creating doctors or admin accounts only. Patients self-register.",
            )

        # Check duplicate email or phone
        existing_stmt = select(User).where(
            or_(User.email == data.email.lower(), User.phone == data.phone)
        )
        res = await db.execute(existing_stmt)
        existing = res.scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email or phone number already exists.",
            )

        hashed_pw = get_password_hash(data.password)
        new_user = User(
            name=data.name.strip(),
            email=data.email.strip().lower(),
            phone=data.phone.strip(),
            password_hash=hashed_pw,
            role=data.role,
            is_active=True,
        )
        db.add(new_user)
        await db.flush()

        if data.role == UserRole.DOCTOR:
            doctor_profile = Doctor(
                user_id=new_user.id,
                specialization=data.specialization or "General Dentist",
                available_days=data.available_days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                available_slots={
                    day: [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "17:00"}]
                    for day in (data.available_days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
                },
                status=DoctorStatus.ACTIVE,
            )
            db.add(doctor_profile)

        await db.commit()
        await db.refresh(new_user)
        return new_user
