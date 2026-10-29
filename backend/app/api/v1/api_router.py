from fastapi import APIRouter
from app.api.v1.endpoints import admin_users, appointments, auth, billing, chatbot, doctors, notifications, patients, treatments

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["Admin Staff Management"])
api_router.include_router(patients.router, prefix="/patients", tags=["Patient Management"])
api_router.include_router(doctors.router, prefix="/doctors", tags=["Doctor & Staff Management"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["Appointment Management"])
api_router.include_router(treatments.router, tags=["Treatment Records"])
api_router.include_router(billing.router, tags=["Billing & Invoicing"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["AI Chatbot Assistant"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications & Alerts"])



