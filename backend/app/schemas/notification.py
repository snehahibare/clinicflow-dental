import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recipient: str
    channel: str
    subject: Optional[str] = None
    message: str
    status: str
    retry_count: int = 0
    failure_reason: Optional[str] = None
    appointment_id: Optional[str] = None
    created_at: datetime.datetime


class ReminderTriggerResponse(BaseModel):
    reminders_sent: int
    message: str
