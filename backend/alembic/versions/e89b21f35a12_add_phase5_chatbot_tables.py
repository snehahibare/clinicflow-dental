"""add_phase5_chatbot_tables

Revision ID: e89b21f35a12
Revises: d78a9912bc34
Create Date: 2026-09-20 00:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e89b21f35a12'
down_revision: Union[str, Sequence[str], None] = 'd78a9912bc34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create chatbot_conversations table
    op.create_table(
        'chatbot_conversations',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('patient_id', sa.String(length=36), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('pending_action', sa.JSON(), nullable=True),
        sa.Column('is_handed_off', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_chatbot_conversations_patient_id', 'chatbot_conversations', ['patient_id'])

    # Create chatbot_messages table
    op.create_table(
        'chatbot_messages',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('conversation_id', sa.String(length=36), sa.ForeignKey('chatbot_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tool_calls', sa.JSON(), nullable=True),
        sa.Column('tool_call_id', sa.String(length=60), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_chatbot_messages_conversation_id', 'chatbot_messages', ['conversation_id'])


def downgrade() -> None:
    op.drop_index('ix_chatbot_messages_conversation_id', table_name='chatbot_messages')
    op.drop_table('chatbot_messages')
    op.drop_index('ix_chatbot_conversations_patient_id', table_name='chatbot_conversations')
    op.drop_table('chatbot_conversations')
