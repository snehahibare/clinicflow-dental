import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from app.models.doctor import DoctorStatus


VALID_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


class TimeSlot(BaseModel):
    start: str = Field(..., pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$", description="Format HH:MM (24-hour)")
    end: str = Field(..., pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$", description="Format HH:MM (24-hour)")

    @model_validator(mode="after")
    def validate_time_order(self) -> "TimeSlot":
        start_t = datetime.datetime.strptime(self.start, "%H:%M").time()
        end_t = datetime.datetime.strptime(self.end, "%H:%M").time()
        if end_t <= start_t:
            raise ValueError(f"Slot end time ({self.end}) must be strictly after start time ({self.start})")
        return self


class DoctorUpdate(BaseModel):
    specialization: Optional[str] = Field(None, min_length=2, max_length=100)
    available_days: Optional[List[str]] = None
    available_slots: Optional[Dict[str, List[TimeSlot]]] = None
    status: Optional[DoctorStatus] = None

    @field_validator("available_days")
    @classmethod
    def validate_days(cls, days: Optional[List[str]]) -> Optional[List[str]]:
        if days is None:
            return None
        for d in days:
            if d not in VALID_DAYS:
                raise ValueError(f"Invalid day: '{d}'. Must be one of {VALID_DAYS}")
        return days

    @field_validator("available_slots")
    @classmethod
    def validate_slots_no_overlap(
        cls, slots_map: Optional[Dict[str, List[TimeSlot]]]
    ) -> Optional[Dict[str, List[TimeSlot]]]:
        if slots_map is None:
            return None

        for day, slots in slots_map.items():
            if day not in VALID_DAYS:
                raise ValueError(f"Invalid day in slots: '{day}'")

            # Sort slots by start time
            sorted_slots = sorted(slots, key=lambda s: s.start)
            for i in range(len(sorted_slots) - 1):
                cur_end = sorted_slots[i].end
                next_start = sorted_slots[i + 1].start
                if cur_end > next_start:
                    raise ValueError(
                        f"Overlapping time slots on {day}: {sorted_slots[i].start}-{sorted_slots[i].end} overlaps with {sorted_slots[i + 1].start}-{sorted_slots[i + 1].end}"
                    )
        return slots_map


class DoctorStatusUpdate(BaseModel):
    status: DoctorStatus


class DoctorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    email: EmailStr
    phone: str
    specialization: str
    available_days: List[str]
    available_slots: Dict[str, List[dict]]
    status: DoctorStatus
    created_at: datetime.datetime


class DoctorScheduleResponse(BaseModel):
    doctor_id: str
    name: str
    specialization: str
    status: DoctorStatus
    available_days: List[str]
    available_slots: Dict[str, List[dict]]
