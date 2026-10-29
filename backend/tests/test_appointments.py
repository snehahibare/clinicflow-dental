import asyncio
import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.appointment import Appointment, AppointmentStatus, BookingSource
from app.models.doctor import Doctor, DoctorStatus
from app.models.patient import Patient
from app.models.user import User, UserRole


async def _create_test_doctor(client: AsyncClient, admin_token: str, days=None, slots=None) -> str:
    # Helper to register an active doctor via admin
    res = await client.post(
        "/api/v1/admin/users/",
        json={
            "name": "Dr. Appointment Specialist",
            "email": f"dr.appt.{datetime.datetime.now().timestamp()}@dcmsclinic.com",
            "phone": f"+1555{datetime.datetime.now().microsecond:06d}",
            "password": "DoctorPass123!",
            "role": "doctor",
            "specialization": "General Dentist",
            "available_days": days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    user_id = res.json()["id"]
    doc_list = await client.get("/api/v1/doctors/")
    doctor = next(d for d in doc_list.json() if d["user_id"] == user_id)
    return doctor["id"]


async def _get_future_date_for_day(day_name: str) -> datetime.date:
    today = datetime.date.today()
    days_ahead = 1
    while (today + datetime.timedelta(days=days_ahead)).strftime("%A") != day_name:
        days_ahead += 1
    return today + datetime.timedelta(days=days_ahead)


@pytest.mark.asyncio
async def test_concurrent_booking_double_booking_prevention(client: AsyncClient, db_session: AsyncSession):
    # 1. Create Admin & Doctor
    admin = User(
        name="Admin Boss",
        email="admin.concur@dcmsclinic.com",
        phone="+15551010101",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.concur@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]
    doctor_id = await _create_test_doctor(client, admin_token, days=["Monday"])

    # 2. Register two distinct patients
    p1_res = await client.post(
        "/api/v1/auth/register",
        json={"name": "Patient One", "email": "p1.concur@example.com", "phone": "+15552020201", "password": "Pass123!"},
    )
    token1 = p1_res.json()["access_token"]

    p2_res = await client.post(
        "/api/v1/auth/register",
        json={"name": "Patient Two", "email": "p2.concur@example.com", "phone": "+15552020202", "password": "Pass123!"},
    )
    token2 = p2_res.json()["access_token"]

    # Target future Monday at 09:00 - 09:30
    booking_date = await _get_future_date_for_day("Monday")
    slot = "09:00 - 09:30"
    payload = {
        "doctor_id": doctor_id,
        "date": str(booking_date),
        "time_slot": slot,
        "reason": "Routine Dental Checkup",
    }

    # 3. Fire two concurrent requests for the exact same slot
    async def book_attempt(token):
        return await client.post(
            "/api/v1/appointments/book",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    res1, res2 = await asyncio.gather(book_attempt(token1), book_attempt(token2))

    status_codes = [res1.status_code, res2.status_code]
    assert 201 in status_codes, "At least one booking request should succeed"
    assert 409 in status_codes, "The competing concurrent request MUST be rejected with 409 Conflict"

    rejected = res1 if res1.status_code == 409 else res2
    assert "slot is no longer available" in rejected.json()["detail"].lower()


@pytest.mark.asyncio
async def test_booking_already_taken_slot_returns_conflict(client: AsyncClient, db_session: AsyncSession):
    # Setup
    admin = User(
        name="Admin Take",
        email="admin.take@dcmsclinic.com",
        phone="+15551010103",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.take@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]
    doctor_id = await _create_test_doctor(client, admin_token, days=["Tuesday"])

    p_res = await client.post(
        "/api/v1/auth/register",
        json={"name": "Patient Book", "email": "p.book@example.com", "phone": "+15552020203", "password": "Pass123!"},
    )
    token = p_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    target_date = await _get_future_date_for_day("Tuesday")
    booking_payload = {
        "doctor_id": doctor_id,
        "date": str(target_date),
        "time_slot": "10:00 - 10:30",
        "reason": "Teeth Cleaning",
    }

    # First booking succeeds
    r1 = await client.post("/api/v1/appointments/book", json=booking_payload, headers=headers)
    assert r1.status_code == 201

    # Second booking for the exact same slot fails with 409 Conflict
    r2 = await client.post("/api/v1/appointments/book", json=booking_payload, headers=headers)
    assert r2.status_code == 409
    assert "slot is no longer available" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_booking_in_the_past_rejected(client: AsyncClient, db_session: AsyncSession):
    p_res = await client.post(
        "/api/v1/auth/register",
        json={"name": "Time Traveler", "email": "past.p@example.com", "phone": "+15552020204", "password": "Pass123!"},
    )
    token = p_res.json()["access_token"]

    past_date = datetime.date.today() - datetime.timedelta(days=2)
    payload = {
        "doctor_id": "dummy-doctor-id",
        "date": str(past_date),
        "time_slot": "10:00 - 10:30",
        "reason": "Cannot book yesterday",
    }
    res = await client.post(
        "/api/v1/appointments/book",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
    assert "cannot book appointments in the past" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_free_slot_calculation_excludes_booked(client: AsyncClient, db_session: AsyncSession):
    admin = User(
        name="Admin Slot",
        email="admin.slot@dcmsclinic.com",
        phone="+15551010105",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.slot@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]
    doctor_id = await _create_test_doctor(client, admin_token, days=["Wednesday"])

    target_date = await _get_future_date_for_day("Wednesday")

    # 1. Query available slots before booking
    slots_before = await client.get(
        f"/api/v1/appointments/available-slots?doctor_id={doctor_id}&date={target_date}"
    )
    assert slots_before.status_code == 200
    initial_slots = slots_before.json()["available_slots"]
    assert "09:00 - 09:30" in initial_slots

    # 2. Book 09:00 - 09:30
    p_res = await client.post(
        "/api/v1/auth/register",
        json={"name": "Patient Calc", "email": "p.calc@example.com", "phone": "+15552020205", "password": "Pass123!"},
    )
    token = p_res.json()["access_token"]
    await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": doctor_id, "date": str(target_date), "time_slot": "09:00 - 09:30", "reason": "Tooth Pain"},
        headers={"Authorization": f"Bearer {token}"},
    )

    # 3. Query slots after booking: 09:00 - 09:30 MUST NOT be present
    slots_after = await client.get(
        f"/api/v1/appointments/available-slots?doctor_id={doctor_id}&date={target_date}"
    )
    assert slots_after.status_code == 200
    updated_slots = slots_after.json()["available_slots"]
    assert "09:00 - 09:30" not in updated_slots
    assert len(updated_slots) == len(initial_slots) - 1


@pytest.mark.asyncio
async def test_patient_cannot_reschedule_or_cancel_another_patient(client: AsyncClient, db_session: AsyncSession):
    # Setup
    admin = User(
        name="Admin Sec",
        email="admin.sec@dcmsclinic.com",
        phone="+15551010106",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.sec@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]
    doctor_id = await _create_test_doctor(client, admin_token, days=["Thursday"])
    target_date = await _get_future_date_for_day("Thursday")

    # Patient Victim
    p_victim = await client.post(
        "/api/v1/auth/register",
        json={"name": "Victim", "email": "victim@example.com", "phone": "+15552020206", "password": "Pass123!"},
    )
    token_victim = p_victim.json()["access_token"]
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": doctor_id, "date": str(target_date), "time_slot": "11:00 - 11:30", "reason": "Checkup"},
        headers={"Authorization": f"Bearer {token_victim}"},
    )
    appt_id = book_res.json()["id"]

    # Patient Attacker
    p_attacker = await client.post(
        "/api/v1/auth/register",
        json={"name": "Attacker", "email": "attacker@example.com", "phone": "+15552020207", "password": "Pass123!"},
    )
    token_attacker = p_attacker.json()["access_token"]

    # Attacker tries to cancel Victim's appointment -> 403
    cancel_attempt = await client.post(
        f"/api/v1/appointments/{appt_id}/cancel",
        json={"cancellation_reason": "Malicious cancellation"},
        headers={"Authorization": f"Bearer {token_attacker}"},
    )
    assert cancel_attempt.status_code == 403

    # Attacker tries to reschedule Victim's appointment -> 403
    resched_attempt = await client.post(
        f"/api/v1/appointments/{appt_id}/reschedule",
        json={"new_date": str(target_date), "new_time_slot": "11:30 - 12:00"},
        headers={"Authorization": f"Bearer {token_attacker}"},
    )
    assert resched_attempt.status_code == 403


@pytest.mark.asyncio
async def test_doctor_cannot_cancel_patient_appointment_directly(client: AsyncClient, db_session: AsyncSession):
    admin = User(
        name="Admin DocCheck",
        email="admin.doccheck@dcmsclinic.com",
        phone="+15551010108",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.doccheck@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]

    # Create Doctor
    doc_res = await client.post(
        "/api/v1/admin/users/",
        json={
            "name": "Dr. DirectCancel Check",
            "email": "dr.direct@dcmsclinic.com",
            "phone": "+15551010109",
            "password": "DoctorPass123!",
            "role": "doctor",
            "specialization": "Endodontist",
            "available_days": ["Friday"],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    doc_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "dr.direct@dcmsclinic.com", "password": "DoctorPass123!"},
    )
    doctor_token = doc_login.json()["access_token"]
    doctors_list = await client.get("/api/v1/doctors/")
    doctor_id = next(d["id"] for d in doctors_list.json() if d["email"] == "dr.direct@dcmsclinic.com")

    # Patient books
    target_date = await _get_future_date_for_day("Friday")
    p = await client.post(
        "/api/v1/auth/register",
        json={"name": "Patient For Doc", "email": "p.doc@example.com", "phone": "+15552020210", "password": "Pass123!"},
    )
    p_token = p.json()["access_token"]
    book = await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": doctor_id, "date": str(target_date), "time_slot": "14:00 - 14:30", "reason": "Root Canal"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    appt_id = book.json()["id"]

    # Doctor tries to cancel patient's appointment -> MUST BE 403 FORBIDDEN
    doc_cancel = await client.post(
        f"/api/v1/appointments/{appt_id}/cancel",
        json={"cancellation_reason": "I don't feel like seeing this patient"},
        headers={"Authorization": f"Bearer {doctor_token}"},
    )
    assert doc_cancel.status_code == 403
    assert "doctors cannot cancel patient appointments directly" in doc_cancel.json()["detail"].lower()


@pytest.mark.asyncio
async def test_short_notice_cancellation_flags_late_cancellation(client: AsyncClient, db_session: AsyncSession):
    # Register patient
    p = await client.post(
        "/api/v1/auth/register",
        json={"name": "Late Cancel Patient", "email": "late.cancel@example.com", "phone": "+15552020211", "password": "Pass123!"},
    )
    p_token = p.json()["access_token"]

    # Get patient profile
    pat_res = await client.get("/api/v1/patients/me", headers={"Authorization": f"Bearer {p_token}"})
    patient_id = pat_res.json()["id"]

    # Create dummy doctor
    doc_user = User(
        name="Dr. Late Check",
        email="dr.late@dcmsclinic.com",
        phone="+15552020212",
        password_hash=get_password_hash("DoctorPass123!"),
        role=UserRole.DOCTOR,
        is_active=True,
    )
    db_session.add(doc_user)
    await db_session.flush()

    doctor = Doctor(
        user_id=doc_user.id,
        specialization="Periodontist",
        available_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        available_slots={"Monday": [{"start": "08:00", "end": "20:00"}]},
        status=DoctorStatus.ACTIVE,
    )
    db_session.add(doctor)
    await db_session.flush()

    # Manually insert an appointment scheduled 45 minutes from now (which is < 2 hours)
    now = datetime.datetime.now()
    near_future = now + datetime.timedelta(minutes=45)
    near_slot = f"{near_future.strftime('%H:%M')} - {(near_future + datetime.timedelta(minutes=30)).strftime('%H:%M')}"

    appt = Appointment(
        patient_id=patient_id,
        doctor_id=doctor.id,
        date=near_future.date(),
        time_slot=near_slot,
        reason="Sudden toothache",
        status=AppointmentStatus.BOOKED,
        created_via=BookingSource.APP,
    )
    db_session.add(appt)
    await db_session.commit()

    # Cancel the appointment
    cancel_res = await client.post(
        f"/api/v1/appointments/{appt.id}/cancel",
        json={"cancellation_reason": "Family emergency 45 mins before slot"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert cancel_res.status_code == 200
    data = cancel_res.json()
    assert data["status"] == "cancelled"
    assert data["is_late_cancellation"] is True


@pytest.mark.asyncio
async def test_deactivating_doctor_flags_future_appointments_and_reassignment(client: AsyncClient, db_session: AsyncSession):
    # 1. Admin login
    admin = User(
        name="Admin FlagCheck",
        email="admin.flag@dcmsclinic.com",
        phone="+15553030301",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.flag@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    doctor1_id = await _create_test_doctor(client, admin_token, days=["Monday"])
    doctor2_id = await _create_test_doctor(client, admin_token, days=["Monday"])

    # 2. Patient books with Doctor 1 for future Monday
    future_date = await _get_future_date_for_day("Monday")
    p = await client.post(
        "/api/v1/auth/register",
        json={"name": "Patient Reassign", "email": "p.reassign@example.com", "phone": "+15553030302", "password": "Pass123!"},
    )
    p_token = p.json()["access_token"]
    booking = await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": doctor1_id, "date": str(future_date), "time_slot": "10:00 - 10:30", "reason": "Checkup"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    appt_id = booking.json()["id"]

    # 3. Admin deactivates Doctor 1
    deact_res = await client.patch(
        f"/api/v1/doctors/{doctor1_id}/status",
        json={"status": "inactive"},
        headers=admin_headers,
    )
    assert deact_res.status_code == 200

    # 4. Check that appointment is now flagged with needs_reassignment == True
    reassign_list = await client.get("/api/v1/appointments/admin/reassignments-needed", headers=admin_headers)
    assert reassign_list.status_code == 200
    flagged_ids = [a["id"] for a in reassign_list.json()]
    assert appt_id in flagged_ids

    # 5. Admin reassigns appointment to Doctor 2
    reassign_res = await client.put(
        f"/api/v1/appointments/admin/{appt_id}/reassign",
        json={"new_doctor_id": doctor2_id, "new_date": str(future_date), "new_time_slot": "10:00 - 10:30"},
        headers=admin_headers,
    )
    assert reassign_res.status_code == 200
    updated_appt = reassign_res.json()
    assert updated_appt["doctor_id"] == doctor2_id
    assert updated_appt["needs_reassignment"] is False
    assert updated_appt["reassigned_from_doctor_id"] == doctor1_id
