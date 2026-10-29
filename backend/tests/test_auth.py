import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.user import OTPRecord, User, UserRole


@pytest.mark.asyncio
async def test_patient_registration_success(client: AsyncClient, db_session: AsyncSession):
    payload = {
        "name": "Sarah Connor",
        "email": "sarah.connor@example.com",
        "phone": "+15551234567",
        "password": "Password123!",
        "dob": "1990-05-15",
        "gender": "female",
        "address": "123 Sky Way, Los Angeles",
        "emergency_contact": "+15559876543",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "sarah.connor@example.com"
    assert data["user"]["role"] == "patient"
    assert data["user"]["is_active"] is True


@pytest.mark.asyncio
async def test_duplicate_email_signup_fails(client: AsyncClient, db_session: AsyncSession):
    payload = {
        "name": "First User",
        "email": "duplicate@example.com",
        "phone": "+15550000001",
        "password": "Password123!",
    }
    r1 = await client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201

    payload_duplicate_email = {
        "name": "Second User",
        "email": "duplicate@example.com",
        "phone": "+15550000002",
        "password": "Password123!",
    }
    r2 = await client.post("/api/v1/auth/register", json=payload_duplicate_email)
    assert r2.status_code == 409
    assert "email address already exists" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_duplicate_phone_signup_fails(client: AsyncClient, db_session: AsyncSession):
    payload = {
        "name": "First User",
        "email": "first@example.com",
        "phone": "+15559998888",
        "password": "Password123!",
    }
    r1 = await client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201

    payload_duplicate_phone = {
        "name": "Second User",
        "email": "second@example.com",
        "phone": "+15559998888",
        "password": "Password123!",
    }
    r2 = await client.post("/api/v1/auth/register", json=payload_duplicate_phone)
    assert r2.status_code == 409
    assert "phone number already exists" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_password_login_success(client: AsyncClient, db_session: AsyncSession):
    reg = {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": "+15551112222",
        "password": "SecretPassword123!",
    }
    await client.post("/api/v1/auth/register", json=reg)

    # Login by email
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "john.doe@example.com", "password": "SecretPassword123!"},
    )
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "john.doe@example.com"

    # Login by phone
    login_phone = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "+15551112222", "password": "SecretPassword123!"},
    )
    assert login_phone.status_code == 200


@pytest.mark.asyncio
async def test_password_login_wrong_password_fails(client: AsyncClient, db_session: AsyncSession):
    reg = {
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "phone": "+15553334444",
        "password": "CorrectPassword!",
    }
    await client.post("/api/v1/auth/register", json=reg)

    res = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "jane.doe@example.com", "password": "WrongPassword!"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_deactivated_account_fails(client: AsyncClient, db_session: AsyncSession):
    # Create deactivated user directly
    user = User(
        name="Banned User",
        email="banned@example.com",
        phone="+15554440000",
        password_hash=get_password_hash("Password123!"),
        role=UserRole.PATIENT,
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()

    res = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "banned@example.com", "password": "Password123!"},
    )
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_otp_request_and_verification_flow(client: AsyncClient, db_session: AsyncSession):
    # Register patient first
    reg = {
        "name": "OTP Patient",
        "email": "otp.patient@example.com",
        "phone": "+15557778899",
        "password": "Password123!",
    }
    await client.post("/api/v1/auth/register", json=reg)

    # Request OTP
    otp_req = await client.post("/api/v1/auth/otp/request", json={"phone": "+15557778899"})
    assert otp_req.status_code == 200
    otp_data = otp_req.json()
    code = otp_data["data"]["debug_otp"]
    assert len(code) == 6

    # Verify OTP
    verify_res = await client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": "+15557778899", "otp_code": code},
    )
    assert verify_res.status_code == 200
    data = verify_res.json()
    assert "access_token" in data
    assert data["user"]["phone"] == "+15557778899"


@pytest.mark.asyncio
async def test_otp_invalid_code_fails(client: AsyncClient, db_session: AsyncSession):
    reg = {
        "name": "OTP Test User",
        "email": "otp.fail@example.com",
        "phone": "+15557770001",
        "password": "Password123!",
    }
    await client.post("/api/v1/auth/register", json=reg)
    await client.post("/api/v1/auth/otp/request", json={"phone": "+15557770001"})

    verify_res = await client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": "+15557770001", "otp_code": "000000"},
    )
    assert verify_res.status_code == 400
    assert "invalid or expired" in verify_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_otp_expired_fails(client: AsyncClient, db_session: AsyncSession):
    reg = {
        "name": "OTP Expired User",
        "email": "otp.expired@example.com",
        "phone": "+15557770002",
        "password": "Password123!",
    }
    await client.post("/api/v1/auth/register", json=reg)
    req = await client.post("/api/v1/auth/otp/request", json={"phone": "+15557770002"})
    code = req.json()["data"]["debug_otp"]

    # Manually expire the OTP in database
    past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)
    await db_session.execute(
        update(OTPRecord)
        .where(OTPRecord.phone == "+15557770002")
        .values(expires_at=past_time)
    )
    await db_session.commit()

    verify_res = await client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": "+15557770002", "otp_code": code},
    )
    assert verify_res.status_code == 400
    assert "invalid or expired" in verify_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_server_side_rbac_enforcement(client: AsyncClient, db_session: AsyncSession):
    # 1. Create an Admin user
    admin_user = User(
        name="Chief Admin",
        email="chief.admin@dcmsclinic.com",
        phone="+15558880001",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin_user)
    await db_session.commit()

    # Login as admin to get token
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "chief.admin@dcmsclinic.com", "password": "AdminPass123!"},
    )
    admin_token = admin_login.json()["access_token"]

    # 2. Register regular patient
    patient_res = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Regular Patient",
            "email": "regular.patient@example.com",
            "phone": "+15558880002",
            "password": "PatientPass123!",
        },
    )
    patient_token = patient_res.json()["access_token"]

    # Admin creates a Doctor
    doctor_payload = {
        "name": "Dr. House",
        "email": "dr.house@dcmsclinic.com",
        "phone": "+15558880003",
        "password": "DoctorPass123!",
        "role": "doctor",
        "specialization": "Endodontist",
        "available_days": ["Monday", "Wednesday", "Friday"],
    }
    create_doc_res = await client.post(
        "/api/v1/admin/users/",
        json=doctor_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_doc_res.status_code == 201
    assert create_doc_res.json()["role"] == "doctor"

    # Patient attempts to create a Doctor -> MUST BE FORBIDDEN (403)
    patient_attempt = await client.post(
        "/api/v1/admin/users/",
        json={
            "name": "Dr. Fake",
            "email": "dr.fake@dcmsclinic.com",
            "phone": "+15558880004",
            "password": "FakePass123!",
            "role": "doctor",
        },
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert patient_attempt.status_code == 403
    assert "forbidden" in patient_attempt.json()["detail"].lower()


@pytest.mark.asyncio
async def test_forgot_and_reset_password_flow(client: AsyncClient, db_session: AsyncSession):
    reg = {
        "name": "Reset Test User",
        "email": "reset.user@example.com",
        "phone": "+15556667777",
        "password": "OldPassword123!",
    }
    await client.post("/api/v1/auth/register", json=reg)

    # Request reset token
    forgot_res = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.user@example.com"},
    )
    assert forgot_res.status_code == 200
    token = forgot_res.json()["data"]["debug_reset_token"]

    # Reset password
    reset_res = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewBrandPassword456!"},
    )
    assert reset_res.status_code == 200

    # Old password fails
    fail_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "reset.user@example.com", "password": "OldPassword123!"},
    )
    assert fail_login.status_code == 401

    # New password succeeds
    good_login = await client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "reset.user@example.com", "password": "NewBrandPassword456!"},
    )
    assert good_login.status_code == 200


@pytest.mark.asyncio
async def test_profile_view_and_update(client: AsyncClient, db_session: AsyncSession):
    reg = {
        "name": "Profile User",
        "email": "profile.user@example.com",
        "phone": "+15552223344",
        "password": "Password123!",
    }
    reg_res = await client.post("/api/v1/auth/register", json=reg)
    token = reg_res.json()["access_token"]

    # Get /me
    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["name"] == "Profile User"

    # Update /me
    update_res = await client.put(
        "/api/v1/auth/me",
        json={"name": "Updated Profile User", "phone": "+15552229999"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Updated Profile User"
    assert update_res.json()["phone"] == "+15552229999"
