from contextlib import asynccontextmanager
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.db.session import init_db, AsyncSessionLocal
from backend.app.api.v1.router import api_router
from backend.app.seed.seed_data import ensure_classic_demo_student_link, seed_database_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing LumenEIOS database tables...")
    await init_db()
    if settings.DEMO_MODE:
        async with AsyncSessionLocal() as session:
            await seed_database_if_empty(session)
            # Older classic demo DBs may lack StudentAccountLink; repair without reseeding.
            await ensure_classic_demo_student_link(session)
    logger.info("LumenEIOS Backend successfully started.")
    yield
    logger.info("LumenEIOS Backend shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    description="Adaptive EdTech Ecosystem Backend aligned with NEP 2020 Competency Standards",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

if settings.APP_ENV.lower() in {"production", "prod"}:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)


@app.exception_handler(SQLAlchemyError)
async def safe_database_error(request: Request, exc: SQLAlchemyError):
    # SQLAlchemy exception strings can include statement parameters (hashes, keys, answers).
    # Handle this known error class inside ExceptionMiddleware, without logging those values.
    logger.error("Database operation failed; request transaction was rolled back.")
    return JSONResponse(status_code=500, content={"detail": "Database operation failed."})


@app.exception_handler(RequestValidationError)
async def safe_validation_error(request: Request, exc: RequestValidationError):
    # Do not echo submitted passwords, keys, answers or non-finite numbers in validation errors.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]})


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    if not await _database_available():
        return JSONResponse(status_code=503, content={"status": "unhealthy", "database": "unavailable"})
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database": "connected"
    }


@app.get("/ready", tags=["Health"])
async def readiness_check():
    if not await _database_available():
        return JSONResponse(status_code=503, content={"ready": False})
    return {"ready": True}


async def _database_available():
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("Database readiness check failed.")
        return False


# Mount API Router
app.include_router(api_router, prefix=settings.API_V1_STR)

