from __future__ import annotations

import json

from sqlmodel import Session

from core.db import ProviderSettingModel, engine


class FakeResponse:
    def __init__(self, payload, *, status_code: int = 200):
        self.payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload, ensure_ascii=False)

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.headers = {}
        self.proxies = {}
        self.verify = True
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append({"method": "GET", "url": url, "kwargs": kwargs, "headers": dict(self.headers)})
        if not self.responses:
            raise AssertionError(f"unexpected request: {url}")
        return self.responses.pop(0)


def _seed_luckmail_setting(*, api_key: str = "fake-api-key", base_url: str = "https://mails.example.test"):
    with Session(engine) as session:
        item = ProviderSettingModel(
            provider_type="mailbox",
            provider_key="luckmail_api",
            display_name="LuckMail",
            auth_mode="apikey",
            enabled=True,
            is_default=True,
        )
        item.set_config(
            {
                "luckmail_base_url": base_url,
                "luckmail_project_code": "openai",
                "luckmail_email_type": "ms_graph",
            }
        )
        item.set_auth({"luckmail_api_key": api_key})
        session.add(item)
        session.commit()


def test_luckmail_client_code_success_uses_configured_api_key(monkeypatch):
    from application.luckmail_client import LuckMailClientCodeService

    _seed_luckmail_setting()
    fake_session = FakeSession(
        [
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "order_no": "tok_894d7778268489752c2c077e7ac6a603",
                        "status": "success",
                        "verification_code": "123456",
                    },
                }
            )
        ]
    )
    monkeypatch.setattr("requests.Session", lambda: fake_session)

    result = LuckMailClientCodeService().get_code(
        {"ticket": "jadelee7905@outlook.com----tok_894d7778268489752c2c077e7ac6a603"}
    )

    assert result == {
        "ok": True,
        "status": "success",
        "message": "验证码已获取",
        "email": "jadelee7905@outlook.com",
        "code": "123456",
    }
    assert fake_session.calls[0]["url"] == (
        "https://mails.example.test/api/v1/openapi/order/"
        "tok_894d7778268489752c2c077e7ac6a603/code"
    )
    assert fake_session.calls[0]["headers"]["X-API-Key"] == "fake-api-key"


def test_luckmail_client_code_success_accepts_token_only_and_uses_remote_email(monkeypatch):
    from application.luckmail_client import LuckMailClientCodeService

    _seed_luckmail_setting()
    fake_session = FakeSession(
        [
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "order_no": "tok_894d7778268489752c2c077e7ac6a603",
                        "email_address": "jadelee7905@outlook.com",
                        "status": "success",
                        "verification_code": "123456",
                    },
                }
            )
        ]
    )
    monkeypatch.setattr("requests.Session", lambda: fake_session)

    result = LuckMailClientCodeService().get_code({"ticket": "tok_894d7778268489752c2c077e7ac6a603"})

    assert result == {
        "ok": True,
        "status": "success",
        "message": "验证码已获取",
        "email": "jadelee7905@outlook.com",
        "code": "123456",
    }
    assert fake_session.calls[0]["url"] == (
        "https://mails.example.test/api/v1/openapi/order/"
        "tok_894d7778268489752c2c077e7ac6a603/code"
    )


def test_luckmail_client_code_rejects_invalid_ticket_format():
    from application.luckmail_client import LuckMailClientCodeService

    result = LuckMailClientCodeService().get_code({"ticket": "jadelee7905@outlook.com tok_abc"})

    assert result == {
        "ok": False,
        "status": "invalid_ticket_format",
        "message": "请输入正确的邮箱 Token 文本",
    }


def test_luckmail_client_code_rejects_invalid_email():
    from application.luckmail_client import LuckMailClientCodeService

    result = LuckMailClientCodeService().get_code({"ticket": "not-email----tok_abc"})

    assert result == {
        "ok": False,
        "status": "invalid_email",
        "message": "邮箱格式无效",
    }


def test_luckmail_client_code_rejects_empty_token():
    from application.luckmail_client import LuckMailClientCodeService

    result = LuckMailClientCodeService().get_code({"ticket": "user@example.com----   "})

    assert result == {
        "ok": False,
        "status": "missing_token",
        "message": "Token 不能为空",
        "email": "user@example.com",
    }


def test_luckmail_client_code_reports_missing_configuration():
    from application.luckmail_client import LuckMailClientCodeService

    result = LuckMailClientCodeService().get_code({"ticket": "user@example.com----tok_abc"})

    assert result == {
        "ok": False,
        "status": "luckmail_not_configured",
        "message": "服务端未配置 LuckMail API Key",
        "email": "user@example.com",
    }


def test_luckmail_client_code_reports_not_ready(monkeypatch):
    from application.luckmail_client import LuckMailClientCodeService

    _seed_luckmail_setting()
    monkeypatch.setattr(
        "requests.Session",
        lambda: FakeSession([FakeResponse({"code": 0, "data": {"status": "pending"}})]),
    )

    result = LuckMailClientCodeService().get_code({"ticket": "user@example.com----tok_pending"})

    assert result == {
        "ok": False,
        "status": "code_not_ready",
        "message": "验证码暂未到达，请稍后重试",
        "email": "user@example.com",
    }


def test_luckmail_client_code_sanitizes_remote_error(monkeypatch):
    from application.luckmail_client import LuckMailClientCodeService

    _seed_luckmail_setting()

    def boom():
        raise RuntimeError("token tok_secret rejected by remote")

    fake_session = FakeSession([])
    fake_session.get = lambda *args, **kwargs: boom()
    monkeypatch.setattr("requests.Session", lambda: fake_session)

    result = LuckMailClientCodeService().get_code({"ticket": "user@example.com----tok_secret"})

    assert result == {
        "ok": False,
        "status": "remote_error",
        "message": "LuckMail 查询失败，请稍后重试",
        "email": "user@example.com",
    }
    assert "tok_secret" not in str(result)


def test_luckmail_client_code_endpoint_uses_service(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.luckmail_client import router
    from application.luckmail_client import LuckMailClientCodeService

    captured: dict[str, object] = {}

    def fake_get_code(self, payload: dict) -> dict:  # noqa: ANN001
        captured["payload"] = payload
        return {
            "ok": True,
            "status": "success",
            "message": "验证码已获取",
            "email": "user@example.com",
            "code": "123456",
        }

    monkeypatch.setattr(LuckMailClientCodeService, "get_code", fake_get_code)

    app = FastAPI()
    app.include_router(router, prefix="/api")
    local_client = TestClient(app)

    response = local_client.post(
        "/api/luckmail/client/code",
        json={"ticket": "user@example.com----tok_abc"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == "123456"
    assert captured["payload"] == {"ticket": "user@example.com----tok_abc"}


def test_luckmail_client_code_endpoint_is_public(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.luckmail_client import router
    from application.luckmail_client import LuckMailClientCodeService
    from core.auth import AuthMiddleware

    monkeypatch.setenv("APP_PASSWORD", "admin-password")

    def fake_get_code(self, payload: dict) -> dict:  # noqa: ANN001
        return {
            "ok": True,
            "status": "success",
            "message": "验证码已获取",
            "email": "user@example.com",
            "code": "123456",
        }

    monkeypatch.setattr(LuckMailClientCodeService, "get_code", fake_get_code)

    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix="/api")
    local_client = TestClient(app)

    response = local_client.post(
        "/api/luckmail/client/code",
        json={"ticket": "user@example.com----tok_abc"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
