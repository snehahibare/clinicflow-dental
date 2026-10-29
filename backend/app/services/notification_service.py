import datetime
import email.mime.multipart
import email.mime.text
import logging
import smtplib
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.appointment import Appointment, AppointmentStatus
from app.models.doctor import Doctor
from app.models.notification import NotificationChannel, NotificationLog, NotificationStatus
from app.models.patient import Patient
from app.models.user import User

logger = logging.getLogger(__name__)


# =============================================================================
# PROVIDER INTERFACES
# =============================================================================

class BaseEmailProvider:
    def send_email(
        self, to_email: str, subject: str, body_text: str, body_html: Optional[str] = None
    ) -> bool:
        raise NotImplementedError


class SMTPEmailProvider(BaseEmailProvider):
    """
    Gmail & standard SMTP transactional email provider.
    Uses Python's smtplib (smtp.gmail.com:587 with STARTTLS).
    If GMAIL_USER and GMAIL_APP_PASSWORD are provided, connects and authenticates
    with Gmail's SMTP servers to dispatch live emails.
    If credentials are not yet supplied, falls back seamlessly to simulated mode,
    ensuring test suites and local development without credentials execute cleanly.
    """

    def send_email(
        self, to_email: str, subject: str, body_text: str, body_html: Optional[str] = None
    ) -> bool:
        gmail_user = (settings.GMAIL_USER or "").strip()
        gmail_password = (settings.GMAIL_APP_PASSWORD or "").strip()
        smtp_user = gmail_user or (settings.SMTP_USER or "").strip()
        smtp_password = gmail_password or (settings.SMTP_PASSWORD or "").strip()

        # If neither Gmail credentials nor custom SMTP credentials are provided, simulate
        if not smtp_user or not smtp_password:
            logger.info(
                "[EMAIL SIMULATOR] To: %s | Subject: %s | Body: %s",
                to_email,
                subject,
                body_text[:100],
            )
            print(f"[EMAIL SIMULATOR] Dispatched notice to {to_email}: '{subject}'")
            return True

        # Real Gmail / SMTP delivery
        host = "smtp.gmail.com" if gmail_user else (settings.SMTP_HOST or "smtp.gmail.com")
        port = 587 if gmail_user else settings.SMTP_PORT
        from_email = gmail_user if gmail_user else (settings.SMTP_FROM_EMAIL or smtp_user)
        from_name = settings.SMTP_FROM_NAME or "DCMS Dental Care"

        msg = email.mime.multipart.MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        part1 = email.mime.text.MIMEText(body_text, "plain", "utf-8")
        msg.attach(part1)

        if body_html:
            part2 = email.mime.text.MIMEText(body_html, "html", "utf-8")
            msg.attach(part2)

        try:
            with smtplib.SMTP(host, port, timeout=12) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(smtp_user, smtp_password)
                server.sendmail(from_email, [to_email], msg.as_string())
            logger.info("Successfully sent SMTP email to %s", to_email)
            print(f"[GMAIL SMTP SUCCESS] Live email delivered to {to_email}: '{subject}'")
            return True
        except Exception as err:
            logger.error("SMTP delivery to %s failed: %s", to_email, err)
            raise RuntimeError(f"SMTP delivery error: {err}")


class BaseSMSProvider:
    def send_sms(self, to_phone: str, message: str) -> bool:
        raise NotImplementedError


class ModularSMSProvider(BaseSMSProvider):
    """
    Modular SMS provider. Currently logs cleanly and validates recipient format.
    Structured so replacing with Twilio, Sinch, or AWS SNS is a single-method change:
        from twilio.rest import Client
        Client(account_sid, auth_token).messages.create(body=message, from_=from_num, to=to_phone)
    """

    def send_sms(self, to_phone: str, message: str) -> bool:
        if not to_phone or len(to_phone.strip()) < 5:
            raise ValueError(f"Invalid recipient phone number: '{to_phone}'")

        logger.info("[SMS PROVIDER] Delivering to %s: %s", to_phone, message)
        print(f"[SMS PROVIDER] Sent SMS to {to_phone}: {message[:90]}...")
        return True


# Provider Singletons (swappable in one place)
email_provider: BaseEmailProvider = SMTPEmailProvider()
sms_provider: BaseSMSProvider = ModularSMSProvider()


# =============================================================================
# NOTIFICATION SERVICE
# =============================================================================

class NotificationService:
    @classmethod
    async def _send_with_retry(
        cls,
        db: AsyncSession,
        recipient: str,
        channel: NotificationChannel,
        subject: str,
        message: str,
        appointment_id: Optional[str] = None,
        force_failure: bool = False,
    ) -> NotificationLog:
        """
        Executes notification delivery with strict failure handling:
        - If sending fails, retries once immediately.
        - If retry also fails, sets status = 'failed' and records failure_reason.
        - Flagged record is committed to DB and visible to administrators.
        """
        log = NotificationLog(
            recipient=recipient,
            channel=channel,
            subject=subject,
            message=message,
            appointment_id=appointment_id,
            status=NotificationStatus.PENDING,
            retry_count=0,
        )
        db.add(log)
        await db.flush()

        last_error = None
        for attempt in range(2):
            try:
                if force_failure:
                    raise RuntimeError("Simulated gateway delivery timeout")

                if channel == NotificationChannel.EMAIL:
                    email_provider.send_email(to_email=recipient, subject=subject, body_text=message)
                else:
                    sms_provider.send_sms(to_phone=recipient, message=message)

                # Successful delivery
                log.status = NotificationStatus.SENT
                log.retry_count = attempt
                log.failure_reason = None
                await db.commit()
                await db.refresh(log)
                return log
            except Exception as e:
                last_error = str(e)
                log.retry_count = attempt + 1
                logger.warning(
                    "Notification attempt %d failed for %s: %s", attempt + 1, recipient, last_error
                )

        # Delivery failed after retry
        log.status = NotificationStatus.FAILED
        log.failure_reason = last_error or "Delivery failed after retry"
        await db.commit()
        await db.refresh(log)
        logger.error("Notification permanently flagged as FAILED: %s", log.id)
        return log

    @classmethod
    async def send_booking_confirmation(
        cls,
        db: AsyncSession,
        appointment: Appointment,
        force_failure: bool = False,
    ) -> Optional[NotificationLog]:
        """Triggers booking confirmation notice via SMS or Email."""
        pat = appointment.patient
        if not pat or not pat.user:
            return None

        recipient = pat.user.email or pat.user.phone
        channel = NotificationChannel.EMAIL if pat.user.email else NotificationChannel.SMS
        doc_name = (
            appointment.doctor.user.name
            if appointment.doctor and appointment.doctor.user
            else "Doctor"
        )
        spec = (
            appointment.doctor.specialization
            if appointment.doctor
            else "General Dentistry"
        )

        subject = "DCMS — Appointment Booking Confirmation"
        message = (
            f"Dear {pat.user.name},\n\n"
            f"Your dental consultation has been successfully booked at DCMS Dental Care Center.\n\n"
            f"Appointment Details:\n"
            f"• Date: {appointment.date}\n"
            f"• Time Slot: {appointment.time_slot}\n"
            f"• Practitioner: Dr. {doc_name} ({spec})\n"
            f"• Clinic: DCMS Dental Care Center\n"
            f"• Booking Reference: #{appointment.id[:8]}\n\n"
            f"Please arrive 10 minutes prior to your scheduled consultation.\n"
            f"To view, reschedule, or cancel this appointment, please visit your patient dashboard.\n\n"
            f"Warm regards,\n"
            f"DCMS Dental Care Team"
        )

        return await cls._send_with_retry(
            db=db,
            recipient=recipient,
            channel=channel,
            subject=subject,
            message=message,
            appointment_id=appointment.id,
            force_failure=force_failure,
        )

    @classmethod
    async def send_reschedule_confirmation(
        cls,
        db: AsyncSession,
        appointment: Appointment,
        force_failure: bool = False,
    ) -> Optional[NotificationLog]:
        """Triggers reschedule confirmation notice."""
        pat = appointment.patient
        if not pat or not pat.user:
            return None

        recipient = pat.user.email or pat.user.phone
        channel = NotificationChannel.EMAIL if pat.user.email else NotificationChannel.SMS
        doc_name = (
            appointment.doctor.user.name
            if appointment.doctor and appointment.doctor.user
            else "Doctor"
        )
        spec = (
            appointment.doctor.specialization
            if appointment.doctor
            else "General Dentistry"
        )

        subject = "DCMS — Appointment Rescheduled"
        message = (
            f"Dear {pat.user.name},\n\n"
            f"Your dental appointment at DCMS Dental Care Center has been rescheduled.\n\n"
            f"Updated Appointment Details:\n"
            f"• New Date: {appointment.date}\n"
            f"• New Time Slot: {appointment.time_slot}\n"
            f"• Practitioner: Dr. {doc_name} ({spec})\n"
            f"• Clinic: DCMS Dental Care Center\n"
            f"• Booking Reference: #{appointment.id[:8]}\n\n"
            f"Please update your schedule accordingly.\n\n"
            f"Warm regards,\n"
            f"DCMS Dental Care Team"
        )

        return await cls._send_with_retry(
            db=db,
            recipient=recipient,
            channel=channel,
            subject=subject,
            message=message,
            appointment_id=appointment.id,
            force_failure=force_failure,
        )

    @classmethod
    async def send_cancellation_confirmation(
        cls,
        db: AsyncSession,
        appointment: Appointment,
        cancellation_reason: str,
        is_late: bool = False,
        force_failure: bool = False,
    ) -> Optional[NotificationLog]:
        """Triggers cancellation confirmation notice."""
        pat = appointment.patient
        if not pat or not pat.user:
            return None

        recipient = pat.user.email or pat.user.phone
        channel = NotificationChannel.EMAIL if pat.user.email else NotificationChannel.SMS
        doc_name = (
            appointment.doctor.user.name
            if appointment.doctor and appointment.doctor.user
            else "Doctor"
        )
        spec = (
            appointment.doctor.specialization
            if appointment.doctor
            else "General Dentistry"
        )

        subject = "DCMS — Appointment Cancellation"
        late_note = " (Recorded as short-notice cancellation)." if is_late else ""
        message = (
            f"Dear {pat.user.name},\n\n"
            f"Your dental appointment scheduled on {appointment.date} at {appointment.time_slot} "
            f"with Dr. {doc_name} ({spec}) at DCMS Dental Care Center has been cancelled.\n\n"
            f"Cancellation Reason:\n"
            f"• {cancellation_reason}{late_note}\n\n"
            f"Booking Reference: #{appointment.id[:8]}\n\n"
            f"If you wish to schedule a new visit, please visit your patient portal or contact our reception.\n\n"
            f"Warm regards,\n"
            f"DCMS Dental Care Team"
        )

        return await cls._send_with_retry(
            db=db,
            recipient=recipient,
            channel=channel,
            subject=subject,
            message=message,
            appointment_id=appointment.id,
            force_failure=force_failure,
        )

    @classmethod
    async def send_24h_reminders(
        cls,
        db: AsyncSession,
        target_date: Optional[datetime.date] = None,
    ) -> List[NotificationLog]:
        """
        Scheduled check for appointments ~24 hours ahead (default: tomorrow).
        Dispatches reminder notices to all booked patients who have not yet received one.
        """
        if not target_date:
            target_date = datetime.date.today() + datetime.timedelta(days=1)

        stmt = (
            select(Appointment)
            .where(
                Appointment.date == target_date,
                Appointment.status == AppointmentStatus.BOOKED,
            )
            .options(
                selectinload(Appointment.patient).selectinload(Patient.user),
                selectinload(Appointment.doctor).selectinload(Doctor.user),
            )
        )
        res = await db.execute(stmt)
        upcoming_appts = res.scalars().all()

        reminders_sent = []
        for appt in upcoming_appts:
            pat = appt.patient
            if not pat or not pat.user:
                continue

            # Check if reminder already logged for this appointment
            existing_stmt = select(NotificationLog).where(
                NotificationLog.appointment_id == appt.id,
                NotificationLog.subject.like("%Reminder%"),
            )
            already_sent = (await db.execute(existing_stmt)).scalars().first()
            if already_sent:
                continue

            recipient = pat.user.email or pat.user.phone
            channel = NotificationChannel.EMAIL if pat.user.email else NotificationChannel.SMS
            doc_name = (
                appt.doctor.user.name
                if appt.doctor and appt.doctor.user
                else "Doctor"
            )
            spec = (
                appt.doctor.specialization
                if appt.doctor
                else "General Dentistry"
            )

            subject = "DCMS — Appointment Reminder (Tomorrow)"
            message = (
                f"Reminder: Dear {pat.user.name},\n\n"
                f"This is a reminder for your upcoming consultation tomorrow with Dr. {doc_name} ({spec}) "
                f"at DCMS Dental Care Center.\n\n"
                f"Appointment Details:\n"
                f"• Date: {appt.date}\n"
                f"• Time Slot: {appt.time_slot}\n"
                f"• Clinic: DCMS Dental Care Center\n\n"
                f"Please arrive 10 minutes early. We look forward to seeing you!\n\n"
                f"Warm regards,\n"
                f"DCMS Dental Care Team"
            )

            log = await cls._send_with_retry(
                db=db,
                recipient=recipient,
                channel=channel,
                subject=subject,
                message=message,
                appointment_id=appt.id,
            )
            reminders_sent.append(log)

        return reminders_sent

    @classmethod
    async def get_failed_notifications(cls, db: AsyncSession) -> List[NotificationLog]:
        """Returns all notification logs marked as FAILED for admin dashboard review."""
        stmt = (
            select(NotificationLog)
            .where(NotificationLog.status == NotificationStatus.FAILED)
            .order_by(desc(NotificationLog.created_at))
        )
        res = await db.execute(stmt)
        return res.scalars().all()

    @classmethod
    async def retry_failed_notification(
        cls, db: AsyncSession, notification_id: str
    ) -> NotificationLog:
        """Manually retries a failed notification from the admin dashboard."""
        stmt = select(NotificationLog).where(NotificationLog.id == notification_id)
        res = await db.execute(stmt)
        log = res.scalars().first()
        if not log:
            raise ValueError(f"Notification with ID {notification_id} not found")

        try:
            if log.channel == NotificationChannel.EMAIL:
                email_provider.send_email(
                    to_email=log.recipient, subject=log.subject or "DCMS Notification", body_text=log.message
                )
            else:
                sms_provider.send_sms(to_phone=log.recipient, message=log.message)

            log.status = NotificationStatus.SENT
            log.failure_reason = None
            log.retry_count += 1
            await db.commit()
            await db.refresh(log)
            return log
        except Exception as err:
            log.retry_count += 1
            log.failure_reason = f"Manual retry failed: {err}"
            await db.commit()
            await db.refresh(log)
            return log
