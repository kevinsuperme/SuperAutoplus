from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from application.health import HealthService

router = APIRouter(tags=["health"])
service = HealthService()


@router.get("/health")
def health():
    return service.health()


@router.get("/ready")
def ready():
    payload = service.readiness()
    return JSONResponse(
        status_code=200 if payload.get("ok") else 503,
        content=payload,
    )
