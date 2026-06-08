from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from application.idp_team_automation import (
    IdpTeamAutomationAuthorizedImportService,
    get_sync_policy,
    inspect_repo,
    list_managed_accounts,
    list_sync_history,
    resolve_sync_artifact_download,
    update_sync_policy,
)

router = APIRouter(prefix="/idp-team-automation", tags=["idp-team-automation"])
import_service = IdpTeamAutomationAuthorizedImportService()


class AuthorizedImportRequest(BaseModel):
    email: str
    password: str = ""
    payload_text: str
    account_id: int = 0


class ManagedAccountsResponse(BaseModel):
    items: list[dict] = Field(default_factory=list)


class SyncPolicyRequest(BaseModel):
    enabled: bool
    interval_minutes: int = 60
    export_sub2api: bool = True
    export_any2api: bool = False
    push_sub2api: bool = False
    scope: str = "all_managed"


@router.get("/status")
def get_idp_team_automation_status():
    return inspect_repo()


@router.get("/accounts")
def get_idp_team_automation_accounts():
    return {"items": list_managed_accounts()}


@router.get("/history")
def get_idp_team_automation_history(limit: int = 20):
    return list_sync_history(limit=limit)


@router.get("/policy")
def get_idp_team_automation_policy():
    return get_sync_policy()


@router.put("/policy")
def put_idp_team_automation_policy(body: SyncPolicyRequest):
    try:
        return update_sync_policy(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/authorized-import")
def import_idp_team_automation_authorized_payload(body: AuthorizedImportRequest):
    try:
        return import_service.import_authorized_payload(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/artifacts/{task_id}")
def download_idp_team_automation_artifact(task_id: str, filename: str):
    try:
        artifact_path, media_type = resolve_sync_artifact_download(task_id, filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(
        artifact_path,
        media_type=media_type,
        filename=artifact_path.name,
    )
