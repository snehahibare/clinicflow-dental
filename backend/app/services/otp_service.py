import datetime
import secrets
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.models.user import OTPRecord


class OTPService:
    @staticmethod
    def generate_code(length: int = 6) -> str:
        # Generates a random 6-digit numeric OTP code
        return "".join([str(secrets.randbelow(10)) for _ in range(length)])

    @classmethod
    async def create_otp(cls, db: AsyncSession, phone: str) -> str:
        # Invalidate existing unused OTPs for this phone
        await db.execute(
            update(OTPRecord)
            .where(OTPRecord.phone == phone, OTPRecord.is_used == False)
            .values(is_used=True)
        )

        code = cls.generate_code()
        code_hash = get_password_hash(code)
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = now + datetime.timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        otp_record = OTPRecord(
            phone=phone,
            otp_code_hash=code_hash,
            expires_at=expires_at,
            is_used=False,
        )
        db.add(otp_record)
        await db.commit()
        await db.refresh(otp_record)

        # In production, send via SMS gateway stub
        print(f"[OTP NOTIFICATION STUB] Generated OTP for phone {phone}: {code} (expires in {settings.OTP_EXPIRE_MINUTES} min)")
        return code

    @classmethod
    async def verify_otp(cls, db: AsyncSession, phone: str, code: str) -> bool:
        stmt = (
            select(OTPRecord)
            .where(OTPRecord.phone == phone, OTPRecord.is_used == False)
            .order_by(desc(OTPRecord.created_at))
            .limit(1)
        )
        result = await db.execute(stmt)
        record = result.scalars().first()

        if not record:
            return False

        now = datetime.datetime.now(datetime.timezone.utc)
        record_expires_at = record.expires_at
        if record_expires_at.tzinfo is None:
            record_expires_at = record_expires_at.replace(tzinfo=datetime.timezone.utc)

        if record_expires_at < now:
            # Mark expired OTP as used/invalid
            record.is_used = True
            await db.commit()
            return False

        if not verify_password(code, record.otp_code_hash):
            return False

        # Mark as successfully used
        record.is_used = True
        await db.commit()
        return True
