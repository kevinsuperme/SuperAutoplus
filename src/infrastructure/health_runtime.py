from __future__ import annotations

import os

from sqlalchemy import text
from sqlmodel import Session

from core.db import engine
from core.registry import list_platforms
from services.solver_manager import is_running


def _solver_disabled() -> bool:
    return os.environ.get("ACCOUNT_MANAGER_DISABLE_SOLVER", "").strip().lower() in {
        "1", "true", "yes", "on",
    }


class HealthRuntime:
    def health(self) -> dict:
        return {"ok": True, "service": "account-manager-v2"}

    def readiness(self) -> dict:
        db_ok = False
        db_error = ""
        registry_ok = False
        registry_error = ""
        try:
            with Session(engine) as session:
                session.exec(text("SELECT 1"))
            db_ok = True
        except Exception as exc:
            db_error = str(exc)

        try:
            platforms = list_platforms()
            platform_count = len(platforms)
            registry_ok = True
        except Exception as exc:
            platforms = []
            platform_count = 0
            registry_error = str(exc)

        solver_ok = is_running()
        solver_required = not _solver_disabled()
        return {
            "ok": db_ok and registry_ok and (solver_ok or not solver_required),
            "database": {"ok": db_ok, "error": db_error},
            "registry": {"ok": registry_ok, "platform_count": platform_count, "error": registry_error},
            "solver": {"running": solver_ok, "required": solver_required},
        }
