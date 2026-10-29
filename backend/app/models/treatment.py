import datetime
import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.appointment import Appointment


class TreatmentRecord(Base, TimestampMixin):
    __tablename__ = "treatment_records"

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
    diagnosis: Mapped[str] = mapped_column(Text, nullable=False)
    procedure: Mapped[str] = mapped_column(Text, nullable=False)
    prescription: Mapped[str] = mapped_column(Text, nullable=False)
    follow_up_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)

    # Relationships
    appointment: Mapped["Appointment"] = relationship(
        "Appointment", back_populates="treatment_record"
    )
