import datetime
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.appointment import Appointment, AppointmentStatus, BookingSource
from app.models.chatbot import ChatConversation, ChatMessage
from app.models.doctor import Doctor, DoctorStatus
from app.models.patient import Patient
from app.models.user import User
from app.schemas.chatbot import ProposedAction
from app.services.appointment_service import AppointmentService

logger = logging.getLogger(__name__)

# Diagnosis phrases prohibited by clinical guardrails
PROHIBITED_DIAGNOSIS_PATTERNS = [
    r"\byou have\b",
    r"\byou are suffering from\b",
    r"\byou're suffering from\b",
    r"\bdiagnosed with\b",
    r"\bthis means you have\b",
    r"\bmy diagnosis is\b",
    r"\bthe diagnosis is\b",
    r"\byou likely have\b",
    r"\byou probably have\b",
]

CLINIC_STATIC_INFO = {
    "timing": (
        "DCMS Clinic Hours: Monday through Friday: 08:30 AM – 07:00 PM. "
        "Saturday: 09:00 AM – 04:00 PM. Sunday: Closed for routine consultations (Emergency on-call only)."
    ),
    "location": (
        "DCMS Dental Care Center is located at 100 Clinical Way, Suite 400, Metro Healthcare District. "
        "Phone: +1 (555) 019-2834. Free patient parking is available on levels P1 and P2."
    ),
    "services": (
        "DCMS provides comprehensive dental services including: General Dentistry (cleanings, cavity fillings, checkups), "
        "Orthodontics (braces, clear aligners), Endodontics (root canal therapy), Pediatric Dentistry (care for children), "
        "Periodontics (gum health, deep scaling), and Oral Surgery (wisdom teeth extractions, surgical consults)."
    ),
}

CLAUDE_TOOLS = [
    {
        "name": "check_doctor_availability",
        "description": "Check available 30-minute consultation slots for a doctor or specialization on a specific date (YYYY-MM-DD).",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctor_id": {"type": "string", "description": "Optional doctor ID"},
                "specialization": {"type": "string", "description": "Optional dental specialization (e.g. General Dentist, Orthodontist, Endodontist)"},
                "date": {"type": "string", "description": "Target date in YYYY-MM-DD format"},
            },
            "required": ["date"],
        },
    },
    {
        "name": "book_appointment",
        "description": "Book a dental consultation for the authenticated patient. Requires doctor ID, date, time slot, and reason.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctor_id": {"type": "string", "description": "ID of the attending doctor"},
                "date": {"type": "string", "description": "Consultation date in YYYY-MM-DD format"},
                "time_slot": {"type": "string", "description": "Selected slot string (e.g. '09:00 - 09:30')"},
                "reason": {"type": "string", "description": "Reason for visit or symptoms"},
            },
            "required": ["doctor_id", "date", "time_slot", "reason"],
        },
    },
    {
        "name": "cancel_appointment",
        "description": "Cancel an existing appointment belonging to the authenticated patient.",
        "input_schema": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "description": "ID of the appointment to cancel"},
                "reason": {"type": "string", "description": "Reason for cancellation"},
            },
            "required": ["appointment_id", "reason"],
        },
    },
    {
        "name": "reschedule_appointment",
        "description": "Reschedule an existing appointment for the authenticated patient to a new date and time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "description": "ID of the appointment to reschedule"},
                "new_date": {"type": "string", "description": "New target date in YYYY-MM-DD format"},
                "new_time_slot": {"type": "string", "description": "New slot string (e.g. '10:00 - 10:30')"},
            },
            "required": ["appointment_id", "new_date", "new_time_slot"],
        },
    },
    {
        "name": "get_clinic_info",
        "description": "Retrieve general clinic information such as operating timings, location, services, or list of doctors.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query_type": {
                    "type": "string",
                    "enum": ["timing", "location", "services", "doctors"],
                    "description": "Category of clinic information requested",
                },
            },
            "required": ["query_type"],
        },
    },
    {
        "name": "suggest_department",
        "description": "Suggest appropriate dental department based on patient's symptoms. This is an administrative triage aid, NOT a clinical diagnosis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symptoms": {"type": "string", "description": "Patient description of oral symptoms or discomfort"},
            },
            "required": ["symptoms"],
        },
    },
]

SYSTEM_PROMPT = """You are the AI Dental Assistant for DCMS (Dental Clinic Management System).
Your purpose is to help registered patients manage their dental appointments, check doctor availability, learn about clinic services, and route symptoms to the correct dental department.

MANDATORY CLINICAL GUARDRAILS:
1. SCOPE CONTROL: You may ONLY assist with dental health inquiries, appointments, doctor availability, clinic timings, and clinic services. If a user asks questions unrelated to dental care or clinic operations (e.g. weather, coding, politics, sports, general knowledge), you must politely decline:
   "I can only assist with dental appointments, clinic services, and practitioner schedules at DCMS."

2. STRICTLY NO DIAGNOSIS: You are not a doctor and must NEVER offer a medical or clinical diagnosis.
   - NEVER state or imply a patient has a specific condition (e.g. never say "you have a cavity", "you are suffering from pulpitis", "this means you have periodontal disease").
   - When a patient describes symptoms, always use the `suggest_department` tool to suggest the appropriate dental department for an in-person clinical examination.
   - Present recommendations using clinical caution: "Based on your symptoms, our [Department] specialists can evaluate you during a clinical consultation."

3. CONFIRMATION BEFORE MUTATING ACTIONS:
   - For booking, cancelling, or rescheduling appointments, you must FIRST summarize all details (doctor, date, time slot, reason) and explicitly ask the user for confirmation BEFORE any data is committed.
   - Never finalize a booking, cancellation, or reschedule without the user's explicit confirmation.

4. AMBIGUOUS REQUESTS:
   - If the patient says "I want an appointment" without specifying a practitioner, date, or symptoms, ask clarifying questions rather than guessing or calling booking tools prematurely.

5. COMMUNICATION STYLE:
   - Warm, clinical, professional, empathetic, and concise. Use sentence case.
"""


class ChatbotService:
    @classmethod
    def check_diagnosis_violations(cls, text: str) -> bool:
        """Returns True if text contains prohibited diagnostic language."""
        lower = text.lower()
        for pattern in PROHIBITED_DIAGNOSIS_PATTERNS:
            if re.search(pattern, lower):
                return True
        return False

    @classmethod
    def sanitize_diagnosis(cls, text: str) -> str:
        """Sanitizes text by replacing diagnostic assertions with clinical evaluation advice."""
        if not cls.check_diagnosis_violations(text):
            return text
        sanitized = text
        for pattern in PROHIBITED_DIAGNOSIS_PATTERNS:
            sanitized = re.sub(
                pattern,
                "you may benefit from an evaluation for",
                sanitized,
                flags=re.IGNORECASE,
            )
        return sanitized

    @classmethod
    async def get_or_create_conversation(
        cls, db: AsyncSession, conversation_id: Optional[str], patient: Patient
    ) -> ChatConversation:
        if conversation_id:
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
            if conv:
                return conv

        new_conv = ChatConversation(
            patient_id=patient.id,
            title="Dental Consultation",
        )
        db.add(new_conv)
        await db.commit()
        await db.refresh(new_conv)
        # reload with messages
        stmt = (
            select(ChatConversation)
            .where(ChatConversation.id == new_conv.id)
            .options(selectinload(ChatConversation.messages))
        )
        res = await db.execute(stmt)
        return res.scalars().first()

    # =========================================================================
    # TOOL EXECUTORS (Bound directly to backend services)
    # =========================================================================

    @classmethod
    async def tool_check_doctor_availability(
        cls, db: AsyncSession, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        date_str = args.get("date")
        doctor_id = args.get("doctor_id")
        specialization = args.get("specialization")

        if not date_str:
            return {"error": "Date is required (YYYY-MM-DD)."}

        try:
            target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return {"error": f"Invalid date format '{date_str}'. Use YYYY-MM-DD."}

        # If doctor_id is specified
        if doctor_id:
            slots, doctor, is_working = await AppointmentService.get_available_slots(
                db, doctor_id, target_date
            )
            return {
                "date": date_str,
                "doctor_id": doctor_id,
                "doctor_name": doctor.user.name if (doctor and doctor.user) else "Doctor",
                "specialization": doctor.specialization if doctor else "",
                "is_working_day": is_working,
                "available_slots": slots,
                "count": len(slots),
            }

        # Otherwise find doctors by specialization or all active doctors
        stmt = select(Doctor).where(Doctor.status == DoctorStatus.ACTIVE).options(selectinload(Doctor.user))
        res = await db.execute(stmt)
        active_docs = res.scalars().all()

        if specialization:
            active_docs = [
                d for d in active_docs
                if d.specialization.lower() == specialization.lower()
            ]

        results = []
        for d in active_docs:
            slots, doc, is_working = await AppointmentService.get_available_slots(db, d.id, target_date)
            results.append({
                "doctor_id": d.id,
                "doctor_name": d.user.name if d.user else "Doctor",
                "specialization": d.specialization,
                "is_working_day": is_working,
                "available_slots": slots,
            })

        return {
            "date": date_str,
            "specialization_filter": specialization,
            "doctors_checked": results,
        }

    @classmethod
    async def tool_suggest_department(cls, args: Dict[str, Any]) -> Dict[str, Any]:
        symptoms = args.get("symptoms", "").lower()

        # Rule-based triage mapping
        if any(w in symptoms for w in ["root canal", "nerve", "severe throbbing", "deep pulp", "cracked tooth"]):
            dept = "Endodontics"
            specialist = "Endodontist"
            rationale = "Specializes in diagnosing and treating tooth pulp and root canal therapy."
        elif any(w in symptoms for w in ["brace", "align", "crooked", "gap", "bite", "overbite"]):
            dept = "Orthodontics"
            specialist = "Orthodontist"
            rationale = "Specializes in teeth alignment, braces, clear aligners, and jaw positioning."
        elif any(w in symptoms for w in ["wisdom", "extraction", "jaw fracture", "oral surgery", "impacted"]):
            dept = "Oral Surgery"
            specialist = "Oral Surgeon"
            rationale = "Specializes in complex tooth extractions, wisdom teeth, and surgical jaw procedures."
        elif any(w in symptoms for w in ["gum", "bleeding", "gingiv", "periodon", "loose tooth", "bad breath"]):
            dept = "Periodontics"
            specialist = "Periodontist"
            rationale = "Specializes in gum health, periodontal disease, and supporting tooth structures."
        elif any(w in symptoms for w in ["child", "kid", "baby", "infant", "toddler"]):
            dept = "Pediatric Dentistry"
            specialist = "Pediatric Dentist"
            rationale = "Specializes in oral care for infants, children, and teenagers."
        else:
            dept = "General Dentistry"
            specialist = "General Dentist"
            rationale = "Recommended for primary oral exams, routine checkups, toothaches, cavity restorations, and diagnostic referrals."

        return {
            "suggested_department": dept,
            "specialist": specialist,
            "triage_rationale": rationale,
            "disclaimer": "This suggestion is an administrative triage guide, not a medical or dental diagnosis. An in-person clinical exam is required.",
        }

    @classmethod
    async def tool_get_clinic_info(cls, db: AsyncSession, args: Dict[str, Any]) -> Dict[str, Any]:
        q_type = args.get("query_type", "timing").lower()
        if q_type in CLINIC_STATIC_INFO:
            return {"query_type": q_type, "info": CLINIC_STATIC_INFO[q_type]}

        if q_type == "doctors":
            stmt = select(Doctor).where(Doctor.status == DoctorStatus.ACTIVE).options(selectinload(Doctor.user))
            res = await db.execute(stmt)
            docs = res.scalars().all()
            doctor_list = [
                {
                    "id": d.id,
                    "name": d.user.name if d.user else "Doctor",
                    "specialization": d.specialization,
                    "available_days": d.available_days,
                }
                for d in docs
            ]
            return {"query_type": "doctors", "active_doctors": doctor_list}

        return {"query_type": q_type, "info": CLINIC_STATIC_INFO["services"]}

    @classmethod
    async def tool_book_appointment(
        cls, db: AsyncSession, patient: Patient, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Server guardrail: Uses authenticated patient.id only.
        created_via is strictly BookingSource.CHATBOT.
        """
        doctor_id = args.get("doctor_id")
        date_str = args.get("date")
        time_slot = args.get("time_slot")
        reason = args.get("reason", "Consultation via AI Assistant")

        try:
            target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        except Exception:
            return {"error": f"Invalid date '{date_str}'. Expected format YYYY-MM-DD."}

        try:
            appt = await AppointmentService.book_appointment(
                db=db,
                patient_id=patient.id,  # GUARANTEED: Authenticated patient only!
                doctor_id=doctor_id,
                appointment_date=target_date,
                time_slot=time_slot,
                reason=reason,
                created_via=BookingSource.CHATBOT,  # Required by specification
            )
            doc_name = appt.doctor.user.name if (appt.doctor and appt.doctor.user) else "Doctor"
            spec = appt.doctor.specialization if appt.doctor else "General Dentistry"
            return {
                "status": "success",
                "message": "Appointment booked successfully.",
                "appointment": {
                    "id": appt.id,
                    "doctor_name": doc_name,
                    "specialization": spec,
                    "date": str(appt.date),
                    "time_slot": appt.time_slot,
                    "reason": appt.reason,
                    "created_via": appt.created_via.value if hasattr(appt.created_via, "value") else str(appt.created_via),
                },
            }
        except HTTPException as e:
            return {"status": "error", "error": e.detail}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @classmethod
    async def tool_cancel_appointment(
        cls, db: AsyncSession, patient: Patient, user: User, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Server guardrail: Verifies appointment belongs to authenticated patient.
        """
        appointment_id = args.get("appointment_id")
        reason = args.get("reason", "Cancelled via AI Assistant")

        # Security check: appointment must belong to patient
        stmt = select(Appointment).where(Appointment.id == appointment_id)
        res = await db.execute(stmt)
        appt = res.scalars().first()
        if not appt or appt.patient_id != patient.id:
            return {
                "status": "error",
                "error": "Appointment not found or you do not have permission to cancel it.",
            }

        try:
            cancelled = await AppointmentService.cancel_appointment(
                db=db,
                appointment_id=appointment_id,
                user=user,
                reason=reason,
            )
            return {
                "status": "success",
                "message": "Appointment cancelled successfully.",
                "appointment_id": cancelled.id,
                "is_late_cancellation": cancelled.is_late_cancellation,
            }
        except HTTPException as e:
            return {"status": "error", "error": e.detail}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @classmethod
    async def tool_reschedule_appointment(
        cls, db: AsyncSession, patient: Patient, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Server guardrail: Verifies appointment belongs to authenticated patient.
        """
        appointment_id = args.get("appointment_id")
        new_date_str = args.get("new_date")
        new_time_slot = args.get("new_time_slot")

        try:
            new_date = datetime.datetime.strptime(new_date_str, "%Y-%m-%d").date()
        except Exception:
            return {"error": f"Invalid date '{new_date_str}'. Expected format YYYY-MM-DD."}

        stmt = select(Appointment).where(Appointment.id == appointment_id)
        res = await db.execute(stmt)
        appt = res.scalars().first()
        if not appt or appt.patient_id != patient.id:
            return {
                "status": "error",
                "error": "Appointment not found or you do not have permission to reschedule it.",
            }

        try:
            rescheduled = await AppointmentService.reschedule_appointment(
                db=db,
                appointment_id=appointment_id,
                patient_id=patient.id,  # Authenticated patient only
                new_date=new_date,
                new_time_slot=new_time_slot,
            )
            return {
                "status": "success",
                "message": "Appointment rescheduled successfully.",
                "appointment": {
                    "id": rescheduled.id,
                    "date": str(rescheduled.date),
                    "time_slot": rescheduled.time_slot,
                },
            }
        except HTTPException as e:
            return {"status": "error", "error": e.detail}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # =========================================================================
    # DETERMINISTIC / OFFLINE MOCK ENGINE
    # =========================================================================

    @classmethod
    async def run_mock_engine(
        cls,
        db: AsyncSession,
        patient: Patient,
        user: User,
        user_message: str,
        conversation: ChatConversation,
        confirmed_by_user: bool,
    ) -> Tuple[str, Optional[ProposedAction], bool]:
        """
        Deterministic mock engine used when ANTHROPIC_API_KEY is not set or during tests.
        Accurately simulates Claude tool calls, guardrails, and confirmation flow.
        """
        lower = user_message.lower().strip()

        # Check for user confirmation of an existing pending action
        if conversation.pending_action:
            pending = conversation.pending_action
            is_confirm = confirmed_by_user or any(
                w in lower for w in ["yes", "confirm", "proceed", "sure", "ok", "go ahead", "book it", "please do"]
            )
            is_cancel = any(w in lower for w in ["no", "cancel", "nevermind", "stop", "dont", "don't"])

            if is_confirm:
                action = pending.get("action")
                params = pending.get("params", {})
                conversation.pending_action = None

                if action == "book_appointment":
                    result = await cls.tool_book_appointment(db, patient, params)
                    if result.get("status") == "success":
                        appt = result["appointment"]
                        return (
                            f"Your appointment with {appt['doctor_name']} ({appt['specialization']}) on "
                            f"{appt['date']} at {appt['time_slot']} has been confirmed and booked! "
                            f"Booking reference: #{appt['id'][:8]}.",
                            None,
                            False,
                        )
                    else:
                        return (
                            f"I was unable to book the appointment: {result.get('error', 'Unknown error')}.",
                            None,
                            False,
                        )

                elif action == "cancel_appointment":
                    result = await cls.tool_cancel_appointment(db, patient, user, params)
                    if result.get("status") == "success":
                        late_note = " (Note: Marked as short-notice cancellation)." if result.get("is_late_cancellation") else ""
                        return f"Your appointment #{params.get('appointment_id', '')[:8]} has been cancelled.{late_note}", None, False
                    else:
                        return f"Could not cancel appointment: {result.get('error')}", None, False

                elif action == "reschedule_appointment":
                    result = await cls.tool_reschedule_appointment(db, patient, params)
                    if result.get("status") == "success":
                        appt = result["appointment"]
                        return (
                            f"Your appointment has been rescheduled to {appt['date']} at {appt['time_slot']}.",
                            None,
                            False,
                        )
                    else:
                        return f"Could not reschedule appointment: {result.get('error')}", None, False

            elif is_cancel:
                conversation.pending_action = None
                return "Understood. The proposed action has been cancelled.", None, False

        # Guardrail: Scope Control
        off_topic_words = [
            "weather", "forecast", "rain", "recipe", "python", "javascript",
            "code", "stock", "cricket", "football", "president", "politics", "celsius"
        ]
        if any(w in lower for w in off_topic_words):
            return (
                "I can only assist with dental appointments, clinic services, and practitioner schedules at DCMS. "
                "This inquiry is outside what I can help with — please call the clinic directly.",
                None,
                True,
            )

        # Ambiguous booking request without details -> Clarifying question
        ambiguous_triggers = [
            "i want an appointment", "book appointment", "appointment please",
            "need a booking", "i need an appointment", "book an appointment",
            "i'd like an appointment", "can i book an appointment"
        ]
        if lower.strip(" .!?") in ambiguous_triggers:
            return (
                "I would be glad to help you schedule an appointment. Which department or specialist do you need to visit, and what is your preferred date?",
                None,
                False,
            )

        # Cancellation intent
        if "cancel" in lower:
            uuid_match = re.search(r"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", user_message, re.IGNORECASE)
            appt_id = uuid_match.group(1) if uuid_match else None
            reason = "Cancellation requested via AI assistant"
            r_match = re.search(r"reason\s*['\"]?([^'\"]+)['\"]?", user_message, re.IGNORECASE)
            if r_match:
                reason = r_match.group(1).strip()

            if not appt_id:
                return (
                    "Please provide the appointment ID that you would like to cancel.",
                    None,
                    False,
                )

            params = {"appointment_id": appt_id, "reason": reason}
            if confirmed_by_user or "immediately" in lower:
                result = await cls.tool_cancel_appointment(db, patient, user, params)
                if result.get("status") == "success":
                    late_note = " (Note: Marked as short-notice cancellation)." if result.get("is_late_cancellation") else ""
                    return f"Your appointment #{appt_id[:8]} has been cancelled successfully.{late_note}", None, False
                else:
                    return f"Could not cancel appointment: {result.get('error')}", None, False
            else:
                conversation.pending_action = {"action": "cancel_appointment", "params": params}
                proposed = ProposedAction(
                    action="cancel_appointment",
                    summary=f"Cancel appointment #{appt_id[:8]}",
                    params=params,
                )
                return (
                    f"Are you sure you want to cancel appointment #{appt_id[:8]}? Please confirm if you would like me to proceed.",
                    proposed,
                    False,
                )

        # Rescheduling intent
        if "reschedule" in lower:
            uuid_match = re.search(r"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", user_message, re.IGNORECASE)
            appt_id = uuid_match.group(1) if uuid_match else None
            date_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", user_message)
            target_date_str = date_match.group(1) if date_match else None
            slot_match = re.search(r"(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})", user_message)
            slot_str = slot_match.group(1) if slot_match else None

            if not appt_id or not target_date_str or not slot_str:
                return (
                    "To reschedule your appointment, please provide the appointment ID, new date (YYYY-MM-DD), and preferred time slot.",
                    None,
                    False,
                )
            params = {"appointment_id": appt_id, "new_date": target_date_str, "new_time_slot": slot_str}
            if confirmed_by_user:
                result = await cls.tool_reschedule_appointment(db, patient, params)
                if result.get("status") == "success":
                    return f"Your appointment #{appt_id[:8]} has been rescheduled to {target_date_str} at {slot_str}.", None, False
                else:
                    return f"Could not reschedule appointment: {result.get('error')}", None, False
            else:
                conversation.pending_action = {"action": "reschedule_appointment", "params": params}
                proposed = ProposedAction(
                    action="reschedule_appointment",
                    summary=f"Reschedule appointment #{appt_id[:8]} to {target_date_str} at {slot_str}",
                    params=params,
                )
                return (
                    f"Please confirm: Reschedule appointment #{appt_id[:8]} to {target_date_str} at {slot_str}?",
                    proposed,
                    False,
                )

        # Booking intent -> Proposal step (Server-Enforced Two-Step Confirmation)
        if "book" in lower or "schedule" in lower:
            today = datetime.date.today()
            target_date_str = str(today + datetime.timedelta(days=1))
            date_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", user_message)
            if date_match:
                target_date_str = date_match.group(1)

            # Find active doctors
            stmt = select(Doctor).where(Doctor.status == DoctorStatus.ACTIVE).options(selectinload(Doctor.user))
            res = await db.execute(stmt)
            active_docs = res.scalars().all()

            if not active_docs:
                return "There are currently no active doctors available for booking.", None, False

            # Match requested doctor by name or specialization
            matched_doc = None
            for d in active_docs:
                if d.user and d.user.name.lower() in lower:
                    matched_doc = d
                    break
            if not matched_doc:
                for d in active_docs:
                    if d.specialization.lower() in lower:
                        matched_doc = d
                        break
            if not matched_doc:
                matched_doc = active_docs[0]

            doc_name = matched_doc.user.name if matched_doc.user else "Doctor"

            try:
                t_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
            except ValueError:
                return f"Invalid date format '{target_date_str}'. Please use YYYY-MM-DD.", None, False

            avail_slots, _, is_working = await AppointmentService.get_available_slots(
                db, matched_doc.id, t_date
            )

            # Match slot
            slot_match = re.search(r"(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})", user_message)
            selected_slot = slot_match.group(1) if slot_match else None

            if selected_slot:
                if selected_slot not in avail_slots:
                    return (
                        f"The requested slot ({selected_slot}) with Dr. {doc_name} is unavailable or already booked on {target_date_str}. "
                        f"Please choose another time slot.",
                        None,
                        False,
                    )
                slot = selected_slot
            else:
                if not avail_slots:
                    return f"Dr. {doc_name} has no free slots on {target_date_str}. Please select another date.", None, False
                slot = avail_slots[0]

            proposal_params = {
                "doctor_id": matched_doc.id,
                "date": target_date_str,
                "time_slot": slot,
                "reason": "Consultation scheduled via AI Assistant",
            }

            # Always propose booking first to strictly enforce the two-step confirmation flow
            conversation.pending_action = {
                "action": "book_appointment",
                "params": proposal_params,
            }
            proposed = ProposedAction(
                action="book_appointment",
                summary=f"Consultation with Dr. {doc_name} on {target_date_str} at {slot}",
                params=proposal_params,
            )
            return (
                f"I can book your consultation with Dr. {doc_name} ({matched_doc.specialization}) on {target_date_str} at {slot}. "
                f"Please confirm if you would like me to proceed.",
                proposed,
                False,
            )

        # Symptom triage -> suggest_department
        symptom_keywords = ["pain", "ache", "toothache", "swollen", "bleed", "bleeding", "brace", "align", "molar", "wisdom", "cavity", "chewing", "throbbing"]
        if any(w in lower for w in symptom_keywords):
            triage_res = await cls.tool_suggest_department({"symptoms": user_message})
            dept = triage_res["suggested_department"]
            rat = triage_res["triage_rationale"]
            # Enforce strictly no diagnosis
            return (
                f"Based on the symptoms described, we recommend consulting our {dept} department. "
                f"{rat} Our specialists can evaluate your oral health and recommend appropriate care during an in-person visit.",
                None,
                False,
            )

        # Check Availability
        if "availab" in lower or "slots" in lower or "free" in lower:
            today = datetime.date.today()
            target_date_str = str(today + datetime.timedelta(days=1))
            date_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", user_message)
            if date_match:
                target_date_str = date_match.group(1)

            avail = await cls.tool_check_doctor_availability(db, {"date": target_date_str})
            docs_checked = avail.get("doctors_checked", [])
            if not docs_checked:
                return f"No active practitioners found on {target_date_str}.", None, False
            first = docs_checked[0]
            slots_str = ", ".join(first["available_slots"][:5]) if first["available_slots"] else "None"
            return (
                f"On {target_date_str}, Dr. {first['doctor_name']} ({first['specialization']}) has available slots: {slots_str}. "
                f"Would you like me to book one of these slots for you?",
                None,
                False,
            )

        # Clinic Info inquiry
        has_timing = any(w in lower for w in ["hours", "timings", "open", "timing", "when are you"])
        has_loc = any(w in lower for w in ["where", "location", "address", "directions", "locate"])
        has_services = any(w in lower for w in ["services", "treatments", "procedures", "what do you offer"])
        has_docs = any(w in lower for w in ["doctors", "dentists", "practitioners", "specialists"])

        if has_timing and has_loc:
            t_info = await cls.tool_get_clinic_info(db, {"query_type": "timing"})
            l_info = await cls.tool_get_clinic_info(db, {"query_type": "location"})
            return f"{t_info['info']}\n\nClinic Location: {l_info['info']}", None, False
        elif has_timing:
            info = await cls.tool_get_clinic_info(db, {"query_type": "timing"})
            return info["info"], None, False
        elif has_loc:
            info = await cls.tool_get_clinic_info(db, {"query_type": "location"})
            return info["info"], None, False
        elif has_services:
            info = await cls.tool_get_clinic_info(db, {"query_type": "services"})
            return info["info"], None, False
        elif has_docs:
            info = await cls.tool_get_clinic_info(db, {"query_type": "doctors"})
            doc_names = ", ".join([f"Dr. {d['name']} ({d['specialization']})" for d in info.get("active_doctors", [])])
            return f"Our active clinical practitioners include: {doc_names}.", None, False

        # Default fallback
        return (
            "I am here to help you with DCMS clinic appointments, doctor schedules, and service details. "
            "How may I assist your dental care today?",
            None,
            False,
        )

    # =========================================================================
    # ANTHROPIC CLAUDE API RUNNER
    # =========================================================================

    @classmethod
    async def process_chat_turn(
        cls,
        db: AsyncSession,
        patient: Patient,
        user: User,
        conversation_id: Optional[str],
        user_message: str,
        confirmed_by_user: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Processes one conversation turn:
        1. Retrieves or creates ChatConversation and loads history.
        2. Saves the user's incoming message.
        3. Routes to Claude API with tool calling (or MockClaudeEngine if offline).
        4. Enforces data isolation and confirmation guardrails.
        5. Saves assistant message and returns response.
        """
        conversation = await cls.get_or_create_conversation(db, conversation_id, patient)

        # Save user message to database
        user_msg = ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=user_message,
        )
        db.add(user_msg)
        await db.commit()

        # Check if user confirmed action
        confirmed = bool(confirmed_by_user) or bool(
            re.search(r"\b(yes|confirm|confirmed|proceed|sure|ok|okay|go ahead|book it|please do)\b", user_message, re.IGNORECASE)
        )

        reply_text = ""
        proposed_action: Optional[ProposedAction] = None
        is_handed_off = False

        # If Anthropic API key is available, use real Claude API
        if settings.ANTHROPIC_API_KEY:
            try:
                import anthropic

                client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

                # Format messages for Claude
                messages_payload = []
                for m in conversation.messages[-10:]:
                    if m.role in ["user", "assistant"]:
                        messages_payload.append({"role": m.role, "content": m.content})
                messages_payload.append({"role": "user", "content": user_message})

                response = await client.messages.create(
                    model=settings.CLAUDE_MODEL,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=messages_payload,
                    tools=CLAUDE_TOOLS,
                )

                # Process tool calls if requested by Claude
                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            tool_name = block.name
                            tool_args = block.input

                            # Guardrail: Mutation requires explicit confirmation
                            if tool_name in ["book_appointment", "cancel_appointment", "reschedule_appointment"]:
                                if not conversation.pending_action and not confirmed:
                                    # Intercept: convert to proposal
                                    conversation.pending_action = {
                                        "action": tool_name,
                                        "params": tool_args,
                                    }
                                    tool_res = {
                                        "status": "confirmation_required",
                                        "message": "User confirmation required before executing. Ask the patient to confirm.",
                                    }
                                    proposed_action = ProposedAction(
                                        action=tool_name,
                                        summary=f"Action: {tool_name} with parameters {tool_args}",
                                        params=tool_args,
                                    )
                                else:
                                    # Execute mutation with verified patient credentials
                                    conversation.pending_action = None
                                    if tool_name == "book_appointment":
                                        tool_res = await cls.tool_book_appointment(db, patient, tool_args)
                                    elif tool_name == "cancel_appointment":
                                        tool_res = await cls.tool_cancel_appointment(db, patient, user, tool_args)
                                    else:
                                        tool_res = await cls.tool_reschedule_appointment(db, patient, tool_args)
                            elif tool_name == "check_doctor_availability":
                                tool_res = await cls.tool_check_doctor_availability(db, tool_args)
                            elif tool_name == "suggest_department":
                                tool_res = await cls.tool_suggest_department(tool_args)
                            elif tool_name == "get_clinic_info":
                                tool_res = await cls.tool_get_clinic_info(db, tool_args)
                            else:
                                tool_res = {"error": f"Unknown tool: {tool_name}"}

                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps(tool_res),
                            })

                    # Second turn with tool results to generate final natural-language response
                    second_response = await client.messages.create(
                        model=settings.CLAUDE_MODEL,
                        max_tokens=1024,
                        system=SYSTEM_PROMPT,
                        messages=[
                            *messages_payload,
                            {"role": "assistant", "content": response.content},
                            {"role": "user", "content": tool_results},
                        ],
                    )
                    reply_text = "".join(
                        b.text for b in second_response.content if hasattr(b, "text")
                    )
                else:
                    reply_text = "".join(
                        b.text for b in response.content if hasattr(b, "text")
                    )

            except Exception as err:
                logger.error("Claude API call failed, using mock fallback: %s", err)
                reply_text, proposed_action, is_handed_off = await cls.run_mock_engine(
                    db, patient, user, user_message, conversation, confirmed
                )
        else:
            # Deterministic engine for CI / offline tests
            reply_text, proposed_action, is_handed_off = await cls.run_mock_engine(
                db, patient, user, user_message, conversation, confirmed
            )

        # Enforce no-diagnosis guardrail
        reply_text = cls.sanitize_diagnosis(reply_text)

        # Save assistant message
        asst_msg = ChatMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=reply_text,
            tool_calls=proposed_action.model_dump() if proposed_action else None,
        )
        db.add(asst_msg)

        if is_handed_off:
            conversation.is_handed_off = True

        await db.commit()

        return {
            "conversation_id": conversation.id,
            "message": reply_text,
            "proposed_action": proposed_action,
            "is_handed_off": conversation.is_handed_off,
            "created_at": asst_msg.created_at or datetime.datetime.now(datetime.timezone.utc),
        }
