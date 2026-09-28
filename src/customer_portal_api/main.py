from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlmodel import Session

from customer_portal_api.app.bootstrap import initialize_runtime, shutdown_runtime
from customer_portal_api.app.config import settings
from customer_portal_api.app.db import engine
from customer_portal_api.app.routers.admin import router as admin_router
from customer_portal_api.app.routers.app_api import router as app_router
from customer_portal_api.app.routers.auth import router as auth_router
from customer_portal_api.app.routers.payment import router as payment_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_runtime()
    yield
    shutdown_runtime()


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"ok": True, "service": "customer-portal-api"}


@app.get("/ready", tags=["health"])
def ready():
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
        return {"ok": True, "database": {"ok": True}}
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "database": {"ok": False, "error": str(exc)}},
        )


app.include_router(auth_router, prefix="/api")
app.include_router(app_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(payment_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("customer_portal_api.main:app", host="0.0.0.0", port=8100, reload=False)
