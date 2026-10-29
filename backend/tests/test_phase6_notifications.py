import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.appointment import Appointment, AppointmentStatus, BookingSource
from app.models.doctor import Doctor, DoctorStatus
from app.models.notification import NotificationChannel, NotificationLog, NotificationStatus
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.services.notification_service import NotificationService


async def _setup_users(client: AsyncClient, db: AsyncSession, prefix: str = "p6"):
    # 1. Admin
    admin_user = User(
        name=f"Admin {prefix}",
        email=f"admin.{prefix}@dcmsclinic.com",
        phone=f"+1555{abs(hash(prefix + 'admin')) % 1000000:06d}",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(admin_user)

    # 2. Patient
    pat_user = User(
        name=f"Patient {prefix}",
        email=f"patient.{prefix}@example.com",
        phone=f"+1555{abs(hash(prefix + 'pat')) % 1000000:06d}",
        password_hash=get_password_hash("PatientPass123!"),
        role=UserRole.PATIENT,
        is_active=True,
    )
    db.add(pat_user)

    # 3. Doctor
    doc_user = User(
        name=f"Dr. Specialist {prefix}",
        email=f"doc.{prefix}@dcmsclinic.com",
        phone=f"+1555{abs(hash(prefix + 'doc')) % 1000000:06d}",
        password_hash=get_password_hash("DoctorPass123!"),
        role=UserRole.DOCTOR,
        is_active=True,
    )
    db.add(doc_user)
    await db.commit()

    # Profiles
    pat_profile = Patient(user_id=pat_user.id)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    shifts = {d: [{"start": "08:30", "end": "17:30"}] for d in days}
    doc_profile = Doctor(
        user_id=doc_user.id,
        specialization="Orthodontist",
        available_days=days,
        available_slots=shifts,
        status=DoctorStatus.ACTIVE,
    )
    db.add(pat_profile)
    db.add(doc_profile)
    await db.commit()
    await db.refresh(pat_profile)
    await db.refresh(doc_profile)

    # Logins
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": admin_user.email, "password": "AdminPass123!"},
    )
    pat_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": pat_user.email, "password": "PatientPass123!"},
    )

    admin_token = admin_login.json()["access_token"]
    pat_token = pat_login.json()["access_token"]

    return admin_token, pat_token, pat_profile, doc_profile


def _get_next_weekday(day_name: str = "Monday") -> datetime.date:
    today = datetime.date.today()
    days_ahead = 1
    while (today + datetime.timedelta(days=days_ahead)).strftime("%A") != day_name:
        days_ahead += 1
    return today + datetime.timedelta(days=days_ahead)


@pytest.mark.asyncio
async def test_notification_sent_on_appointment_booking(client: AsyncClient, db_session: AsyncSession):
    """Booking an appointment triggers a booking confirmation notification."""
    admin_token, pat_token, patient, doctor = await _setup_users(client, db_session, prefix="notifbook")
    target_date = _get_next_weekday("Tuesday")

    res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": doctor.id,
            "date": target_date.strftime("%Y-%m-%d"),
            "time_slot": "09:00 - 09:30",
            "reason": "Consultation for braces",
        },
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 201
    appt_id = res.json()["id"]

    # Verify NotificationLog
    stmt = select(NotificationLog).where(NotificationLog.appointment_id == appt_id)
    notif = (await db_session.execute(stmt)).scalars().first()
    assert notif is not None
    assert notif.status == NotificationStatus.SENT
    assert "Confirmation" in notif.subject
    assert notif.retry_count == 0


@pytest.mark.asyncio
async def test_notification_sent_on_reschedule_and_cancellation(client: AsyncClient, db_session: AsyncSession):
    """Rescheduling and cancelling an appointment both trigger appropriate notifications."""
    admin_token, pat_token, patient, doctor = await _setup_users(client, db_session, prefix="reschedcanc")
    target_date = _get_next_weekday("Wednesday")

    # 1. Book initial
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": doctor.id,
            "date": target_date.strftime("%Y-%m-%d"),
            "time_slot": "10:00 - 10:30",
            "reason": "Initial visit",
        },
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    appt_id = book_res.json()["id"]

    # 2. Reschedule
    resched_res = await client.post(
        f"/api/v1/appointments/{appt_id}/reschedule",
        json={"new_date": target_date.strftime("%Y-%m-%d"), "new_time_slot": "11:00 - 11:30"},
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert resched_res.status_code == 200

    stmt_resched = select(NotificationLog).where(
        NotificationLog.appointment_id == appt_id,
        NotificationLog.subject.like("%Rescheduled%"),
    )
    resched_notif = (await db_session.execute(stmt_resched)).scalars().first()
    assert resched_notif is not None
    assert resched_notif.status == NotificationStatus.SENT
    assert "11:00 - 11:30" in resched_notif.message

    # 3. Cancel
    cancel_res = await client.post(
        f"/api/v1/appointments/{appt_id}/cancel",
        json={"cancellation_reason": "Schedule conflict with exams"},
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert cancel_res.status_code == 200

    stmt_cancel = select(NotificationLog).where(
        NotificationLog.appointment_id == appt_id,
        NotificationLog.subject.like("%Cancellation%"),
    )
    cancel_notif = (await db_session.execute(stmt_cancel)).scalars().first()
    assert cancel_notif is not None
    assert cancel_notif.status == NotificationStatus.SENT
    assert "Schedule conflict with exams" in cancel_notif.message


@pytest.mark.asyncio
async def test_notification_delivery_failure_and_retry_handling(client: AsyncClient, db_session: AsyncSession):
    """
    If delivery fails, it retries once.
    If retry also fails, status is flagged as FAILED with failure_reason and visible to admin.
    """
    admin_token, pat_token, patient, doctor = await _setup_users(client, db_session, prefix="failretry")
    target_date = _get_next_weekday("Thursday")

    # Manually trigger simulated failure using NotificationService
    failed_log = await NotificationService._send_with_retry(
        db=db_session,
        recipient="error.recipient@invalid-domain.com",
        channel=NotificationChannel.EMAIL,
        subject="Simulated Failure Test",
        message="This notice should fail and be flagged.",
        force_failure=True,
    )

    assert failed_log.status == NotificationStatus.FAILED
    assert failed_log.retry_count == 2
    assert "Simulated gateway delivery timeout" in failed_log.failure_reason

    # Verify admin endpoint lists this failed notification
    res = await client.get(
        "/api/v1/notifications/failed",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    failed_list = res.json()
    assert any(f["id"] == failed_log.id for f in failed_list)

    # Admin retries the failed notification
    retry_res = await client.post(
        f"/api/v1/notifications/{failed_log.id}/retry",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert retry_res.status_code == 200
    updated_log = retry_res.json()
    assert updated_log["status"] == "sent"
    assert updated_log["failure_reason"] is None


@pytest.mark.asyncio
async def test_24h_appointment_reminder_trigger(client: AsyncClient, db_session: AsyncSession):
    """Admin can trigger 24-hour reminders ahead of scheduled appointments."""
    admin_token, pat_token, patient, doctor = await _setup_users(client, db_session, prefix="remind24")
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)

    # Create an appointment for tomorrow
    appt = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        date=tomorrow,
        time_slot="14:00 - 14:30",
        reason="Follow up review",
        status=AppointmentStatus.BOOKED,
        created_via=BookingSource.APP,
    )
    db_session.add(appt)
    await db_session.commit()

    # Trigger reminder endpoint
    res = await client.post(
        f"/api/v1/notifications/run-reminders?target_date={tomorrow.strftime('%Y-%m-%d')}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["reminders_sent"] >= 1

    # Verify reminder record
    stmt = select(NotificationLog).where(
        NotificationLog.appointment_id == appt.id,
        NotificationLog.subject.like("%Reminder%"),
    )
    reminder_log = (await db_session.execute(stmt)).scalars().first()
    assert reminder_log is not None
    assert reminder_log.status == NotificationStatus.SENT
    assert "Reminder" in reminder_log.message


@pytest.mark.asyncio
async def test_admin_week_schedule_view(client: AsyncClient, db_session: AsyncSession):
    """Admin schedule week view returns appointments in a 7-day window."""
    admin_token, pat_token, patient, doctor = await _setup_users(client, db_session, prefix="weekview")
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())

    # Create appointments on Tuesday and Thursday of this week
    tuesday = monday + datetime.timedelta(days=1)
    thursday = monday + datetime.timedelta(days=3)

    appt1 = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        date=tuesday,
        time_slot="09:00 - 09:30",
        reason="Checkup",
        status=AppointmentStatus.BOOKED,
        created_via=BookingSource.APP,
    )
    appt2 = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        date=thursday,
        time_slot="11:00 - 11:30",
        reason="Consultation",
        status=AppointmentStatus.BOOKED,
        created_via=BookingSource.APP,
    )
    db_session.add_all([appt1, appt2])
    await db_session.commit()

    res = await client.get(
        f"/api/v1/appointments/admin/schedule/week?start_date={monday.strftime('%Y-%m-%d')}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    appts = res.json()
    appt_ids = [a["id"] for a in appts]
    assert appt1.id in appt_ids
    assert appt2.id in appt_ids
