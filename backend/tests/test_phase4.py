import datetime
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.appointment import Appointment, AppointmentStatus, BookingSource
from app.models.billing import Bill, BillStatus
from app.models.doctor import Doctor, DoctorStatus
from app.models.patient import Patient
from app.models.treatment import TreatmentRecord
from app.models.user import User, UserRole


async def _setup_doctor_and_patient(db_session: AsyncSession, suffix: str):
    """Helper to set up a doctor, admin, and patient with tokens."""
    # 1. Admin
    admin = User(
        name=f"Admin {suffix}",
        email=f"admin.{suffix}@dcmsclinic.com",
        phone=f"+1555{suffix[:4]}00",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    # 2. Doctor 1
    doc_user_1 = User(
        name=f"Dr. Sarah {suffix}",
        email=f"sarah.{suffix}@dcmsclinic.com",
        phone=f"+1555{suffix[:4]}01",
        password_hash=get_password_hash("DoctorPass123!"),
        role=UserRole.DOCTOR,
        is_active=True,
    )
    # 3. Doctor 2
    doc_user_2 = User(
        name=f"Dr. James {suffix}",
        email=f"james.{suffix}@dcmsclinic.com",
        phone=f"+1555{suffix[:4]}02",
        password_hash=get_password_hash("DoctorPass123!"),
        role=UserRole.DOCTOR,
        is_active=True,
    )
    # 4. Patient 1
    pat_user_1 = User(
        name=f"Patient Alice {suffix}",
        email=f"alice.{suffix}@example.com",
        phone=f"+1555{suffix[:4]}03",
        password_hash=get_password_hash("PatientPass123!"),
        role=UserRole.PATIENT,
        is_active=True,
    )
    # 5. Patient 2
    pat_user_2 = User(
        name=f"Patient Bob {suffix}",
        email=f"bob.{suffix}@example.com",
        phone=f"+1555{suffix[:4]}04",
        password_hash=get_password_hash("PatientPass123!"),
        role=UserRole.PATIENT,
        is_active=True,
    )

    db_session.add_all([admin, doc_user_1, doc_user_2, pat_user_1, pat_user_2])
    await db_session.commit()

    # Create Doctor models with shifts on all days
    all_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    all_slots = {day: [{"start": "09:00", "end": "18:00"}] for day in all_days}

    doctor_1 = Doctor(
        user_id=doc_user_1.id,
        specialization="General Dentist",
        status=DoctorStatus.ACTIVE,
        available_days=all_days,
        available_slots=all_slots,
    )
    doctor_2 = Doctor(
        user_id=doc_user_2.id,
        specialization="Orthodontist",
        status=DoctorStatus.ACTIVE,
        available_days=all_days,
        available_slots=all_slots,
    )
    # Create Patient models
    patient_1 = Patient(user_id=pat_user_1.id)
    patient_2 = Patient(user_id=pat_user_2.id)

    db_session.add_all([doctor_1, doctor_2, patient_1, patient_2])
    await db_session.commit()

    return {
        "admin": admin,
        "doc_user_1": doc_user_1,
        "doctor_1": doctor_1,
        "doc_user_2": doc_user_2,
        "doctor_2": doctor_2,
        "pat_user_1": pat_user_1,
        "patient_1": patient_1,
        "pat_user_2": pat_user_2,
        "patient_2": patient_2,
    }


async def _get_token(client: AsyncClient, email: str, password: str = "DoctorPass123!") -> str:
    res = await client.post("/api/v1/auth/login", json={"email_or_phone": email, "password": password})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_cancelled_slot_keeps_real_time_and_can_be_rebooked(
    client: AsyncClient, db_session: AsyncSession
):
    """Verifies that when an appointment is cancelled, its time_slot is NOT mutated (#cancelled-)

    and another patient can immediately rebook that exact slot thanks to the partial unique index.
    """
    ctx = await _setup_doctor_and_patient(db_session, "rebook1")
    doc = ctx["doctor_1"]
    pat1 = ctx["patient_1"]
    pat2 = ctx["patient_2"]

    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    pat2_token = await _get_token(client, ctx["pat_user_2"].email, "PatientPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    target_slot = "10:00 - 10:30"

    # 1. Patient 1 books the slot
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": doc.id,
            "date": tomorrow.isoformat(),
            "time_slot": target_slot,
            "reason": "Tooth pain consultation",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert book_res.status_code == 201, book_res.text
    appt1_id = book_res.json()["id"]

    # 2. Patient 1 cancels the appointment
    cancel_res = await client.post(
        f"/api/v1/appointments/{appt1_id}/cancel",
        json={"cancellation_reason": "Feeling better now"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert cancel_res.status_code == 200

    # 3. Assert appointment 1 retains the exact clean time_slot (no '#cancelled-' suffix)
    stmt = select(Appointment).where(Appointment.id == appt1_id)
    appt1 = (await db_session.execute(stmt)).scalars().first()
    assert appt1.status == AppointmentStatus.CANCELLED
    assert appt1.time_slot == target_slot, f"Expected {target_slot}, got {appt1.time_slot}"

    # 4. Patient 2 books the EXACT same doctor, date, and slot
    book2_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": doc.id,
            "date": tomorrow.isoformat(),
            "time_slot": target_slot,
            "reason": "Routine cleaning checkup",
        },
        headers={"Authorization": f"Bearer {pat2_token}"},
    )
    assert book2_res.status_code == 201, f"Expected rebooking to succeed: {book2_res.text}"
    appt2_id = book2_res.json()["id"]

    # 5. Verify both records coexist in the database with their true slot value
    stmt2 = select(Appointment).where(Appointment.id == appt2_id)
    appt2 = (await db_session.execute(stmt2)).scalars().first()
    assert appt2.status == AppointmentStatus.BOOKED
    assert appt2.time_slot == target_slot


@pytest.mark.asyncio
async def test_doctor_cannot_add_treatment_record_to_another_doctor_appointment(
    client: AsyncClient, db_session: AsyncSession
):
    """Doctor 2 attempts to add a treatment record to Doctor 1's appointment -> 403 Forbidden."""
    ctx = await _setup_doctor_and_patient(db_session, "docauth")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc2_token = await _get_token(client, ctx["doc_user_2"].email, "DoctorPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "11:00 - 11:30",
            "reason": "Filling required",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    # Doctor 2 tries to add treatment record
    res = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Severe cavity on premolar",
            "procedure": "Composite filling",
            "prescription": "Ibuprofen 400mg PRN",
            "bill_amount": 120.00,
        },
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert res.status_code == 403
    assert "Only the doctor who conducted this appointment" in res.json()["detail"]


@pytest.mark.asyncio
async def test_admin_cannot_add_treatment_record_directly(
    client: AsyncClient, db_session: AsyncSession
):
    """Admin attempts to create treatment record -> 403 Forbidden (doctor clinical responsibility)."""
    ctx = await _setup_doctor_and_patient(db_session, "adminauth")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    admin_token = await _get_token(client, ctx["admin"].email, "AdminPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "11:30 - 12:00",
            "reason": "Checkup",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    res = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Healthy gums",
            "procedure": "Scaling",
            "prescription": "Fluoride rinse",
            "bill_amount": 80.00,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_treatment_record_correctly_flips_appointment_status_to_completed(
    client: AsyncClient, db_session: AsyncSession
):
    """Doctor adds treatment record: flips appointment status to 'completed' and auto-generates bill."""
    ctx = await _setup_doctor_and_patient(db_session, "complete")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "14:00 - 14:30",
            "reason": "Root canal consultation",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    # Doctor 1 adds treatment record
    follow_up = tomorrow + datetime.timedelta(days=14)
    tr_res = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Irreversible pulpitis on tooth #19",
            "procedure": "Pulpectomy and canal preparation",
            "prescription": "Amoxicillin 500mg TID 7 days, Ibuprofen 600mg QID",
            "follow_up_date": follow_up.isoformat(),
            "bill_amount": 350.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    assert tr_res.status_code == 201, tr_res.text
    tr_data = tr_res.json()
    assert tr_data["diagnosis"] == "Irreversible pulpitis on tooth #19"
    assert tr_data["procedure"] == "Pulpectomy and canal preparation"
    assert tr_data["follow_up_date"] == follow_up.isoformat()
    assert float(tr_data["bill_amount"]) == 350.00
    assert tr_data["bill_status"] == "pending"

    # Verify appointment status flipped to 'completed' in DB
    stmt = select(Appointment).where(Appointment.id == appt_id)
    appt = (await db_session.execute(stmt)).scalars().first()
    assert appt.status == AppointmentStatus.COMPLETED

    # Verify bill is created in DB with pending status
    bill_stmt = select(Bill).where(Bill.appointment_id == appt_id)
    bill = (await db_session.execute(bill_stmt)).scalars().first()
    assert bill is not None
    assert bill.status == BillStatus.PENDING
    assert float(bill.amount) == 350.00


@pytest.mark.asyncio
async def test_cannot_add_treatment_record_to_cancelled_appointment(
    client: AsyncClient, db_session: AsyncSession
):
    """Attempting to add treatment record to a cancelled appointment returns 400 Bad Request."""
    ctx = await _setup_doctor_and_patient(db_session, "cancelguard")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "15:00 - 15:30",
            "reason": "Extraction evaluation",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    # Cancel appointment
    await client.post(
        f"/api/v1/appointments/{appt_id}/cancel",
        json={"cancellation_reason": "Emergency travel"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )

    # Doctor tries to add treatment record
    res = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Wisdom tooth impaction",
            "procedure": "Surgical extraction",
            "prescription": "Ketorolac 10mg",
            "bill_amount": 250.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    assert res.status_code == 400
    assert "Cannot add treatment record to an appointment with status 'cancelled'" in res.json()["detail"]


@pytest.mark.asyncio
async def test_second_treatment_record_attempt_on_same_appointment_is_rejected(
    client: AsyncClient, db_session: AsyncSession
):
    """Attempting to create a second treatment record on an already documented appointment returns 409 Conflict."""
    ctx = await _setup_doctor_and_patient(db_session, "duperec")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "16:00 - 16:30",
            "reason": "Teeth whitening",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    # First record
    res1 = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Surface extrinsic enamel stains",
            "procedure": "In-office laser whitening",
            "prescription": "Sensodyne toothpaste",
            "bill_amount": 200.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    assert res1.status_code == 201

    # Second record attempt
    res2 = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Duplicate diagnosis",
            "procedure": "Duplicate procedure",
            "prescription": "None",
            "bill_amount": 200.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_patient_can_view_own_bill_but_cannot_modify(
    client: AsyncClient, db_session: AsyncSession
):
    """Patient can view their own bill, but cannot modify status or amount (403 Forbidden)."""
    ctx = await _setup_doctor_and_patient(db_session, "patbill")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "16:30 - 17:00",
            "reason": "Gingivitis exam",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    # Doctor documents visit with $150 bill
    await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Localized marginal gingivitis",
            "procedure": "Deep ultrasonic prophylaxis",
            "prescription": "Chlorhexidine 0.12% oral rinse",
            "bill_amount": 150.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # Patient views bills
    bills_res = await client.get(
        "/api/v1/patients/me/bills",
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert bills_res.status_code == 200
    bills = bills_res.json()
    assert len(bills) >= 1
    my_bill = next(b for b in bills if b["appointment_id"] == appt_id)
    assert my_bill["amount"] == 150.00
    assert my_bill["status"] == "pending"

    # Patient attempts to mark their bill as paid -> 403 Forbidden
    hack_res = await client.put(
        f"/api/v1/billing/{my_bill['id']}/status",
        json={"status": "paid"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert hack_res.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_update_bill_status_and_it_reflects_in_patient_view(
    client: AsyncClient, db_session: AsyncSession
):
    """Admin updates bill status to 'paid' with payment date; patient's view reflects the update."""
    ctx = await _setup_doctor_and_patient(db_session, "adminbill")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")
    admin_token = await _get_token(client, ctx["admin"].email, "AdminPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "09:30 - 10:00",
            "reason": "Crown consultation",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    # Treatment record created
    tr_res = await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Fractured cusp #14",
            "procedure": "Crown prep and impression",
            "prescription": "Warm salt water rinses",
            "bill_amount": 550.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    bill_id = tr_res.json()["bill_id"]

    # Admin marks bill as paid with today's payment date
    pay_date = datetime.date.today().isoformat()
    update_res = await client.put(
        f"/api/v1/billing/{bill_id}/status",
        json={"status": "paid", "payment_date": pay_date},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "paid"
    assert update_res.json()["payment_date"] == pay_date

    # Patient views bills and sees paid status
    pat_bills = await client.get(
        "/api/v1/patients/me/bills",
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    bill_entry = next(b for b in pat_bills.json() if b["id"] == bill_id)
    assert bill_entry["status"] == "paid"
    assert bill_entry["payment_date"] == pay_date


@pytest.mark.asyncio
async def test_billing_overview_totals_calculate_correctly(
    client: AsyncClient, db_session: AsyncSession
):
    """Admin billing overview computes running totals (total_outstanding, total_collected_this_month)."""
    ctx = await _setup_doctor_and_patient(db_session, "totals")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")
    admin_token = await _get_token(client, ctx["admin"].email, "AdminPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)

    # 1. Create Appointment 1: $100 Pending
    res1 = await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": ctx["doctor_1"].id, "date": tomorrow.isoformat(), "time_slot": "12:00 - 12:30", "reason": "Exam One"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert res1.status_code == 201, res1.text
    appt1 = res1.json()["id"]
    await client.post(
        f"/api/v1/treatments/appointment/{appt1}",
        json={"diagnosis": "Caries check", "procedure": "Direct restoration", "prescription": "None", "bill_amount": 100.00},
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # 2. Create Appointment 2: $250 Paid this month
    res2 = await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": ctx["doctor_1"].id, "date": tomorrow.isoformat(), "time_slot": "12:30 - 13:00", "reason": "Exam Two"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert res2.status_code == 201, res2.text
    appt2 = res2.json()["id"]
    tr2 = await client.post(
        f"/api/v1/treatments/appointment/{appt2}",
        json={"diagnosis": "Gingival inflammation", "procedure": "Scaling and curettage", "prescription": "Mouthwash", "bill_amount": 250.00},
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    bill2_id = tr2.json()["bill_id"]
    await client.put(
        f"/api/v1/billing/{bill2_id}/status",
        json={"status": "paid", "payment_date": datetime.date.today().isoformat()},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # 3. Create Appointment 3: $50 Partial
    res3 = await client.post(
        "/api/v1/appointments/book",
        json={"doctor_id": ctx["doctor_1"].id, "date": tomorrow.isoformat(), "time_slot": "13:00 - 13:30", "reason": "Exam Three"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert res3.status_code == 201, res3.text
    appt3 = res3.json()["id"]
    tr3 = await client.post(
        f"/api/v1/treatments/appointment/{appt3}",
        json={"diagnosis": "Minor sensitivity", "procedure": "Fluoride application", "prescription": "None", "bill_amount": 50.00},
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    bill3_id = tr3.json()["bill_id"]
    await client.put(
        f"/api/v1/billing/{bill3_id}/status",
        json={"status": "partial", "payment_date": datetime.date.today().isoformat()},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Admin requests overview
    overview_res = await client.get(
        "/api/v1/billing/overview",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert overview_res.status_code == 200
    ov = overview_res.json()
    assert float(ov["total_outstanding"]) >= 150.00  # $100 pending + $50 partial
    assert float(ov["total_collected_this_month"]) >= 250.00  # $250 paid


@pytest.mark.asyncio
async def test_doctor_upcoming_follow_ups_query(
    client: AsyncClient, db_session: AsyncSession
):
    """Doctor can query their upcoming follow-up appointments."""
    ctx = await _setup_doctor_and_patient(db_session, "followup")
    pat1_token = await _get_token(client, ctx["pat_user_1"].email, "PatientPass123!")
    doc1_token = await _get_token(client, ctx["doc_user_1"].email, "DoctorPass123!")

    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    book_res = await client.post(
        "/api/v1/appointments/book",
        json={
            "doctor_id": ctx["doctor_1"].id,
            "date": tomorrow.isoformat(),
            "time_slot": "13:30 - 14:00",
            "reason": "Suture check",
        },
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    appt_id = book_res.json()["id"]

    follow_up_date = datetime.date.today() + datetime.timedelta(days=7)
    await client.post(
        f"/api/v1/treatments/appointment/{appt_id}",
        json={
            "diagnosis": "Post-op healing well",
            "procedure": "Suture removal",
            "prescription": "None",
            "follow_up_date": follow_up_date.isoformat(),
            "bill_amount": 40.00,
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # Doctor fetches upcoming follow-ups
    fu_res = await client.get(
        "/api/v1/treatments/doctor/follow-ups",
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    assert fu_res.status_code == 200
    follow_ups = fu_res.json()
    assert len(follow_ups) >= 1
    item = next(f for f in follow_ups if f["appointment_id"] == appt_id)
    assert item["procedure"] == "Suture removal"
    assert item["follow_up_date"] == follow_up_date.isoformat()
    assert item["days_until"] == 7
