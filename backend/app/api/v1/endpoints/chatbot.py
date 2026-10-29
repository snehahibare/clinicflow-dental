import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.chatbot import ChatConversation, ChatMessage
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.schemas.chatbot import (
    ChatConversationDetail,
    ChatConversationListItem,
    ChatMessageSchema,
    ChatRequest,
    ChatResponse,
    ProposedAction,
)
from app.services.chatbot_service import ChatbotService

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_patient_from_user(db: AsyncSession, current_user: User) -> Patient:
    stmt = select(Patient).where(Patient.user_id == current_user.id)
    res = await db.execute(stmt)
    patient = res.scalars().first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found. Please complete profile setup.",
        )
    return patient


@router.post("/message", response_model=ChatResponse)
async def send_chat_message(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.PATIENT)),
):
    """
    POST /api/v1/chatbot/message
    Handles a turn with the AI dental chatbot:
    - Maintains conversation context server-side
    - Enforces scope, diagnosis avoidance, data isolation, and two-step action confirmation
    - Authenticated patient only
    """
    patient = await _get_patient_from_user(db, current_user)
    result = await ChatbotService.process_chat_turn(
        db=db,
        patient=patient,
        user=current_user,
        conversation_id=payload.conversation_id,
        user_message=payload.message,
        confirmed_by_user=payload.confirmed_action,
    )
    return result


@router.get("/conversations", response_model=List[ChatConversationListItem])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.PATIENT)),
):
    """List all previous conversations for the authenticated patient."""
    patient = await _get_patient_from_user(db, current_user)
    stmt = (
        select(ChatConversation)
        .where(ChatConversation.patient_id == patient.id)
        .order_by(desc(ChatConversation.updated_at))
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/conversations/{conversation_id}", response_model=ChatConversationDetail)
async def get_conversation_detail(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.PATIENT)),
):
    """Retrieve full message history for a specific conversation of the authenticated patient."""
    patient = await _get_patient_from_user(db, current_user)
    stmt = (
        select(ChatConversation)
        .where(
            ChatConversation.id == conversation_id,
            ChatConversation.patient_id == patient.id,
        )
        .options(selectinload(ChatConversation.messages))
    )
    res = await db.execute(stmt)
    conv = res.scalars().first()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return conv
