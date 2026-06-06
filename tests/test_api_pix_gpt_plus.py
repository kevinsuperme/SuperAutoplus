from __future__ import annotations

from sqlmodel import Session

from application.pix_gpt_plus import PixGptPlusService
from core.account_graph import patch_account_graph
from core.db import AccountModel, engine


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
