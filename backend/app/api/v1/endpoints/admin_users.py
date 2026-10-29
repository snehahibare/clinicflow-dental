from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.dependencies.auth import require_role
from app.models.user import User, UserRole
from app.schemas.user import AdminUserCreateRequest, UserResponse
from app.services.auth_service import AuthService

router = APIRouter()


@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Admin creates doctor or admin staff accounts",
    dependencies=[Depends(require_role("admin"))],
)
async def admin_create_staff_user(
    payload: AdminUserCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await AuthService.admin_create_user(db, payload)
    return UserResponse.model_validate(user)


@router.get(
    "/",
    response_model=List[UserResponse],
    summary="Admin retrieves clinic staff and doctor roster",
    dependencies=[Depends(require_role("admin"))],
)
async def list_staff_users(
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User)
        .where(User.role.in_([UserRole.DOCTOR, UserRole.ADMIN]))
        .order_by(User.created_at.desc())
    )
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]
