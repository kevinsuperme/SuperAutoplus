from __future__ import annotations

import threading
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.base_sms import PingMeProvider, create_sms_provider
from core.pingme_sms import clear_pingme_messages, record_pingme_message


@pytest.fixture(autouse=True)
def _clear_pingme_store(monkeypatch):
    clear_pingme_messages()
    monkeypatch.delenv("PINGME_CALLBACK_TOKEN", raising=False)
    monkeypatch.delenv("APP_PASSWORD", raising=False)
    yield
    clear_pingme_messages()


def test_pingme_provider_locks_number_and_waits_for_callback_code(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "retcode": 0,
                "retmsg": "success",
                "result": {"number": "16510000000", "price": 0.5},
            }

    def fake_post(url, json, headers, timeout, proxies=None):
        calls.append((url, json, headers, timeout, proxies))
        return FakeResponse()

    monkeypatch.setattr("core.base_sms.requests.post", fake_post)
    provider = PingMeProvider(
        app_key="app-key",
        user_id="user-1",
        default_app="chatgpt",
        default_country="US",
        base_url="https://api.pingmeapp.net",
    )

    activation = provider.get_number(service="ignored", country="")

    assert activation.activation_id == "pingme:chatgpt:16510000000"
    assert activation.phone_number == "+16510000000"
    assert calls == [
        (
            "https://api.pingmeapp.net/thirdparty/lockNumber",
            {
                "userId": "user-1",
                "app": "chatgpt",
                "number": "",
                "countryCode": "US",
            },
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "x-app-key": "app-key",
            },
            20,
            None,
        )
    ]

    def deliver():
        time.sleep(0.05)
        record_pingme_message(
            {
                "userId": "user-1",
                "app": "chatgpt",
                "from": "14160000000",
                "to": "16510000000",
                "text": "[OpenAI] code is 5611",
                "time": "2026-06-06T03:17:06.050Z",
            }
        )

    thread = threading.Thread(target=deliver)
    thread.start()
    try:
        assert provider.get_code(activation.activation_id, timeout=2) == "5611"
    finally:
        thread.join(timeout=2)


def test_pingme_provider_raises_clear_error_for_failed_lock(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"retcode": 300002, "retmsg": "no balance", "result": {}}

    monkeypatch.setattr("core.base_sms.requests.post", lambda *args, **kwargs: FakeResponse())
    provider = PingMeProvider(app_key="app-key", user_id="user-1", default_app="jd")

    with pytest.raises(RuntimeError, match="余额不足|300002"):
        provider.get_number(service="chatgpt")


def test_create_sms_provider_supports_pingme():
    provider = create_sms_provider(
        "pingme_api",
        {
            "pingme_app_key": "app-key",
            "pingme_user_id": "user-1",
            "pingme_default_app": "chatgpt",
            "pingme_default_country": "GB",
        },
    )

    assert isinstance(provider, PingMeProvider)
    assert provider.app_key == "app-key"
    assert provider.user_id == "user-1"
    assert provider.default_app == "chatgpt"
    assert provider.default_country == "GB"


def test_pingme_callback_endpoint_is_public_and_enforces_optional_token(monkeypatch):
    from api.sms import router as sms_router
    from core.auth import AuthMiddleware

    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(sms_router, prefix="/api")
    client = TestClient(app, raise_server_exceptions=False)

    monkeypatch.setenv("APP_PASSWORD", "web-password")
    monkeypatch.setenv("PINGME_CALLBACK_TOKEN", "callback-secret")

    protected = client.get("/api/config")
    assert protected.status_code == 401

    rejected = client.post(
        "/api/sms/pingme/callback?token=wrong",
        json={
            "userId": "user-1",
            "app": "chatgpt",
            "from": "14160000000",
            "to": "16510000000",
            "text": "[OpenAI] code is 778899",
            "time": "2026-06-06T03:17:06.050Z",
        },
    )
    assert rejected.status_code == 403

    accepted = client.post(
        "/api/sms/pingme/callback?token=callback-secret",
        json={
            "userId": "user-1",
            "app": "chatgpt",
            "from": "14160000000",
            "to": "16510000000",
            "text": "[OpenAI] code is 778899",
            "time": "2026-06-06T03:17:06.050Z",
        },
    )

    assert accepted.status_code == 200
    assert accepted.json()["ok"] is True

    provider = PingMeProvider(app_key="app-key", user_id="user-1", default_app="chatgpt")
    provider._activations["pingme:chatgpt:16510000000"] = {
        "app": "chatgpt",
        "number": "+16510000000",
        "acquired_at": time.time() - 1,
    }
    assert provider.get_code("pingme:chatgpt:16510000000", timeout=1) == "778899"


def test_pingme_provider_definition_is_seeded():
    from core.db import init_db
    from infrastructure.provider_definitions_repository import ProviderDefinitionsRepository

    init_db()
    definition = ProviderDefinitionsRepository().get_by_key("sms", "pingme_api")

    assert definition is not None
    assert definition.label == "PingMe"
    assert definition.driver_type == "pingme_api"
    fields = {field["key"]: field for field in definition.get_fields()}
    assert fields["pingme_app_key"]["secret"] is True
    assert fields["pingme_base_url"]["default_value"] == "https://api.pingmeapp.net"
    assert fields["pingme_default_country"]["default_value"] == "US"
