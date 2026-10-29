import datetime
import enum
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.appointment import Appointment


class BillStatus(str, enum.Enum):
    PAID = "paid"
    PENDING = "pending"
    PARTIAL = "partial"


class Bill(Base, TimestampMixin):
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    appointment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("appointments.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[BillStatus] = mapped_column(
        Enum(BillStatus, values_callable=lambda x: [e.value for e in x]),
        default=BillStatus.PENDING,
        nullable=False,
    )
    payment_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="bill")
