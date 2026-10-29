import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.doctor import Doctor, DoctorStatus
from app.models.patient import Patient
from app.models.user import User, UserRole


@pytest.mark.asyncio
async def test_patient_can_view_and_edit_own_profile(client: AsyncClient, db_session: AsyncSession):
    # 1. Register a patient
    reg = {
        "name": "Alice Patient",
        "email": "alice@example.com",
        "phone": "+15551113333",
        "password": "Password123!",
        "dob": "1994-03-20",
        "gender": "female",
    }
    res = await client.post("/api/v1/auth/register", json=reg)
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. View profile
    get_res = await client.get("/api/v1/patients/me", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Alice Patient"

    # 3. Update profile with medical history / allergies / emergency contact
    update_payload = {
        "allergies": "Penicillin, Latex, Local Anesthetics",
        "emergency_contact": "+15559990001",
        "address": "456 Oak Avenue, Apt 2B",
        "dob": "1994-03-22",
    }
    put_res = await client.put("/api/v1/patients/me", json=update_payload, headers=headers)
    assert put_res.status_code == 200
    data = put_res.json()
    assert data["allergies"] == "Penicillin, Latex, Local Anesthetics"
    assert data["emergency_contact"] == "+15559990001"
    assert data["address"] == "456 Oak Avenue, Apt 2B"
    assert data["dob"] == "1994-03-22"


@pytest.mark.asyncio
async def test_patient_cannot_edit_another_patient_profile(client: AsyncClient, db_session: AsyncSession):
    # Patient A
    res_a = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Patient Alpha",
            "email": "alpha@example.com",
            "phone": "+15551000001",
            "password": "Password123!",
        },
    )
    token_a = res_a.json()["access_token"]

    # Patient B
    res_b = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Patient Beta",
            "email": "beta@example.com",
            "phone": "+15551000002",
            "password": "Password123!",
        },
    )
    # Get Patient B's patient_id
    token_b = res_b.json()["access_token"]
    me_b = await client.get("/api/v1/patients/me", headers={"Authorization": f"Bearer {token_b}"})
    patient_b_id = me_b.json()["id"]

    # Patient A attempts to edit Patient B's profile directly
    malicious_res = await client.put(
        f"/api/v1/patients/{patient_b_id}",
        json={"allergies": "Hacked allergies"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert malicious_res.status_code == 403
    assert "cannot modify another patient's profile" in malicious_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_doctor_availability_slot_validation_end_before_start(client: AsyncClient, db_session: AsyncSession):
    # Admin login
    admin = User(
        name="Admin Test",
        email="admin.val@dcmsclinic.com",
        phone="+15558889901",
        password_hash=get_password_hash("Admin123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.val@dcmsclinic.com", "password": "Admin123!"},
    )
    admin_token = login.json()["access_token"]

    # Create doctor
    doc_res = await client.post(
        "/api/v1/admin/users/",
        json={
            "name": "Dr. Invalid Time",
            "email": "dr.invalid@dcmsclinic.com",
            "phone": "+15558889902",
            "password": "Doctor123!",
            "role": "doctor",
            "specialization": "Orthodontist",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    doc_user_id = doc_res.json()["id"]

    # Retrieve doctor profile id
    doctors_list = await client.get("/api/v1/doctors/")
    doc_id = next(d["id"] for d in doctors_list.json() if d["user_id"] == doc_user_id)

    # Attempt to update doctor with end time BEFORE start time (14:00 to 10:00)
    bad_payload = {
        "available_slots": {
            "Monday": [{"start": "14:00", "end": "10:00"}]
        }
    }
    update_res = await client.put(
        f"/api/v1/doctors/{doc_id}",
        json=bad_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert update_res.status_code == 422


@pytest.mark.asyncio
async def test_doctor_availability_slot_validation_overlapping_slots(client: AsyncClient, db_session: AsyncSession):
    admin = User(
        name="Admin Overlap",
        email="admin.overlap@dcmsclinic.com",
        phone="+15558889903",
        password_hash=get_password_hash("Admin123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.overlap@dcmsclinic.com", "password": "Admin123!"},
    )
    admin_token = login.json()["access_token"]

    doc_res = await client.post(
        "/api/v1/admin/users/",
        json={
            "name": "Dr. Overlap",
            "email": "dr.overlap@dcmsclinic.com",
            "phone": "+15558889904",
            "password": "Doctor123!",
            "role": "doctor",
            "specialization": "Endodontist",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    doc_user_id = doc_res.json()["id"]
    doctors_list = await client.get("/api/v1/doctors/")
    doc_id = next(d["id"] for d in doctors_list.json() if d["user_id"] == doc_user_id)

    # Attempt overlapping slots: 09:00 - 12:00 and 11:00 - 14:00
    overlap_payload = {
        "available_slots": {
            "Tuesday": [
                {"start": "09:00", "end": "12:00"},
                {"start": "11:00", "end": "14:00"},
            ]
        }
    }
    update_res = await client.put(
        f"/api/v1/doctors/{doc_id}",
        json=overlap_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert update_res.status_code == 422


@pytest.mark.asyncio
async def test_admin_can_update_doctor_profile_and_status(client: AsyncClient, db_session: AsyncSession):
    admin = User(
        name="Admin Updater",
        email="admin.updater@dcmsclinic.com",
        phone="+15558889905",
        password_hash=get_password_hash("Admin123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "admin.updater@dcmsclinic.com", "password": "Admin123!"},
    )
    admin_token = login.json()["access_token"]

    doc_res = await client.post(
        "/api/v1/admin/users/",
        json={
            "name": "Dr. Valid",
            "email": "dr.valid@dcmsclinic.com",
            "phone": "+15558889906",
            "password": "Doctor123!",
            "role": "doctor",
            "specialization": "General Dentist",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    doc_user_id = doc_res.json()["id"]
    doctors_list = await client.get("/api/v1/doctors/")
    doc_id = next(d["id"] for d in doctors_list.json() if d["user_id"] == doc_user_id)

    # Valid non-overlapping slots
    valid_payload = {
        "specialization": "Pediatric Dentist",
        "available_days": ["Monday", "Wednesday", "Friday"],
        "available_slots": {
            "Monday": [
                {"start": "09:00", "end": "12:00"},
                {"start": "13:00", "end": "17:00"},
            ],
            "Wednesday": [
                {"start": "10:00", "end": "15:00"},
            ],
        },
        "status": "active",
    }
    update_res = await client.put(
        f"/api/v1/doctors/{doc_id}",
        json=valid_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert update_res.status_code == 200
    doc_data = update_res.json()
    assert doc_data["specialization"] == "Pediatric Dentist"
    assert "Monday" in doc_data["available_days"]
    assert len(doc_data["available_slots"]["Monday"]) == 2

    # Toggle status to inactive
    toggle_res = await client.patch(
        f"/api/v1/doctors/{doc_id}/status",
        json={"status": "inactive"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert toggle_res.status_code == 200
    assert toggle_res.json()["status"] == "inactive"


@pytest.mark.asyncio
async def test_patient_cannot_update_doctor(client: AsyncClient, db_session: AsyncSession):
    # Register patient
    patient_res = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Patient Charlie",
            "email": "charlie@example.com",
            "phone": "+15559000001",
            "password": "Password123!",
        },
    )
    patient_token = patient_res.json()["access_token"]

    # Attempt to call doctor update endpoint
    attempt = await client.put(
        "/api/v1/doctors/some-random-id",
        json={"specialization": "Oral Surgeon"},
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert attempt.status_code == 403


@pytest.mark.asyncio
async def test_patient_search_case_insensitive_partial_matching(client: AsyncClient, db_session: AsyncSession):
    # 1. Create a Doctor to perform search
    doctor_user = User(
        name="Dr. Searcher",
        email="dr.searcher@dcmsclinic.com",
        phone="+15559000002",
        password_hash=get_password_hash("DoctorPass123!"),
        role=UserRole.DOCTOR,
        is_active=True,
    )
    db_session.add(doctor_user)
    await db_session.commit()

    doc_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "dr.searcher@dcmsclinic.com", "password": "DoctorPass123!"},
    )
    doctor_token = doc_login.json()["access_token"]
    doc_headers = {"Authorization": f"Bearer {doctor_token}"}

    # 2. Register sample patients
    await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Sneha Hibare",
            "email": "sneha.search@example.com",
            "phone": "+15557778888",
            "password": "Password123!",
        },
    )
    await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Robert Smith",
            "email": "robert.smith@example.com",
            "phone": "+15553334444",
            "password": "Password123!",
        },
    )

    # Search 1: Case-insensitive partial name "sNeHa"
    search_name = await client.get("/api/v1/patients/search?q=sNeHa", headers=doc_headers)
    assert search_name.status_code == 200
    results = search_name.json()
    assert len(results) >= 1
    assert any("Sneha" in p["name"] for p in results)

    # Search 2: Partial phone "77788"
    search_phone = await client.get("/api/v1/patients/search?q=77788", headers=doc_headers)
    assert search_phone.status_code == 200
    results_phone = search_phone.json()
    assert len(results_phone) >= 1
    assert any("+15557778888" == p["phone"] for p in results_phone)


@pytest.mark.asyncio
async def test_patient_cannot_access_patient_search(client: AsyncClient, db_session: AsyncSession):
    patient_res = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Curious Patient",
            "email": "curious@example.com",
            "phone": "+15559000003",
            "password": "Password123!",
        },
    )
    patient_token = patient_res.json()["access_token"]

    attempt = await client.get(
        "/api/v1/patients/search?q=test",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert attempt.status_code == 403


@pytest.mark.asyncio
async def test_my_records_and_my_bills_endpoints(client: AsyncClient, db_session: AsyncSession):
    patient_res = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Fresh Patient",
            "email": "fresh@example.com",
            "phone": "+15559000004",
            "password": "Password123!",
        },
    )
    token = patient_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    records_res = await client.get("/api/v1/patients/me/records", headers=headers)
    assert records_res.status_code == 200
    assert isinstance(records_res.json(), list)
    assert len(records_res.json()) == 0

    bills_res = await client.get("/api/v1/patients/me/bills", headers=headers)
    assert bills_res.status_code == 200
    assert isinstance(bills_res.json(), list)
    assert len(bills_res.json()) == 0
