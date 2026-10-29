"""replace_unique_constraint_with_partial_index

Revision ID: d78a9912bc34
Revises: c638eb46af67
Create Date: 2026-09-19 23:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd78a9912bc34'
down_revision: Union[str, Sequence[str], None] = 'c638eb46af67'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to partial unique index where status = 'booked'."""
    # Drop table-level unique constraint if exists
    with op.batch_alter_table('appointments', schema=None) as batch_op:
        try:
            batch_op.drop_constraint('uq_doctor_date_slot', type_='unique')
        except Exception:
            pass

    # Create partial unique index for booked appointments
    op.create_index(
        'uq_doctor_date_slot_booked',
        'appointments',
        ['doctor_id', 'date', 'time_slot'],
        unique=True,
        postgresql_where=sa.text("status = 'booked'"),
        sqlite_where=sa.text("status = 'booked'"),
    )


def downgrade() -> None:
    """Revert partial index back to strict unique constraint."""
    op.drop_index('uq_doctor_date_slot_booked', table_name='appointments')
    with op.batch_alter_table('appointments', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_doctor_date_slot', ['doctor_id', 'date', 'time_slot'])
