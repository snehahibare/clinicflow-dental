import datetime
import enum
import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Boolean, Date, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.doctor import Doctor
    from app.models.treatment import TreatmentRecord
    from app.models.billing import Bill


class AppointmentStatus(str, enum.Enum):
    BOOKED = "booked"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no-show"


class BookingSource(str, enum.Enum):
    APP = "app"
    CHATBOT = "chatbot"
    ADMIN = "admin"


class Appointment(Base, TimestampMixin):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doctor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False, index=True)
    time_slot: Mapped[str] = mapped_column(String(60), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, values_callable=lambda x: [e.value for e in x]),
        default=AppointmentStatus.BOOKED,
        nullable=False,
    )
    created_via: Mapped[BookingSource] = mapped_column(
        Enum(BookingSource, values_callable=lambda x: [e.value for e in x]),
        default=BookingSource.APP,
        nullable=False,
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Phase 3 Enhancements: Cancellation and Inactivity flags
    is_late_cancellation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    needs_reassignment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reassigned_from_doctor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True
    )

    # Partial unique index: ensures only one 'booked' appointment can exist per doctor, date, and time_slot
    # Cancelled appointments keep their true time_slot intact without colliding
    __table_args__ = (
        Index(
            "uq_doctor_date_slot_booked",
            "doctor_id",
            "date",
            "time_slot",
            unique=True,
            postgresql_where=(status == AppointmentStatus.BOOKED),
            sqlite_where=(status == AppointmentStatus.BOOKED),
        ),
    )

    # Relationships
    patient: Mapped["Patient"] = relationship("Patient", back_populates="appointments")
    doctor: Mapped["Doctor"] = relationship(
        "Doctor", foreign_keys=[doctor_id], back_populates="appointments"
    )
    treatment_record: Mapped[Optional["TreatmentRecord"]] = relationship(
        "TreatmentRecord", back_populates="appointment", uselist=False, cascade="all, delete-orphan"
    )
    bill: Mapped[Optional["Bill"]] = relationship(
        "Bill", back_populates="appointment", uselist=False, cascade="all, delete-orphan"
    )
