import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import require_role
from app.models.notification import NotificationLog
from app.models.user import User, UserRole
from app.schemas.notification import NotificationResponse, ReminderTriggerResponse
from app.services.notification_service import NotificationService

router = APIRouter()


@router.get("/failed", response_model=List[NotificationResponse])
async def list_failed_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """List all notifications flagged with status FAILED for admin review."""
    return await NotificationService.get_failed_notifications(db)


@router.post("/{notification_id}/retry", response_model=NotificationResponse)
async def retry_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Manually retry sending a failed notification."""
    try:
        updated = await NotificationService.retry_failed_notification(db, notification_id)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retry notification: {e}",
        )


@router.post("/run-reminders", response_model=ReminderTriggerResponse)
async def trigger_24h_reminders(
    target_date: Optional[datetime.date] = Query(None, description="Target appointment date for reminder (defaults to tomorrow)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Scheduled trigger to send 24h reminders to booked patients."""
    reminders = await NotificationService.send_24h_reminders(db, target_date=target_date)
    return ReminderTriggerResponse(
        reminders_sent=len(reminders),
        message=f"Dispatched {len(reminders)} appointment reminder(s) successfully.",
    )


@router.get("/all", response_model=List[NotificationResponse])
async def list_all_notifications(
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """List recent notification logs across all channels for audit purposes."""
    stmt = select(NotificationLog).order_by(desc(NotificationLog.created_at)).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()
