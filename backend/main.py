"""
main.py — MediSense AI FastAPI application entry point
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routers import (
    auth,
    chatbot,
    consultation,
    doctor,
    google_oauth,
    meet,
    patient,
    patient_chatbot,
)

# ── Logging ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan: startup / shutdown ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 MediSense AI backend starting up...")
    await init_db()
    logger.info("✅ Database initialised")
    logger.info(f"🤖 AI Model: {settings.ai_model} via OpenRouter")
    yield
    logger.info("🛑 MediSense AI shutting down")


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="MediSense AI",
    description=(
        "AI-powered health intelligence platform. "
        "Doctor side: audio → SOAP notes. "
        "Patient side: lab report → health guide."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
# All routers live under /api so frontend SPA routes like /doctor, /patient,
# /consultation etc. are never intercepted by the Vite dev-server proxy.
_API = "/api"
app.include_router(auth.router, prefix=_API)
app.include_router(doctor.router, prefix=_API)
app.include_router(patient.router, prefix=_API)
app.include_router(consultation.router, prefix=_API)
app.include_router(chatbot.router, prefix=_API)
app.include_router(patient_chatbot.router, prefix=_API)
app.include_router(google_oauth.router, prefix=_API)
app.include_router(meet.router, prefix=_API)


# ── Health check ───────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
@app.get("/api/health", tags=["system"])
async def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "model": settings.ai_model,
        "environment": settings.environment,
    }


@app.get("/", tags=["system"])
async def root():
    return {
        "message": "MediSense AI API is running. Visit /docs for API documentation.",
        "docs": "/docs",
        "health": "/health",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.app_host, port=settings.app_port, reload=True)