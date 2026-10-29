import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ProposedAction(BaseModel):
    action: str  # "book_appointment", "cancel_appointment", "reschedule_appointment"
    summary: str
    params: Dict[str, Any]


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(..., min_length=1)
    confirmed_action: Optional[bool] = None


class ChatMessageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    tool_calls: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime


class ChatResponse(BaseModel):
    conversation_id: str
    message: str
    proposed_action: Optional[ProposedAction] = None
    is_handed_off: bool = False
    created_at: datetime.datetime


class ChatConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: Optional[str] = None
    is_handed_off: bool = False
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ChatConversationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: Optional[str] = None
    pending_action: Optional[Dict[str, Any]] = None
    is_handed_off: bool = False
    messages: List[ChatMessageSchema]
