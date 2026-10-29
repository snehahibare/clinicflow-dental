import contextlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.api.v1.api_router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import get_password_hash
from app.models.user import User, UserRole


async def seed_initial_admin():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == "admin@dcmsclinic.com")
        )
        admin = result.scalars().first()
        if not admin:
            admin_user = User(
                name="Clinic Administrator",
                email="admin@dcmsclinic.com",
                phone="+15550001111",
                password_hash=get_password_hash("AdminSecurePass123!"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(admin_user)
            await session.commit()
            print("[DCMS SEED] Initial Admin created: admin@dcmsclinic.com / AdminSecurePass123!")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables
    await init_db()
    # Seed default admin user for clinic operations
    await seed_initial_admin()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health Check"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }


app.include_router(api_router, prefix=settings.API_V1_STR)
