import enum
import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.appointment import Appointment


class DoctorStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctors"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    specialization: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    available_days: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    # e.g. {"Monday": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "17:00"}]}
    available_slots: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[DoctorStatus] = mapped_column(
        Enum(DoctorStatus, values_callable=lambda x: [e.value for e in x]),
        default=DoctorStatus.ACTIVE,
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="doctor_profile")
    appointments: Mapped[List["Appointment"]] = relationship(
        "Appointment",
        primaryjoin="Doctor.id == Appointment.doctor_id",
        back_populates="doctor",
        cascade="all, delete-orphan",
    )

