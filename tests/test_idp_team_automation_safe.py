from __future__ import annotations

import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlmodel import Session

from core.config_store import config_store
from core.db import TaskModel, engine
from domain.accounts import AccountCreateCommand
from infrastructure.accounts_repository import AccountsRepository
from infrastructure.config_repository import ConfigRepository


def test_config_repository_allows_idp_team_automation_keys():
    allowed = ConfigRepository().get_allowed_keys()

    assert "idp_team_automation_repo_dir" in allowed
    assert "idp_team_automation_python_executable" in allowed
    assert "idp_team_automation_artifact_root" in allowed
    assert "idp_team_automation_idp_base" in allowed
    assert "idp_team_automation_idp_token" in allowed
    assert "idp_team_automation_sub2api_url" in allowed
    assert "idp_team_automation_sub2api_password" in allowed
    assert "idp_team_automation_schedule_enabled" in allowed
    assert "idp_team_automation_schedule_interval_minutes" in allowed
    assert "idp_team_automation_schedule_export_sub2api" in allowed
    assert "idp_team_automation_schedule_export_any2api" in allowed
    assert "idp_team_automation_schedule_push_sub2api" in allowed


def test_create_idp_team_automation_preflight_task_keeps_secrets_out_of_payload(client):
    config_store.set_many(
        {
            "idp_team_automation_repo_dir": r"F:\SuperAutoplus\.tmp\ita",
            "idp_team_automation_idp_token": "idp-secret-token",
            "idp_team_automation_sub2api_password": "sub2api-secret-password",
        }
    )

    response = client.post(
        "/api/tasks/idp-team-automation/preflight",
        json={"run_tests": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "idp_team_automation_preflight"
    assert body["platform"] == "chatgpt"
    assert body["progress_detail"]["total"] == 1

    with Session(engine) as session:
        task = session.get(TaskModel, body["id"])
        assert task is not None
        payload = task.get_payload()

    assert payload == {"run_tests": True}
    assert "idp-secret-token" not in str(payload)
    assert "sub2api-secret-password" not in str(payload)


def test_status_endpoint_reports_repo_shape_without_revealing_secrets(client, tmp_path):
    repo_dir = tmp_path / "ita"
    (repo_dir / "scripts").mkdir(parents=True)
    (repo_dir / "scripts" / "run_batch_tui.py").write_text("# batch\n", encoding="utf-8")
    (repo_dir / "scripts" / "run_idp_codex.py").write_text("# single\n", encoding="utf-8")
    (repo_dir / "pyproject.toml").write_text("[project]\nname='ita'\n", encoding="utf-8")
    (repo_dir / "README.md").write_text("# ITA\n", encoding="utf-8")
    config_store.set_many(
        {
            "idp_team_automation_repo_dir": str(repo_dir),
            "idp_team_automation_idp_token": "idp-secret-token",
            "idp_team_automation_sub2api_password": "sub2api-secret-password",
        }
    )

    response = client.get("/api/idp-team-automation/status")

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["repo_exists"] is True
    assert body["entrypoints"]["batch"] is True
    assert body["entrypoints"]["single"] is True
    assert body["blocked_actions"] == ["run_batch_tui.py", "run_idp_codex.py"]
    assert "idp-secret-token" not in str(body)
    assert "sub2api-secret-password" not in str(body)


def test_preflight_runner_does_not_execute_ita_entrypoints(monkeypatch, tmp_path):
    from application.idp_team_automation import IdpTeamAutomationPreflightRunner

    repo_dir = tmp_path / "ita"
    (repo_dir / "scripts").mkdir(parents=True)
    (repo_dir / "scripts" / "run_batch_tui.py").write_text("# batch\n", encoding="utf-8")
    (repo_dir / "scripts" / "run_idp_codex.py").write_text("# single\n", encoding="utf-8")
    (repo_dir / "pyproject.toml").write_text("[project]\nname='ita'\n", encoding="utf-8")
    (repo_dir / "README.md").write_text("# ITA\n", encoding="utf-8")

    calls: list[list[str]] = []

    def fake_run(command, **kwargs):
        command_list = [str(item) for item in command]
        calls.append(command_list)
        assert "run_batch_tui.py" not in " ".join(command_list)
        assert "run_idp_codex.py" not in " ".join(command_list)
        return subprocess.CompletedProcess(command, 0, stdout="7 passed\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    config_store.set_many(
        {
            "idp_team_automation_repo_dir": str(repo_dir),
            "idp_team_automation_python_executable": "python-test",
            "idp_team_automation_idp_token": "idp-secret-token",
            "idp_team_automation_sub2api_password": "sub2api-secret-password",
        }
    )
    logs: list[str] = []

    result = IdpTeamAutomationPreflightRunner().run(
        {"run_tests": True},
        task_id="task_safe",
        log_fn=logs.append,
        cancel_check=lambda: False,
    )

    assert calls == [["python-test", "-m", "pytest", "-q"]]
    assert result["ok"] is True
    assert result["tests"]["ok"] is True
    assert result["entrypoints"]["batch"] is True
    assert "idp-secret-token" not in str(result)
    assert "sub2api-secret-password" not in str(result)
    assert any("预检完成" in item for item in logs)


def test_authorized_import_endpoint_persists_tokens_and_marks_account_managed(client):
    callback_url = (
        "http://localhost:1455/auth/callback#"
        "access_token=at_new&refresh_token=rt_new&id_token=id_new&"
        "account_id=acct_new&email=ita@test.com&expired=2026-06-06T03:47:30.000Z"
    )

    response = client.post(
        "/api/idp-team-automation/authorized-import",
        json={
            "email": "ita@test.com",
            "password": "TestPass123!",
            "payload_text": callback_url,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["created"] is True
    assert "at_new" not in str(body)
    assert "rt_new" not in str(body)

    detail = client.get(f"/api/accounts/{body['account_id']}").json()
    credentials = {
        item["key"]: item["value"]
        for item in detail["credentials"]
        if item["key"] in {"access_token", "refresh_token", "id_token", "account_id"}
    }
    assert credentials == {
        "access_token": "at_new",
        "refresh_token": "rt_new",
        "id_token": "id_new",
        "account_id": "acct_new",
    }
    assert detail["user_id"] == "acct_new"
    assert detail["overview"]["idp_team_automation"]["managed"] is True
    assert detail["overview"]["idp_team_automation"]["managed_source"] == "authorized_import"


def test_authorized_import_endpoint_accepts_token_json_payload(client):
    payload_text = json.dumps(
        {
            "access_token": "json_access",
            "refresh_token": "json_refresh",
            "id_token": "json_id",
            "account_id": "acct_json",
            "email": "json@test.com",
            "expired": "2026-06-07T00:00:00Z",
        }
    )

    response = client.post(
        "/api/idp-team-automation/authorized-import",
        json={
            "email": "json@test.com",
            "password": "",
            "payload_text": payload_text,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["email"] == "json@test.com"

    detail = client.get(f"/api/accounts/{body['account_id']}").json()
    credentials = {
        item["key"]: item["value"]
        for item in detail["credentials"]
        if item["key"] in {"access_token", "refresh_token", "id_token", "account_id"}
    }
    assert credentials["refresh_token"] == "json_refresh"
    assert detail["overview"]["idp_team_automation"]["last_payload_source"] == "token_json"


def test_create_idp_team_automation_sync_task_keeps_secrets_out_of_payload(client):
    repository = AccountsRepository()
    account = repository.create(
        AccountCreateCommand(
            platform="chatgpt",
            email="sync-task@test.com",
            password="TestPass123!",
            user_id="acct_sync_task",
            primary_token="access_sync_task",
            credentials={
                "access_token": "access_sync_task",
                "refresh_token": "refresh_sync_task",
                "id_token": "id_sync_task",
                "account_id": "acct_sync_task",
                "client_id": "client_sync_task",
            },
            overview={
                "idp_team_automation": {
                    "managed": True,
                    "managed_source": "authorized_import",
                }
            },
        )
    )
    config_store.set_many(
        {
            "idp_team_automation_sub2api_url": "https://sub2api.example.com",
            "idp_team_automation_sub2api_email": "admin@example.com",
            "idp_team_automation_sub2api_password": "sub2api-secret-password",
        }
    )

    response = client.post(
        "/api/tasks/idp-team-automation/sync",
        json={
            "account_ids": [account.id],
            "export_sub2api": True,
            "export_any2api": True,
            "push_sub2api": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "idp_team_automation_sync"
    assert body["platform"] == "chatgpt"
    assert body["progress_detail"]["total"] == 1

    with Session(engine) as session:
        task = session.get(TaskModel, body["id"])
        assert task is not None
        payload = task.get_payload()

    assert payload == {
        "account_ids": [account.id],
        "export_sub2api": True,
        "export_any2api": True,
        "push_sub2api": True,
    }
    assert "sub2api-secret-password" not in str(payload)


def test_sync_runner_generates_artifacts_and_updates_managed_accounts(monkeypatch, tmp_path):
    from application.idp_team_automation import IdpTeamAutomationSyncRunner

    repository = AccountsRepository()
    account = repository.create(
        AccountCreateCommand(
            platform="chatgpt",
            email="sync-runner@test.com",
            password="TestPass123!",
            user_id="acct_sync_runner",
            primary_token="access_sync_runner",
            credentials={
                "access_token": "access_sync_runner",
                "refresh_token": "refresh_sync_runner",
                "id_token": "id_sync_runner",
                "account_id": "acct_sync_runner",
                "client_id": "client_sync_runner",
            },
            overview={
                "idp_team_automation": {
                    "managed": True,
                    "managed_source": "authorized_import",
                    "imported_at": "2026-06-08T00:00:00Z",
                }
            },
        )
    )
    pushed: list[str] = []

    class FakeSub2ApiExportProvider:
        def __init__(self, config):
            self.config = config

        def push(self, record):
            pushed.append(record.email)
            return {
                "status": "success",
                "provider": "sub2api",
                "email": record.email,
                "account_id": record.account_id,
                "remote_id": 99,
                "remote_action": "created",
            }

    monkeypatch.setattr(
        "application.idp_team_automation.Sub2ApiExportProvider",
        FakeSub2ApiExportProvider,
    )
    config_store.set_many(
        {
            "idp_team_automation_artifact_root": str(tmp_path),
            "idp_team_automation_sub2api_url": "https://sub2api.example.com",
            "idp_team_automation_sub2api_email": "admin@example.com",
            "idp_team_automation_sub2api_password": "sub2api-secret-password",
            "idp_team_automation_sub2api_group": "1,2",
            "idp_team_automation_sub2api_model_whitelist": "gpt-5.4,gpt-5.5",
            "idp_team_automation_sub2api_concurrency": "10",
        }
    )
    logs: list[str] = []

    result = IdpTeamAutomationSyncRunner().run(
        {
            "account_ids": [account.id],
            "export_sub2api": True,
            "export_any2api": True,
            "push_sub2api": True,
        },
        task_id="task_sync",
        log_fn=logs.append,
        cancel_check=lambda: False,
    )

    assert result["ok"] is True
    assert result["selected_count"] == 1
    assert result["eligible_count"] == 1
    assert pushed == ["sync-runner@test.com"]
    assert len(result["artifacts"]) == 2
    for artifact in result["artifacts"]:
        assert Path(artifact["path"]).is_file()
    updated = repository.get(account.id)
    assert updated is not None
    assert updated.overview["idp_team_automation"]["last_synced_at"]
    assert updated.overview["idp_team_automation"]["sub2api_remote_id"] == "99"
    assert "access_sync_runner" not in str(result)
    assert "refresh_sync_runner" not in str(result)
    assert any("同步完成" in item for item in logs)


def test_sub2api_provider_push_uses_update_when_remote_id_exists(monkeypatch):
    from application.idp_team_automation import OAuthExportRecord, Sub2ApiConfig, Sub2ApiExportProvider

    provider = Sub2ApiExportProvider(
        Sub2ApiConfig(
            url="https://sub2api.example.com",
            email="admin@example.com",
            password="sub2api-secret",
        )
    )
    calls: list[tuple[str, str, dict]] = []

    def fake_login(_api_base):
        return "token-123"

    def fake_request_json(method, url, *, headers=None, json_body=None, timeout=15):
        calls.append((method, url, dict(json_body or {})))
        return {"id": 42}

    monkeypatch.setattr(provider, "_login", fake_login)
    monkeypatch.setattr(provider, "_request_json", fake_request_json)

    result = provider.push(
        OAuthExportRecord(
            account_id="acct-updated",
            email="updated@test.com",
            secret={
                "access_token": "access-updated",
                "refresh_token": "refresh-updated",
                "client_id": "client-updated",
                "account_id": "acct-updated",
            },
            metadata={"sub2api_remote_id": "42"},
        )
    )

    assert calls[0][0] == "PUT"
    assert calls[0][1].endswith("/api/v1/admin/accounts/42")
    assert result["status"] == "success"
    assert result["remote_id"] == 42
    assert result["remote_action"] == "updated"


def test_sync_runner_collects_failed_push_results_without_aborting_batch(monkeypatch, tmp_path):
    from application.idp_team_automation import IdpTeamAutomationSyncRunner

    repository = AccountsRepository()
    first = repository.create(
        AccountCreateCommand(
            platform="chatgpt",
            email="push-ok@test.com",
            password="TestPass123!",
            user_id="acct_push_ok",
            primary_token="access_push_ok",
            credentials={
                "access_token": "access_push_ok",
                "refresh_token": "refresh_push_ok",
                "account_id": "acct_push_ok",
            },
            overview={
                "idp_team_automation": {
                    "managed": True,
                    "managed_source": "authorized_import",
                    "sub2api_remote_id": "101",
                }
            },
        )
    )
    second = repository.create(
        AccountCreateCommand(
            platform="chatgpt",
            email="push-failed@test.com",
            password="TestPass123!",
            user_id="acct_push_failed",
            primary_token="access_push_failed",
            credentials={
                "access_token": "access_push_failed",
                "refresh_token": "refresh_push_failed",
                "account_id": "acct_push_failed",
            },
            overview={
                "idp_team_automation": {
                    "managed": True,
                    "managed_source": "authorized_import",
                }
            },
        )
    )

    class FakeSub2ApiExportProvider:
        def __init__(self, config):
            self.config = config

        def push(self, record):
            if record.email == "push-failed@test.com":
                raise ValueError("duplicate email on remote")
            return {
                "status": "success",
                "provider": "sub2api",
                "email": record.email,
                "account_id": record.account_id,
                "remote_id": 101,
                "remote_action": "updated",
            }

    monkeypatch.setattr(
        "application.idp_team_automation.Sub2ApiExportProvider",
        FakeSub2ApiExportProvider,
    )
    config_store.set_many(
        {
            "idp_team_automation_artifact_root": str(tmp_path),
            "idp_team_automation_sub2api_url": "https://sub2api.example.com",
            "idp_team_automation_sub2api_email": "admin@example.com",
            "idp_team_automation_sub2api_password": "sub2api-secret-password",
        }
    )

    result = IdpTeamAutomationSyncRunner().run(
        {
            "account_ids": [first.id, second.id],
            "export_sub2api": False,
            "export_any2api": False,
            "push_sub2api": True,
        },
        task_id="task_sync_failed_push",
        log_fn=lambda message: None,
        cancel_check=lambda: False,
    )

    assert result["ok"] is False
    assert result["error"] == "1 条 Sub2API 推送失败"
    assert len(result["pushes"]) == 2
    assert result["pushes"][0]["remote_action"] == "updated"
    assert result["pushes"][1]["status"] == "failed"
    assert result["pushes"][1]["remote_action"] == "failed"
    assert "duplicate email on remote" in result["pushes"][1]["error"]

    first_updated = repository.get(first.id)
    second_updated = repository.get(second.id)
    assert first_updated is not None
    assert second_updated is not None
    assert first_updated.overview["idp_team_automation"]["sub2api_last_status"] == "success"
    assert second_updated.overview["idp_team_automation"]["sub2api_last_status"] == "failed"
    assert "duplicate email on remote" in second_updated.overview["idp_team_automation"]["last_sync_error"]


def test_sync_history_endpoint_lists_latest_sync_results(client):
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        task = TaskModel(
            id="task_history_1",
            type="idp_team_automation_sync",
            platform="chatgpt",
            status="succeeded",
            progress_current=1,
            progress_total=1,
            success_count=1,
            created_at=now - timedelta(minutes=2),
            started_at=now - timedelta(minutes=2),
            finished_at=now - timedelta(minutes=1),
            updated_at=now - timedelta(minutes=1),
        )
        task.set_payload(
            {
                "account_ids": [1],
                "export_sub2api": True,
                "export_any2api": False,
                "push_sub2api": True,
                "trigger_source": "scheduled",
            }
        )
        task.set_result(
            {
                "data": {
                    "ok": True,
                    "task_id": "task_history_1",
                    "selected_count": 1,
                    "eligible_count": 1,
                    "artifact_root": "/tmp/idp/task_history_1",
                    "artifacts": [
                        {
                            "kind": "sub2api_export",
                            "filename": "accounts.json",
                            "path": "/tmp/idp/task_history_1/accounts.json",
                            "media_type": "application/json",
                        }
                    ],
                    "pushes": [
                        {
                            "status": "success",
                            "email": "history@test.com",
                            "account_id": "acct_history",
                            "remote_id": 8,
                            "remote_action": "created",
                        }
                    ],
                    "warnings": [],
                }
            }
        )
        session.add(task)
        session.commit()

    response = client.get("/api/idp-team-automation/history", params={"limit": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["task_id"] == "task_history_1"
    assert body["items"][0]["trigger_source"] == "scheduled"
    assert body["items"][0]["artifacts"][0]["filename"] == "accounts.json"
    assert body["items"][0]["pushes"][0]["remote_action"] == "created"


def test_policy_endpoint_round_trip(client):
    response = client.put(
        "/api/idp-team-automation/policy",
        json={
            "enabled": True,
            "interval_minutes": 30,
            "export_sub2api": True,
            "export_any2api": False,
            "push_sub2api": True,
            "scope": "all_managed",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["interval_minutes"] == 30
    assert body["push_sub2api"] is True
    assert body["scope"] == "all_managed"
    assert body["next_run_at"]

    get_response = client.get("/api/idp-team-automation/policy")
    assert get_response.status_code == 200
    current = get_response.json()
    assert current["enabled"] is True
    assert current["interval_minutes"] == 30
    assert current["next_run_at"]


def test_scheduler_helper_creates_scheduled_sync_task_when_due():
    from application.idp_team_automation import maybe_trigger_scheduled_sync

    config_store.set_many(
        {
            "idp_team_automation_schedule_enabled": "true",
            "idp_team_automation_schedule_interval_minutes": "15",
            "idp_team_automation_schedule_export_sub2api": "true",
            "idp_team_automation_schedule_export_any2api": "false",
            "idp_team_automation_schedule_push_sub2api": "true",
            "idp_team_automation_schedule_scope": "all_managed",
            "idp_team_automation_schedule_anchor_at": "2026-06-08T00:00:00Z",
            "idp_team_automation_schedule_last_triggered_at": "2026-06-08T00:00:00Z",
        }
    )

    result = maybe_trigger_scheduled_sync(now=datetime(2026, 6, 8, 0, 20, tzinfo=timezone.utc))

    assert result["triggered"] is True
    assert result["task_id"].startswith("task_")

    with Session(engine) as session:
        task = session.get(TaskModel, result["task_id"])
        assert task is not None
        payload = task.get_payload()

    assert payload["trigger_source"] == "scheduled"
    assert payload["push_sub2api"] is True


def test_artifact_download_endpoint_returns_saved_sync_artifact(client, tmp_path):
    artifact_dir = tmp_path / "task_sync"
    artifact_dir.mkdir(parents=True)
    artifact_path = artifact_dir / "accounts.json"
    artifact_path.write_text('{"ok": true}\n', encoding="utf-8")
    config_store.set_many({"idp_team_automation_artifact_root": str(tmp_path)})

    response = client.get(
        "/api/idp-team-automation/artifacts/task_sync",
        params={"filename": "accounts.json"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["content-type"].startswith("application/json")
    assert "attachment;" in response.headers["content-disposition"]
    assert "accounts.json" in response.headers["content-disposition"]


def test_artifact_download_endpoint_rejects_path_traversal(client, tmp_path):
    artifact_dir = tmp_path / "task_sync"
    artifact_dir.mkdir(parents=True)
    (tmp_path / "outside.json").write_text('{"secret": true}\n', encoding="utf-8")
    config_store.set_many({"idp_team_automation_artifact_root": str(tmp_path)})

    response = client.get(
        "/api/idp-team-automation/artifacts/task_sync",
        params={"filename": "../outside.json"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid artifact filename"


def test_artifact_download_endpoint_returns_404_for_missing_artifact(client, tmp_path):
    (tmp_path / "task_sync").mkdir(parents=True)
    config_store.set_many({"idp_team_automation_artifact_root": str(tmp_path)})

    response = client.get(
        "/api/idp-team-automation/artifacts/task_sync",
        params={"filename": "missing.json"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "artifact not found"
