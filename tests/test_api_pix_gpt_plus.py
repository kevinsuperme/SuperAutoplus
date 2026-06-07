from __future__ import annotations

from sqlmodel import Session, select

from application.accounts import AccountsService
from application.pix_gpt_plus import PixGptPlusService
from core.account_graph import patch_account_graph
from core.db import AccountCredentialModel, AccountModel, engine
from domain.accounts import AccountQuery


def _seed_chatgpt_account(*, email: str = "pix@example.com", token: str = "ac_token_x") -> int:
    with Session(engine) as session:
        model = AccountModel(platform="chatgpt", email=email, password="pw")
        session.add(model)
        session.commit()
        session.refresh(model)
        if token:
            patch_account_graph(session, model, primary_token=token)
            session.commit()
        return int(model.id or 0)


def _without_stored_pix_client_codes(monkeypatch):
    monkeypatch.setattr("application.pix_gpt_plus.config_store.get", lambda key, default="": "")


def test_generate_pix_calls_nerver_with_stored_access_token(monkeypatch):
    account_id = _seed_chatgpt_account(email="alice@example.com", token="ac_alice")
    captured: dict[str, object] = {}

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        captured["endpoint_path"] = endpoint_path
        captured["body"] = body
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201PIX",
            "pix_qr_image_url": "https://files.stripe.com/pix.png",
            "pix_hosted_url": "https://pay.openai.com/c/pix",
            "pix_expires_iso": "2026-06-02T03:00:00.000Z",
            "attempts": 1,
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate(
        {
            "chatgpt_account_ids": [account_id],
            "promo_id": "promo-test",
            "api_mode": "short",
            "concurrency": 1,
        }
    )

    assert result["ok"] is True
    assert result["success_count"] == 1
    assert captured == {
        "endpoint_path": "/api/v1/pix-short",
        "body": {"token": "ac_alice", "promoId": "promo-test"},
    }
    item = result["results"][0]
    assert item["account_id"] == account_id
    assert item["email"] == "alice@example.com"
    assert item["pix_qr_data"] == "000201PIX"


def test_generate_pix_reports_missing_access_token_without_remote_call(monkeypatch):
    account_id = _seed_chatgpt_account(email="missing@example.com", token="")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        raise AssertionError("remote API should not be called without account token")

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate(
        {
            "chatgpt_account_ids": [account_id],
            "promo_id": "plus-1-month-free",
            "api_mode": "short",
            "concurrency": 1,
        }
    )

    assert result["ok"] is False
    assert result["error_count"] == 1
    item = result["results"][0]
    assert item["ok"] is False
    assert item["reason"] == "missing-token"
    assert "access_token" in item["message"]


def test_generate_pix_wraps_remote_errors(monkeypatch):
    account_id = _seed_chatgpt_account(email="bob@example.com", token="ac_bob")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        raise RuntimeError("remote timeout")

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate(
        {
            "chatgpt_account_ids": [account_id],
            "promo_id": "plus-1-month-free",
            "api_mode": "short",
            "concurrency": 1,
        }
    )

    assert result["ok"] is False
    assert result["error_count"] == 1
    item = result["results"][0]
    assert item["ok"] is False
    assert item["reason"] == "remote-error"
    assert "remote timeout" in item["message"]


def test_pix_gpt_plus_generate_endpoint_uses_service(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.pix_gpt_plus import router
    from application.pix_gpt_plus import PixGptPlusService

    captured: dict[str, object] = {}

    def fake_generate(self, payload: dict) -> dict:  # noqa: ANN001
        captured["payload"] = payload
        return {
            "ok": True,
            "mode": "short",
            "endpoint": "/api/v1/pix-short",
            "success_count": 1,
            "error_count": 0,
            "results": [{"account_id": 1, "email": "a@example.com", "ok": True}],
        }

    monkeypatch.setattr(PixGptPlusService, "generate", fake_generate)

    app = FastAPI()
    app.include_router(router, prefix="/api")
    local_client = TestClient(app)

    response = local_client.post(
        "/api/pix-gpt-plus/generate",
        json={
            "chatgpt_account_ids": [1],
            "promo_id": "plus-1-month-free",
            "api_mode": "short",
            "concurrency": 2,
        },
    )

    assert response.status_code == 200
    assert response.json()["success_count"] == 1
    assert captured["payload"]["chatgpt_account_ids"] == [1]


def test_client_open_with_access_token_calls_nerver(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")
    captured: dict[str, object] = {}

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        captured["endpoint_path"] = endpoint_path
        captured["body"] = body
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201PIX",
            "pix_qr_image_url": "https://files.example/pix.png",
            "pix_hosted_url": "https://pay.example/pix",
            "pix_expires_iso": "2026-06-06T12:00:00.000Z",
            "request_id": "req_123",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": "ac_customer_token"}
    )

    assert result["ok"] is True
    assert result["status"] == "success"
    assert result["pix_qr_data"] == "000201PIX"
    assert captured == {
        "endpoint_path": "/api/v1/pix-short",
        "body": {"token": "ac_customer_token", "promoId": "plus-1-month-free"},
    }


def test_client_open_with_session_json_extracts_access_token(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-JSON")
    captured: dict[str, object] = {}

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        captured["body"] = body
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201JSON",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {
            "ckd": "CKD-JSON",
            "credential": '{"session":{"accessToken":"ac_from_json"}}',
        }
    )

    assert result["ok"] is True
    assert result["status"] == "success"
    assert captured["body"] == {
        "token": "ac_from_json",
        "promoId": "plus-1-month-free",
    }


def test_client_open_saves_customer_token_as_chatgpt_account(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-SAVE")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201SAVED",
            "request_id": "req_saved",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {
            "ckd": "CKD-SAVE",
            "credential": (
                '{"user":{"email":"client@example.com"},'
                '"accessToken":"ac_full_customer_token"}'
            ),
        }
    )

    assert result["ok"] is True
    assert result["account_id"] > 0

    with Session(engine) as session:
        account = session.get(AccountModel, result["account_id"])
        assert account is not None
        assert account.platform == "chatgpt"
        assert account.email == "client@example.com"

        credential = session.exec(
            select(AccountCredentialModel).where(
                AccountCredentialModel.account_id == result["account_id"],
                AccountCredentialModel.key == "access_token",
            )
        ).first()
        assert credential is not None
        assert credential.value == "ac_full_customer_token"
        assert credential.is_primary is True
        assert credential.source == "pxl-plus-client"


def test_client_open_uses_submitted_email_when_raw_token_has_no_session_email(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-EMAIL")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201EMAIL",
            "request_id": "req_email",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {
            "ckd": "CKD-EMAIL",
            "credential": "ac_raw_customer_token",
            "email": "raw-token-client@example.com",
        }
    )

    assert result["ok"] is True
    assert result["email"] == "raw-token-client@example.com"

    with Session(engine) as session:
        account = session.get(AccountModel, result["account_id"])
        assert account is not None
        assert account.email == "raw-token-client@example.com"

        credential = session.exec(
            select(AccountCredentialModel).where(
                AccountCredentialModel.account_id == result["account_id"],
                AccountCredentialModel.key == "access_token",
            )
        ).first()
        assert credential is not None
        assert credential.value == "ac_raw_customer_token"


def test_client_open_updates_existing_customer_token_account(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-UP")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201UPDATED",
            "request_id": "req_updated",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)
    service = PixGptPlusService()

    first = service.generate_for_client_token(
        {
            "ckd": "CKD-UP",
            "credential": (
                '{"user":{"email":"same@example.com"},'
                '"accessToken":"ac_old_customer_token"}'
            ),
        }
    )
    second = service.generate_for_client_token(
        {
            "ckd": "CKD-UP",
            "credential": (
                '{"user":{"email":"same@example.com"},'
                '"accessToken":"ac_new_customer_token"}'
            ),
        }
    )

    assert first["account_id"] == second["account_id"]
    with Session(engine) as session:
        credentials = session.exec(
            select(AccountCredentialModel).where(
                AccountCredentialModel.account_id == second["account_id"],
                AccountCredentialModel.key == "access_token",
            )
        ).all()
        assert len(credentials) == 1
        assert credentials[0].value == "ac_new_customer_token"


def test_client_open_account_list_exposes_full_token_for_admin_pix_page(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-LIST")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201LIST",
            "request_id": "req_list",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    PixGptPlusService().generate_for_client_token(
        {
            "ckd": "CKD-LIST",
            "credential": (
                '{"user":{"email":"list@example.com"},'
                '"accessToken":"ac_full_list_token"}'
            ),
        }
    )

    listed = AccountsService().list_accounts(
        AccountQuery(platform="chatgpt", email="list@example.com", page=1, page_size=20)
    )
    item = listed["items"][0]

    assert item["primary_token"] == "ac_full_list_token"
    assert any(
        credential["key"] == "access_token"
        and credential["value"] == "ac_full_list_token"
        and credential["source"] == "pxl-plus-client"
        for credential in item["credentials"]
    )


def test_client_open_rejects_missing_ckd_configuration(monkeypatch):
    monkeypatch.delenv("PIX_CLIENT_CKD_CODES", raising=False)
    _without_stored_pix_client_codes(monkeypatch)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "ANY", "credential": "ac_customer_token"}
    )

    assert result == {
        "ok": False,
        "status": "ckd_not_configured",
        "message": "服务端未配置 CKD 授权码",
    }


def test_client_open_rejects_invalid_ckd(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "WRONG", "credential": "ac_customer_token"}
    )

    assert result == {
        "ok": False,
        "status": "invalid_ckd",
        "message": "CKD 授权码无效",
    }


def test_client_open_rejects_missing_token(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": '{"session":{}}'}
    )

    assert result == {
        "ok": False,
        "status": "missing_token",
        "message": "未能从 Access Token / Session JSON 中提取 token",
    }


def test_client_open_rejects_invalid_session_json(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": '{"session":'}
    )

    assert result == {
        "ok": False,
        "status": "invalid_credential",
        "message": "Session JSON 格式无效",
    }


def test_client_open_wraps_remote_error(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        raise RuntimeError("remote timeout")

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": "ac_customer_token"}
    )

    assert result["ok"] is False
    assert result["status"] == "remote_error"
    assert result["message"] == "Nerver PIX 接口调用失败，请稍后重试"
    assert "remote timeout" not in result["message"]


def test_client_open_redacts_remote_business_failure(monkeypatch):
    _without_stored_pix_client_codes(monkeypatch)
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        return {
            "ok": False,
            "reason": "token ac_secret_customer_token rejected",
            "message": "invalid token ac_secret_customer_token",
            "request_id": "req_leak_check",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": "ac_secret_customer_token"}
    )

    assert result["ok"] is False
    assert result["status"] == "remote_failed"
    assert result["message"] == "Nerver PIX 返回失败，请稍后重试"
    assert result["reason"] == "remote_failed"
    assert result["request_id"] == "req_leak_check"
    assert "ac_secret_customer_token" not in str(result)


def test_client_open_uses_config_store_ckd_codes_with_multiple_separators(monkeypatch):
    monkeypatch.delenv("PIX_CLIENT_CKD_CODES", raising=False)

    def fake_config_get(key: str, default: str = "") -> str:
        if key == "pix_client_ckd_codes":
            return "CKD-ONE, CKD-TWO\nCKD-THREE\tCKD-FOUR"
        return default

    monkeypatch.setattr("application.pix_gpt_plus.config_store.get", fake_config_get)
    captured: dict[str, object] = {}

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        captured["endpoint_path"] = endpoint_path
        captured["body"] = body
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201CONFIG",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-THREE", "credential": "ac_config_token"}
    )

    assert result["ok"] is True
    assert result["status"] == "success"
    assert result["pix_qr_data"] == "000201CONFIG"
    assert captured == {
        "endpoint_path": "/api/v1/pix-short",
        "body": {"token": "ac_config_token", "promoId": "plus-1-month-free"},
    }


def test_pix_client_open_endpoint_is_public_with_ckd(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.pix_gpt_plus import router
    from application.pix_gpt_plus import PixGptPlusService
    from core.auth import AuthMiddleware

    monkeypatch.setenv("APP_PASSWORD", "admin-password")
    captured: dict[str, object] = {}

    def fake_generate(self, payload: dict) -> dict:  # noqa: ANN001
        captured["payload"] = payload
        return {
            "ok": True,
            "status": "success",
            "message": "PIX 已生成",
            "pix_qr_data": "000201PUBLIC",
        }

    monkeypatch.setattr(PixGptPlusService, "generate_for_client_token", fake_generate)

    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix="/api")
    local_client = TestClient(app)

    response = local_client.post(
        "/api/pix-gpt-plus/client/open",
        json={"ckd": "CKD-OK", "credential": "ac_customer_token"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert captured["payload"] == {
        "ckd": "CKD-OK",
        "credential": "ac_customer_token",
        "email": "",
    }
