from __future__ import annotations

import base64
import io
import json
import mimetypes
import os
import re
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from application.account_exports import AccountExportsService, ExportArtifact
from core.config_store import config_store
from core.db import TaskModel, engine
from core.paths import project_root
from domain.accounts import (
    AccountCreateCommand,
    AccountExportSelection,
    AccountQuery,
    AccountUpdateCommand,
)
from infrastructure.accounts_repository import AccountsRepository
from platforms.chatgpt.constants import CODEX_CLIENT_ID
from sqlmodel import Session, select


SENSITIVE_CONFIG_KEYS = {
    "idp_team_automation_idp_token",
    "idp_team_automation_sub2api_password",
}

BLOCKED_ENTRYPOINTS = ["run_batch_tui.py", "run_idp_codex.py"]
DEFAULT_CHATGPT_PLATFORM = "chatgpt"
IDP_SYNC_TASK_TYPE = "idp_team_automation_sync"
ACTIVE_SYNC_TASK_STATUSES = {"pending", "claimed", "running", "cancel_requested"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    return _utcnow().isoformat().replace("+00:00", "Z")


def _safe_path(value: str, default: Path) -> Path:
    text = str(value or "").strip()
    return Path(text).expanduser().resolve() if text else default.resolve()


def _config_value(key: str, default: str = "") -> str:
    return str(config_store.get(key, default) or "").strip()


def redact_sensitive_text(value: Any) -> str:
    text = str(value or "")
    patterns = (
        r"(?i)(access_token|refresh_token|id_token|token|password|authorization|cookie|code)=([^&\s]+)",
        r"(?i)(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._\-]+",
        r"(?i)(Bearer\s+)[A-Za-z0-9._\-]+",
    )
    for pattern in patterns:
        text = re.sub(pattern, lambda m: m.group(1) + "***REDACTED***", text)
    return text


def _text(value: Any) -> str:
    return str(value or "").strip()


def _parse_callback_token_payload(callback_url: str) -> dict[str, str]:
    parsed = urllib.parse.urlparse(str(callback_url or "").strip())
    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    fragment = urllib.parse.parse_qs(parsed.fragment, keep_blank_values=True)
    values = {**query, **fragment}
    payload: dict[str, str] = {}
    for source, target in (
        ("access_token", "access_token"),
        ("accessToken", "access_token"),
        ("refresh_token", "refresh_token"),
        ("refreshToken", "refresh_token"),
        ("id_token", "id_token"),
        ("idToken", "id_token"),
        ("account_id", "account_id"),
        ("accountId", "account_id"),
        ("chatgpt_account_id", "account_id"),
        ("client_id", "client_id"),
        ("clientId", "client_id"),
        ("email", "email"),
        ("expired", "expired"),
        ("expires_at", "expired"),
        ("last_refresh", "last_refresh"),
    ):
        raw = values.get(source, [""])
        value = _text(raw[0] if raw else "")
        if value:
            payload[target] = value
    return payload


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    raw = _text(token)
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    parts = raw.split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _parse_timestamp(value: Any, *, default: int | None = None) -> int | None:
    if isinstance(value, (int, float)):
        return int(value if value < 1e11 else value / 1000)
    text = _text(value)
    if not text:
        return default
    try:
        numeric = float(text)
        return int(numeric if numeric < 1e11 else numeric / 1000)
    except Exception:
        pass
    try:
        if text.endswith("Z"):
            return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())
        return int(datetime.fromisoformat(text).timestamp())
    except Exception:
        return default


def _first_non_empty(*values: Any) -> str:
    for value in values:
        text = _text(value)
        if text:
            return text
    return ""


def _is_managed_account(item: Any) -> bool:
    overview = dict(getattr(item, "overview", {}) or {})
    ita = dict(overview.get("idp_team_automation") or {})
    return bool(ita.get("managed"))


def _credential_value(item: Any, *keys: str) -> str:
    for key in keys:
        for credential in getattr(item, "credentials", []) or []:
            if credential.get("scope") == "platform" and credential.get("key") == key and credential.get("value"):
                return str(credential["value"])
    return ""


def _oauth_secret_for_account(item: Any) -> dict[str, str]:
    return {
        "access_token": _credential_value(item, "access_token", "accessToken", "legacy_token"),
        "refresh_token": _credential_value(item, "refresh_token", "refreshToken"),
        "id_token": _credential_value(item, "id_token", "idToken"),
        "account_id": _first_non_empty(item.user_id, _credential_value(item, "account_id", "chatgpt_account_id")),
        "client_id": _credential_value(item, "client_id", "clientId") or CODEX_CLIENT_ID,
        "expired": _text((dict(getattr(item, "overview", {}) or {}).get("codex_oauth") or {}).get("expired")),
        "last_refresh": _text((dict(getattr(item, "overview", {}) or {}).get("codex_oauth") or {}).get("refreshed_at")),
    }


def _has_oauth_credentials(item: Any) -> bool:
    secret = _oauth_secret_for_account(item)
    return bool(secret.get("access_token") or secret.get("refresh_token"))


def _merge_ita_overview(existing: dict[str, Any] | None, updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing or {})
    ita = dict(merged.get("idp_team_automation") or {})
    for key, value in updates.items():
        if value is None:
            continue
        if value == "":
            ita.pop(key, None)
            continue
        ita[key] = value
    merged["idp_team_automation"] = ita
    return merged


def _parse_datetime(value: Any) -> datetime | None:
    text = _text(value)
    if not text:
        return None
    try:
        if text.endswith("Z"):
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _bool_config_value(value: Any, default: bool = False) -> bool:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in {"0", "false", "no", "off", "disabled"}


def _int_config_value(value: Any, default: int) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        return default
    return numeric if numeric > 0 else default


def _serialize_datetime(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _write_artifact(path: Path, artifact: ExportArtifact) -> None:
    content = artifact.content
    if isinstance(content, io.BytesIO):
        path.write_bytes(content.getvalue())
        return
    if isinstance(content, bytes):
        path.write_bytes(content)
        return
    path.write_text(str(content), encoding="utf-8")


def resolve_sync_artifact_download(
    task_id: str,
    filename: str,
    settings: IdpTeamAutomationSettings | None = None,
) -> tuple[Path, str]:
    settings = settings or IdpTeamAutomationSettings.from_store()
    artifact_root = settings.artifact_root.resolve()
    task_text = _text(task_id)
    filename_text = _text(filename)
    if not task_text or not filename_text:
        raise ValueError("invalid artifact filename")
    if Path(filename_text).name != filename_text:
        raise ValueError("invalid artifact filename")

    task_dir = (artifact_root / task_text).resolve()
    artifact_path = (task_dir / filename_text).resolve()
    try:
        task_dir.relative_to(artifact_root)
        artifact_path.relative_to(task_dir)
    except ValueError as exc:
        raise ValueError("invalid artifact filename") from exc
    if not artifact_path.is_file():
        raise FileNotFoundError("artifact not found")

    media_type = mimetypes.guess_type(artifact_path.name)[0] or "application/octet-stream"
    return artifact_path, media_type


def _read_authorized_payload(payload_text: str) -> tuple[dict[str, str], str]:
    text = str(payload_text or "").strip()
    if not text:
        raise ValueError("payload_text is empty")
    try:
        decoded = json.loads(text)
    except Exception:
        decoded = None
    if isinstance(decoded, dict):
        if _text(decoded.get("callback_url")):
            callback_payload = _parse_callback_token_payload(_text(decoded.get("callback_url")))
            callback_payload.update(
                {
                    key: _text(decoded.get(key))
                    for key in ("email", "client_id", "expired", "last_refresh")
                    if _text(decoded.get(key))
                }
            )
            return callback_payload, "token_json"
        payload = {
            target: _text(
                decoded.get(source)
            )
            for source, target in (
                ("access_token", "access_token"),
                ("accessToken", "access_token"),
                ("refresh_token", "refresh_token"),
                ("refreshToken", "refresh_token"),
                ("id_token", "id_token"),
                ("idToken", "id_token"),
                ("account_id", "account_id"),
                ("accountId", "account_id"),
                ("chatgpt_account_id", "account_id"),
                ("client_id", "client_id"),
                ("clientId", "client_id"),
                ("email", "email"),
                ("expired", "expired"),
                ("expires_at", "expired"),
                ("last_refresh", "last_refresh"),
            )
            if _text(decoded.get(source))
        }
        if payload:
            return payload, "token_json"
    callback_payload = _parse_callback_token_payload(text)
    if callback_payload:
        return callback_payload, "callback_url"
    raise ValueError("payload_text does not contain a supported callback URL or token JSON")


@dataclass(frozen=True)
class IdpTeamAutomationSettings:
    repo_dir: Path
    python_executable: str
    artifact_root: Path
    idp_base: str = ""
    idp_token: str = ""
    idp_client_id: str = ""
    idp_channel_id: str = ""
    idp_domain: str = ""
    codex_client_id: str = ""
    codex_redirect_uri: str = ""
    codex_scope: str = ""
    proxy: str = ""
    sub2api_url: str = ""
    sub2api_email: str = ""
    sub2api_password: str = ""
    sub2api_group: str = ""
    sub2api_model_whitelist: str = ""
    sub2api_concurrency: str = ""
    sub2api_priority: str = ""
    sub2api_rate_multiplier: str = ""
    request_timeout: str = ""

    @classmethod
    def from_store(cls) -> "IdpTeamAutomationSettings":
        root = project_root()
        return cls(
            repo_dir=_safe_path(
                _config_value("idp_team_automation_repo_dir"),
                root / ".tmp" / "ita",
            ),
            python_executable=_config_value("idp_team_automation_python_executable", sys.executable),
            artifact_root=_safe_path(
                _config_value("idp_team_automation_artifact_root"),
                root / "artifacts" / "idp_team_automation",
            ),
            idp_base=_config_value("idp_team_automation_idp_base"),
            idp_token=_config_value("idp_team_automation_idp_token"),
            idp_client_id=_config_value("idp_team_automation_idp_client_id"),
            idp_channel_id=_config_value("idp_team_automation_idp_channel_id"),
            idp_domain=_config_value("idp_team_automation_idp_domain"),
            codex_client_id=_config_value("idp_team_automation_codex_client_id"),
            codex_redirect_uri=_config_value("idp_team_automation_codex_redirect_uri"),
            codex_scope=_config_value("idp_team_automation_codex_scope"),
            proxy=_config_value("idp_team_automation_proxy"),
            sub2api_url=_config_value("idp_team_automation_sub2api_url"),
            sub2api_email=_config_value("idp_team_automation_sub2api_email"),
            sub2api_password=_config_value("idp_team_automation_sub2api_password"),
            sub2api_group=_config_value("idp_team_automation_sub2api_group"),
            sub2api_model_whitelist=_config_value("idp_team_automation_sub2api_model_whitelist"),
            sub2api_concurrency=_config_value("idp_team_automation_sub2api_concurrency"),
            sub2api_priority=_config_value("idp_team_automation_sub2api_priority"),
            sub2api_rate_multiplier=_config_value("idp_team_automation_sub2api_rate_multiplier"),
            request_timeout=_config_value("idp_team_automation_request_timeout"),
        )


@dataclass(frozen=True)
class IdpTeamAutomationPolicy:
    enabled: bool
    interval_minutes: int
    export_sub2api: bool
    export_any2api: bool
    push_sub2api: bool
    scope: str
    anchor_at: str = ""
    last_triggered_at: str = ""

    @classmethod
    def from_store(cls) -> "IdpTeamAutomationPolicy":
        return cls(
            enabled=_bool_config_value(_config_value("idp_team_automation_schedule_enabled"), False),
            interval_minutes=_int_config_value(
                _config_value("idp_team_automation_schedule_interval_minutes"),
                60,
            ),
            export_sub2api=_bool_config_value(
                _config_value("idp_team_automation_schedule_export_sub2api"),
                True,
            ),
            export_any2api=_bool_config_value(
                _config_value("idp_team_automation_schedule_export_any2api"),
                False,
            ),
            push_sub2api=_bool_config_value(
                _config_value("idp_team_automation_schedule_push_sub2api"),
                False,
            ),
            scope=_text(_config_value("idp_team_automation_schedule_scope")) or "all_managed",
            anchor_at=_config_value("idp_team_automation_schedule_anchor_at"),
            last_triggered_at=_config_value("idp_team_automation_schedule_last_triggered_at"),
        )

    def next_run_at(self, *, now: datetime | None = None) -> str:
        if not self.enabled:
            return ""
        current = (now or _utcnow()).astimezone(timezone.utc)
        anchor = _parse_datetime(self.anchor_at) or current
        last_triggered = _parse_datetime(self.last_triggered_at)
        baseline = last_triggered or anchor
        return _serialize_datetime(baseline + timedelta(minutes=max(int(self.interval_minutes or 60), 1)))


def _policy_active_task_exists() -> bool:
    with Session(engine) as session:
        task = session.exec(
            select(TaskModel)
            .where(TaskModel.type == IDP_SYNC_TASK_TYPE)
            .where(TaskModel.status.in_(tuple(ACTIVE_SYNC_TASK_STATUSES)))
            .limit(1)
        ).first()
    return bool(task)


def get_sync_policy(*, now: datetime | None = None) -> dict[str, Any]:
    policy = IdpTeamAutomationPolicy.from_store()
    return {
        "enabled": policy.enabled,
        "interval_minutes": int(policy.interval_minutes or 60),
        "export_sub2api": policy.export_sub2api,
        "export_any2api": policy.export_any2api,
        "push_sub2api": policy.push_sub2api,
        "scope": policy.scope or "all_managed",
        "anchor_at": policy.anchor_at,
        "last_triggered_at": policy.last_triggered_at,
        "next_run_at": policy.next_run_at(now=now),
        "has_active_task": _policy_active_task_exists(),
    }


def update_sync_policy(payload: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    current = IdpTeamAutomationPolicy.from_store()
    current_now = (now or _utcnow()).astimezone(timezone.utc)
    enabled = _bool_config_value(payload.get("enabled"), current.enabled)
    interval_minutes = _int_config_value(payload.get("interval_minutes"), current.interval_minutes or 60)
    export_sub2api = _bool_config_value(payload.get("export_sub2api"), current.export_sub2api)
    export_any2api = _bool_config_value(payload.get("export_any2api"), current.export_any2api)
    push_sub2api = _bool_config_value(payload.get("push_sub2api"), current.push_sub2api)
    scope = _text(payload.get("scope")) or current.scope or "all_managed"
    if scope != "all_managed":
        raise ValueError("仅支持 all_managed 策略范围")

    anchor_at = current.anchor_at
    if enabled and (not current.enabled or not anchor_at or interval_minutes != current.interval_minutes):
        anchor_at = _serialize_datetime(current_now)
    if not enabled:
        anchor_at = current.anchor_at or _serialize_datetime(current_now)

    config_store.set_many(
        {
            "idp_team_automation_schedule_enabled": "true" if enabled else "false",
            "idp_team_automation_schedule_interval_minutes": str(interval_minutes),
            "idp_team_automation_schedule_export_sub2api": "true" if export_sub2api else "false",
            "idp_team_automation_schedule_export_any2api": "true" if export_any2api else "false",
            "idp_team_automation_schedule_push_sub2api": "true" if push_sub2api else "false",
            "idp_team_automation_schedule_scope": scope,
            "idp_team_automation_schedule_anchor_at": anchor_at,
        }
    )
    return get_sync_policy(now=current_now)


def list_sync_history(limit: int = 20) -> dict[str, Any]:
    limit = min(max(int(limit or 20), 1), 100)
    with Session(engine) as session:
        tasks = session.exec(
            select(TaskModel)
            .where(TaskModel.type == IDP_SYNC_TASK_TYPE)
            .order_by(TaskModel.created_at.desc())
            .limit(limit)
        ).all()

    items: list[dict[str, Any]] = []
    for task in tasks:
        payload = task.get_payload()
        result = task.get_result()
        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        items.append(
            {
                "task_id": task.id,
                "status": task.status,
                "ok": bool(data.get("ok")) if data else task.status == "succeeded",
                "trigger_source": _text(payload.get("trigger_source")) or "manual",
                "selected_count": int(data.get("selected_count") or 0),
                "eligible_count": int(data.get("eligible_count") or 0),
                "artifact_root": _text(data.get("artifact_root")),
                "artifacts": list(data.get("artifacts") or []),
                "pushes": list(data.get("pushes") or []),
                "warnings": list(data.get("warnings") or []),
                "error": _text(data.get("error") or task.error),
                "created_at": _serialize_datetime(task.created_at),
                "started_at": _serialize_datetime(task.started_at),
                "finished_at": _serialize_datetime(task.finished_at),
            }
        )
    return {"items": json.loads(redact_sensitive_text(json.dumps(items, ensure_ascii=False)))}


def maybe_trigger_scheduled_sync(*, now: datetime | None = None) -> dict[str, Any]:
    current_now = (now or _utcnow()).astimezone(timezone.utc)
    policy = IdpTeamAutomationPolicy.from_store()
    next_run_at = policy.next_run_at(now=current_now)
    if not policy.enabled:
        return {"triggered": False, "reason": "disabled", "next_run_at": next_run_at}
    if not next_run_at:
        return {"triggered": False, "reason": "missing_next_run", "next_run_at": ""}
    next_run = _parse_datetime(next_run_at)
    if next_run and current_now < next_run:
        return {"triggered": False, "reason": "not_due", "next_run_at": next_run_at}
    if _policy_active_task_exists():
        return {"triggered": False, "reason": "active_task_exists", "next_run_at": next_run_at}

    from application.tasks import create_idp_team_automation_sync_task

    task = create_idp_team_automation_sync_task(
        {
            "account_ids": [],
            "export_sub2api": policy.export_sub2api,
            "export_any2api": policy.export_any2api,
            "push_sub2api": policy.push_sub2api,
            "trigger_source": "scheduled",
        }
    )
    try:
        from services.task_runtime import task_runtime

        task_runtime.wake_up()
    except Exception:
        pass
    config_store.set_many(
        {
            "idp_team_automation_schedule_last_triggered_at": _serialize_datetime(current_now),
            "idp_team_automation_schedule_anchor_at": policy.anchor_at or _serialize_datetime(current_now),
        }
    )
    return {
        "triggered": True,
        "task_id": task["id"],
        "next_run_at": get_sync_policy(now=current_now).get("next_run_at", ""),
    }


def inspect_repo(
    settings: IdpTeamAutomationSettings | None = None,
    repository: AccountsRepository | None = None,
) -> dict[str, Any]:
    settings = settings or IdpTeamAutomationSettings.from_store()
    repository = repository or AccountsRepository()
    repo_dir = settings.repo_dir
    scripts_dir = repo_dir / "scripts"
    repo_exists = repo_dir.is_dir()
    entrypoints = {
        "batch": (scripts_dir / "run_batch_tui.py").is_file(),
        "single": (scripts_dir / "run_idp_codex.py").is_file(),
    }
    required_files = {
        "pyproject": (repo_dir / "pyproject.toml").is_file(),
        "readme": (repo_dir / "README.md").is_file(),
        "tests": (repo_dir / "tests").is_dir(),
    }
    managed_accounts = [
        item
        for item in repository.select_for_export(
            AccountExportSelection(platform=DEFAULT_CHATGPT_PLATFORM, select_all=True)
        )
        if _is_managed_account(item)
    ]
    eligible_accounts = [item for item in managed_accounts if _has_oauth_credentials(item)]
    configured = bool(str(repo_dir)) and repo_exists
    warnings: list[str] = []
    if not repo_exists:
        warnings.append("ITA 仓库目录不存在，请先拉取 supperzl/ita 到本地")
    if repo_exists and not required_files["pyproject"]:
        warnings.append("未找到 pyproject.toml，当前目录可能不是 ITA 仓库根目录")
    if settings.sub2api_url and not settings.sub2api_email:
        warnings.append("已填写 Sub2API URL，但管理员邮箱为空")
    return {
        "configured": configured,
        "repo_dir": str(repo_dir),
        "repo_exists": repo_exists,
        "python_executable": settings.python_executable,
        "artifact_root": str(settings.artifact_root),
        "required_files": required_files,
        "entrypoints": entrypoints,
        "blocked_actions": list(BLOCKED_ENTRYPOINTS),
        "has_idp_token": bool(settings.idp_token),
        "has_sub2api_password": bool(settings.sub2api_password),
        "managed_account_count": len(managed_accounts),
        "eligible_sync_account_count": len(eligible_accounts),
        "warnings": warnings,
        "safe_mode": True,
    }


def list_managed_accounts(repository: AccountsRepository | None = None) -> list[dict[str, Any]]:
    repository = repository or AccountsRepository()
    items = repository.select_for_export(
        AccountExportSelection(platform=DEFAULT_CHATGPT_PLATFORM, select_all=True)
    )
    managed = [item for item in items if _is_managed_account(item)]
    results: list[dict[str, Any]] = []
    for item in managed:
        ita = dict((item.overview or {}).get("idp_team_automation") or {})
        results.append(
            {
                "id": int(item.id),
                "email": item.email,
                "user_id": item.user_id,
                "display_status": item.display_status,
                "managed": True,
                "managed_source": _text(ita.get("managed_source")),
                "imported_at": _text(ita.get("imported_at")),
                "last_synced_at": _text(ita.get("last_synced_at")),
                "sub2api_remote_id": _text(ita.get("sub2api_remote_id")),
                "has_access_token": bool(_credential_value(item, "access_token", "accessToken", "legacy_token")),
                "has_refresh_token": bool(_credential_value(item, "refresh_token", "refreshToken")),
            }
        )
    return results


class IdpTeamAutomationAuthorizedImportService:
    def __init__(self, repository: AccountsRepository | None = None):
        self.repository = repository or AccountsRepository()

    def import_authorized_payload(
        self,
        *,
        email: str,
        password: str,
        payload_text: str,
        account_id: int = 0,
    ) -> dict[str, Any]:
        payload, source = _read_authorized_payload(payload_text)
        resolved_email = _first_non_empty(email, payload.get("email")).lower()
        if not resolved_email:
            raise ValueError("email is required")
        if not (payload.get("access_token") or payload.get("refresh_token")):
            raise ValueError("authorized payload must contain access_token or refresh_token")

        account = self._resolve_account(account_id=account_id, email=resolved_email)
        created = False
        if not account:
            account = self.repository.create(
                AccountCreateCommand(
                    platform=DEFAULT_CHATGPT_PLATFORM,
                    email=resolved_email,
                    password=str(password or ""),
                    user_id=_text(payload.get("account_id")),
                    primary_token=_text(payload.get("access_token")),
                    credentials={
                        key: value
                        for key, value in {
                            "access_token": payload.get("access_token"),
                            "refresh_token": payload.get("refresh_token"),
                            "id_token": payload.get("id_token"),
                            "account_id": payload.get("account_id"),
                            "client_id": payload.get("client_id") or CODEX_CLIENT_ID,
                        }.items()
                        if _text(value)
                    },
                    overview=_merge_ita_overview(
                        {},
                        {
                            "managed": True,
                            "managed_source": "authorized_import",
                            "imported_at": _utcnow_iso(),
                            "last_payload_source": source,
                            "authorized_email": resolved_email,
                        },
                    ),
                )
            )
            created = True
        else:
            merged_overview = _merge_ita_overview(
                account.overview,
                {
                    "managed": True,
                    "managed_source": "authorized_import",
                    "imported_at": _utcnow_iso(),
                    "last_payload_source": source,
                    "authorized_email": resolved_email,
                },
            )
            account = self.repository.update(
                account.id,
                AccountUpdateCommand(
                    password=password if password else None,
                    user_id=_text(payload.get("account_id")) or None,
                    credentials={
                        key: value
                        for key, value in {
                            "access_token": payload.get("access_token"),
                            "refresh_token": payload.get("refresh_token"),
                            "id_token": payload.get("id_token"),
                            "account_id": payload.get("account_id"),
                            "client_id": payload.get("client_id") or CODEX_CLIENT_ID,
                        }.items()
                        if _text(value)
                    },
                    primary_token=_text(payload.get("access_token")) or None,
                    overview={
                        **merged_overview,
                        "codex_oauth": {
                            "refreshed_at": _utcnow_iso(),
                            "email": resolved_email,
                            "expired": _text(payload.get("expired")),
                        },
                    },
                ),
            )
        if not account:
            raise ValueError("failed to save authorized payload")
        if created:
            account = self.repository.update(
                account.id,
                AccountUpdateCommand(
                    overview={
                        **account.overview,
                        "codex_oauth": {
                            "refreshed_at": _utcnow_iso(),
                            "email": resolved_email,
                            "expired": _text(payload.get("expired")),
                        },
                    }
                ),
            )
        return {
            "ok": True,
            "created": created,
            "account_id": int(account.id),
            "email": account.email,
            "payload_source": source,
        }

    def _resolve_account(self, *, account_id: int, email: str):
        if int(account_id or 0) > 0:
            item = self.repository.get(int(account_id))
            if item:
                return item
        total, items = self.repository.list(
            AccountQuery(platform=DEFAULT_CHATGPT_PLATFORM, email=email, page=1, page_size=200)
        )
        if total <= 0:
            return None
        lowered = str(email).lower()
        for item in items:
            if str(item.email).lower() == lowered:
                return item
        return None


@dataclass(frozen=True)
class Sub2ApiConfig:
    url: str
    email: str
    password: str
    group: str = ""
    model_whitelist: str = ""
    concurrency: int = 10
    priority: int = 1
    rate_multiplier: float = 1.0

    def validate(self) -> None:
        missing = []
        if not self.url:
            missing.append("SUB2API_URL")
        if not self.email:
            missing.append("SUB2API_EMAIL")
        if not self.password:
            missing.append("SUB2API_PASSWORD")
        if missing:
            raise ValueError("缺少 Sub2API 配置：" + ", ".join(missing))


@dataclass(frozen=True)
class OAuthExportRecord:
    account_id: str
    email: str
    secret: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)


class Sub2ApiExportProvider:
    def __init__(self, config: Sub2ApiConfig):
        self.config = config
        self.config.validate()

    def _api_base(self, raw_url: str) -> str:
        base = _text(raw_url).rstrip("/")
        if base.endswith("/api/v1"):
            return base
        if base.endswith("/api"):
            return f"{base}/v1"
        return f"{base}/api/v1"

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json_body: Any = None,
        timeout: float = 15,
    ) -> Any:
        body = None if json_body is None else json.dumps(json_body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "User-Agent": "SuperAutoplus/IdpTeamAutomation",
                **(headers or {}),
            },
        )
        attempts = 3
        payload: Any = {}
        for attempt in range(1, attempts + 1):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    text = resp.read().decode("utf-8", "replace")
                    payload = json.loads(text) if text.strip() else {}
                break
            except urllib.error.HTTPError as exc:
                text = exc.read().decode("utf-8", "replace")
                payload = json.loads(text) if text.strip() else {}
                message = payload.get("message") if isinstance(payload, dict) else text[:200]
                raise ValueError(f"Sub2API request failed: {message or f'HTTP {exc.code}'}") from exc
            except (urllib.error.URLError, ssl.SSLError, TimeoutError, socket.timeout, ConnectionResetError) as exc:
                if attempt >= attempts:
                    raise ValueError(f"Sub2API request failed: {exc}") from exc
                time.sleep(min(5.0, 0.5 * attempt))
        if isinstance(payload, dict) and "code" in payload:
            if payload.get("code") in (0, "0"):
                return payload.get("data")
            raise ValueError(str(payload.get("message") or payload))
        if isinstance(payload, dict) and set(payload) == {"data"}:
            return payload.get("data")
        return payload

    def _login(self, api_base: str) -> str:
        data = self._request_json(
            "POST",
            f"{api_base}/auth/login",
            json_body={"email": self.config.email, "password": self.config.password},
            timeout=15,
        )
        if not isinstance(data, dict):
            raise ValueError("Sub2API 登录返回格式异常")
        token = _first_non_empty(data.get("access_token"), data.get("token"), data.get("accessToken"))
        if not token:
            raise ValueError("Sub2API 登录成功但未返回 access_token")
        return token

    def _group_ids(self) -> list[int]:
        values: list[int] = []
        for raw in [item.strip() for item in str(self.config.group or "").split(",") if item.strip()]:
            try:
                numeric = int(raw)
            except (TypeError, ValueError):
                continue
            if numeric > 0 and numeric not in values:
                values.append(numeric)
        return values

    def _model_mapping(self) -> dict[str, str] | None:
        models = [item.strip() for item in str(self.config.model_whitelist or "").split(",") if item.strip()]
        return {model: model for model in models} if models else None

    def build_credentials(self, record: OAuthExportRecord) -> dict[str, Any]:
        id_token = _text(record.secret.get("id_token"))
        claims = _decode_jwt_payload(id_token)
        auth_claims = claims.get("https://api.openai.com/auth") if isinstance(claims.get("https://api.openai.com/auth"), dict) else {}
        credentials: dict[str, Any] = {}
        for key in ("access_token", "refresh_token", "id_token"):
            value = _text(record.secret.get(key))
            if value:
                credentials[key] = value
        expires_at = _parse_timestamp(_first_non_empty(record.secret.get("expired"), record.metadata.get("expired")))
        if expires_at:
            credentials["expires_at"] = expires_at
        client_id = _first_non_empty(
            record.secret.get("client_id"),
            record.metadata.get("client_id"),
            claims.get("aud", [""])[0] if isinstance(claims.get("aud"), list) else "",
            CODEX_CLIENT_ID,
        )
        if client_id:
            credentials["client_id"] = client_id
        email = _first_non_empty(record.email, claims.get("email"), record.metadata.get("email"))
        if email:
            credentials["email"] = email
        remote_account_id = _first_non_empty(
            record.secret.get("account_id"),
            record.metadata.get("remote_account_id"),
            auth_claims.get("chatgpt_account_id"),
            record.account_id,
        )
        if remote_account_id:
            credentials["chatgpt_account_id"] = remote_account_id
        user_id = _first_non_empty(
            auth_claims.get("chatgpt_user_id"),
            auth_claims.get("user_id"),
            record.secret.get("user_id"),
        )
        if user_id:
            credentials["chatgpt_user_id"] = user_id
        mapping = self._model_mapping()
        if mapping:
            credentials["model_mapping"] = mapping
        return credentials

    def build_account_payload(self, record: OAuthExportRecord) -> dict[str, Any]:
        credentials = self.build_credentials(record)
        if not _first_non_empty(credentials.get("access_token"), credentials.get("refresh_token")):
            raise ValueError("Sub2API 导出缺少 access_token/refresh_token")
        email = _first_non_empty(record.email, credentials.get("email"), record.account_id)
        return {
            "name": str(email)[:64],
            "platform": "openai",
            "type": "oauth",
            "credentials": credentials,
            "extra": {
                "idp_team_automation_managed": True,
                "idp_team_automation_source": "authorized_import",
                "idp_team_automation_email": str(email).lower(),
                "email": str(email).lower(),
            },
            "concurrency": max(int(self.config.concurrency or 10), 1),
            "priority": max(int(self.config.priority or 1), 1),
            "rate_multiplier": max(float(self.config.rate_multiplier or 1.0), 0.0),
            "auto_pause_on_expired": True,
            "group_ids": self._group_ids(),
        }

    def push(self, record: OAuthExportRecord) -> dict[str, Any]:
        api_base = self._api_base(self.config.url)
        token = self._login(api_base)
        payload = self.build_account_payload(record)
        remote_id_hint = _text(record.metadata.get("sub2api_remote_id"))
        method = "POST"
        url = f"{api_base}/admin/accounts"
        remote_action = "created"
        if remote_id_hint:
            method = "PUT"
            url = f"{api_base}/admin/accounts/{urllib.parse.quote(remote_id_hint)}"
            remote_action = "updated"
        created = self._request_json(
            method,
            url,
            headers=self._auth_headers(token),
            json_body=payload,
            timeout=20,
        )
        remote_id = (
            created.get("id")
            if isinstance(created, dict) and created.get("id") not in (None, "")
            else remote_id_hint
        )
        return {
            "status": "success",
            "provider": "sub2api",
            "email": record.email,
            "account_id": record.account_id,
            "remote_id": remote_id,
            "remote_action": remote_action,
        }


class IdpTeamAutomationPreflightRunner:
    def run(
        self,
        payload: dict[str, Any],
        *,
        task_id: str,
        log_fn: Callable[[str], Any],
        cancel_check: Callable[[], bool],
    ) -> dict[str, Any]:
        settings = IdpTeamAutomationSettings.from_store()
        run_tests = bool(payload.get("run_tests"))
        settings.artifact_root.mkdir(parents=True, exist_ok=True)

        log_fn("IDP Team Automation 安全预检开始")
        status = inspect_repo(settings)
        log_fn(f"仓库目录: {status['repo_dir']}")
        log_fn("安全边界: 不执行 run_batch_tui.py / run_idp_codex.py")

        tests_result: dict[str, Any] = {"requested": run_tests, "ok": None, "skipped": not run_tests}
        if cancel_check():
            return {**status, "ok": False, "cancelled": True, "tests": tests_result}

        if run_tests:
            if not status["repo_exists"]:
                tests_result = {
                    "requested": True,
                    "ok": False,
                    "skipped": False,
                    "error": "repo_not_found",
                }
            else:
                command = [settings.python_executable or sys.executable, "-m", "pytest", "-q"]
                log_fn("运行 ITA 仓库测试: python -m pytest -q")
                env = dict(os.environ)
                env.setdefault("PYTHONUTF8", "1")
                try:
                    completed = subprocess.run(
                        command,
                        cwd=str(settings.repo_dir),
                        capture_output=True,
                        text=True,
                        timeout=max(int(float(settings.request_timeout or 60)), 10),
                        env=env,
                    )
                    output = redact_sensitive_text(
                        "\n".join(
                            item
                            for item in [completed.stdout, completed.stderr]
                            if item
                        )
                    )
                    tests_result = {
                        "requested": True,
                        "ok": completed.returncode == 0,
                        "skipped": False,
                        "returncode": completed.returncode,
                        "output": output[-4000:],
                    }
                    for line in output.splitlines()[-12:]:
                        if line.strip():
                            log_fn(redact_sensitive_text(line.strip()))
                except Exception as exc:
                    tests_result = {
                        "requested": True,
                        "ok": False,
                        "skipped": False,
                        "error": redact_sensitive_text(str(exc)),
                    }

        ok = bool(status["repo_exists"] and status["required_files"]["pyproject"])
        if run_tests:
            ok = ok and bool(tests_result.get("ok"))
        result = {**status, "ok": ok, "task_id": task_id, "tests": tests_result}
        log_fn("预检完成")
        return result


class IdpTeamAutomationSyncRunner:
    def __init__(
        self,
        repository: AccountsRepository | None = None,
        exports_service: AccountExportsService | None = None,
    ):
        self.repository = repository or AccountsRepository()
        self.exports_service = exports_service or AccountExportsService(self.repository)

    def run(
        self,
        payload: dict[str, Any],
        *,
        task_id: str,
        log_fn: Callable[[str], Any],
        cancel_check: Callable[[], bool],
    ) -> dict[str, Any]:
        settings = IdpTeamAutomationSettings.from_store()
        settings.artifact_root.mkdir(parents=True, exist_ok=True)
        artifact_dir = settings.artifact_root / task_id
        artifact_dir.mkdir(parents=True, exist_ok=True)

        requested_ids = [int(item) for item in payload.get("account_ids") or [] if int(item or 0) > 0]
        export_sub2api = bool(payload.get("export_sub2api"))
        export_any2api = bool(payload.get("export_any2api"))
        push_sub2api = bool(payload.get("push_sub2api"))
        if not any((export_sub2api, export_any2api, push_sub2api)):
            raise ValueError("至少选择一个同步动作")

        all_items = self.repository.select_for_export(
            AccountExportSelection(platform=DEFAULT_CHATGPT_PLATFORM, select_all=True)
        )
        selected = [
            item
            for item in all_items
            if _is_managed_account(item) and (not requested_ids or int(item.id) in requested_ids)
        ]
        if requested_ids:
            requested_order = {account_id: index for index, account_id in enumerate(requested_ids)}
            selected.sort(key=lambda item: requested_order.get(int(item.id), len(requested_ids)))
        eligible = [item for item in selected if _has_oauth_credentials(item)]

        log_fn(f"受管账号: {len(selected)}，可同步账号: {len(eligible)}")
        if cancel_check():
            return {
                "ok": False,
                "cancelled": True,
                "task_id": task_id,
                "selected_count": len(selected),
                "eligible_count": len(eligible),
                "artifacts": [],
                "pushes": [],
            }
        if not eligible:
            return {
                "ok": False,
                "task_id": task_id,
                "selected_count": len(selected),
                "eligible_count": 0,
                "artifacts": [],
                "pushes": [],
                "error": "no_eligible_accounts",
            }

        eligible_ids = [int(item.id) for item in eligible]
        artifacts: list[dict[str, Any]] = []
        pushes: list[dict[str, Any]] = []
        warnings: list[str] = []

        if export_sub2api:
            log_fn("生成 Sub2API 工件")
            artifact = self.exports_service.export_chatgpt_sub2api(
                AccountExportSelection(platform=DEFAULT_CHATGPT_PLATFORM, ids=eligible_ids)
            )
            path = artifact_dir / artifact.filename
            _write_artifact(path, artifact)
            artifacts.append(
                {
                    "kind": "sub2api_export",
                    "filename": artifact.filename,
                    "path": str(path),
                    "media_type": artifact.media_type,
                }
            )

        if export_any2api:
            any2api_ids = list(eligible_ids)
            if len(any2api_ids) > 1:
                warnings.append("Any2API admin.json 仅支持 1 个 ChatGPT token，本次只导出第一条受管账号")
                any2api_ids = any2api_ids[:1]
                log_fn("Any2API admin.json 仅支持 1 个 ChatGPT token，本次只导出第一条受管账号")
            log_fn("生成 Any2API 工件")
            artifact = self.exports_service.export_any2api(
                AccountExportSelection(platform=DEFAULT_CHATGPT_PLATFORM, ids=any2api_ids)
            )
            path = artifact_dir / artifact.filename
            _write_artifact(path, artifact)
            artifacts.append(
                {
                    "kind": "any2api_export",
                    "filename": artifact.filename,
                    "path": str(path),
                    "media_type": artifact.media_type,
                }
            )

        if push_sub2api:
            log_fn("推送到 Sub2API")
            provider = Sub2ApiExportProvider(
                Sub2ApiConfig(
                    url=settings.sub2api_url,
                    email=settings.sub2api_email,
                    password=settings.sub2api_password,
                    group=settings.sub2api_group,
                    model_whitelist=settings.sub2api_model_whitelist,
                    concurrency=int(float(settings.sub2api_concurrency or 10)),
                    priority=int(float(settings.sub2api_priority or 1)),
                    rate_multiplier=float(settings.sub2api_rate_multiplier or 1.0),
                )
            )
            failed_push_count = 0
            for item in eligible:
                if cancel_check():
                    return {
                        "ok": False,
                        "cancelled": True,
                        "task_id": task_id,
                        "selected_count": len(selected),
                        "eligible_count": len(eligible),
                        "artifacts": artifacts,
                        "pushes": pushes,
                    }
                secret = _oauth_secret_for_account(item)
                try:
                    result = provider.push(
                        OAuthExportRecord(
                            account_id=_first_non_empty(secret.get("account_id"), str(item.id)),
                            email=item.email,
                            secret=secret,
                            metadata={
                                "email": item.email,
                                "expired": secret.get("expired"),
                                "client_id": secret.get("client_id"),
                                "sub2api_remote_id": ((item.overview or {}).get("idp_team_automation") or {}).get("sub2api_remote_id"),
                            },
                        )
                    )
                    pushes.append(result)
                    log_fn(f"Sub2API 推送完成: {item.email}")
                    merged_overview = _merge_ita_overview(
                        item.overview,
                        {
                            "managed": True,
                            "last_synced_at": _utcnow_iso(),
                            "sub2api_remote_id": _text(result.get("remote_id")),
                            "sub2api_last_status": _text(result.get("status") or "success"),
                            "last_sync_error": "",
                        },
                    )
                except Exception as exc:
                    failed_push_count += 1
                    error_text = redact_sensitive_text(str(exc))
                    result = {
                        "status": "failed",
                        "provider": "sub2api",
                        "email": item.email,
                        "account_id": _first_non_empty(secret.get("account_id"), str(item.id)),
                        "remote_id": _text(((item.overview or {}).get("idp_team_automation") or {}).get("sub2api_remote_id")),
                        "remote_action": "failed",
                        "error": error_text,
                    }
                    pushes.append(result)
                    log_fn(f"Sub2API 推送失败: {item.email} - {error_text}")
                    merged_overview = _merge_ita_overview(
                        item.overview,
                        {
                            "managed": True,
                            "last_synced_at": _utcnow_iso(),
                            "sub2api_last_status": "failed",
                            "last_sync_error": error_text,
                        },
                    )
                updated = self.repository.update(
                    int(item.id),
                    AccountUpdateCommand(overview=merged_overview),
                )
                if updated:
                    item = updated
            if failed_push_count:
                warnings.append(f"{failed_push_count} 条 Sub2API 推送失败")

        result = {
            "ok": failed_push_count == 0 if push_sub2api else True,
            "task_id": task_id,
            "selected_count": len(selected),
            "eligible_count": len(eligible),
            "artifact_root": str(artifact_dir),
            "artifacts": artifacts,
            "pushes": pushes,
            "warnings": warnings,
        }
        if push_sub2api and failed_push_count:
            result["error"] = f"{failed_push_count} 条 Sub2API 推送失败"
        log_fn("同步完成")
        return json.loads(redact_sensitive_text(json.dumps(result, ensure_ascii=False)))
