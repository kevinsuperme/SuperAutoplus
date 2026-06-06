"""LuckMail mailbox provider tests."""
from __future__ import annotations

import json

from core.base_mailbox import create_mailbox
from core.luckmail_mailbox import LuckMailMailbox
from api.provider_settings import _test_mailbox
from infrastructure.provider_definitions_repository import ProviderDefinitionsRepository


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

    def post(self, url, **kwargs):
        self.calls.append({"method": "POST", "url": url, "kwargs": kwargs, "headers": dict(self.headers)})
        if not self.responses:
            raise AssertionError(f"unexpected request: {url}")
        return self.responses.pop(0)

    def get(self, url, **kwargs):
        self.calls.append({"method": "GET", "url": url, "kwargs": kwargs, "headers": dict(self.headers)})
        if not self.responses:
            raise AssertionError(f"unexpected request: {url}")
        return self.responses.pop(0)


def test_luckmail_provider_definition_and_factory_are_wired():
    ProviderDefinitionsRepository().ensure_seeded()

    definition = ProviderDefinitionsRepository().get_by_key("mailbox", "luckmail_api")
    mailbox = create_mailbox(
        "luckmail_api",
        extra={
            "luckmail_api_key": "fake-api-key",
            "luckmail_project_code": "openai",
        },
    )

    assert definition is not None
    assert definition.label == "LuckMail（自动生成）"
    assert definition.driver_type == "luckmail_api"
    fields = {field["key"]: field for field in definition.get_fields()}
    assert fields["luckmail_base_url"]["default_value"] == "https://mails.luckyous.com"
    assert fields["luckmail_email_type"]["type"] == "select"
    assert fields["luckmail_email_type"]["options"] == [
        {"value": "ms_graph", "label": "微软 Graph (ms_graph)"},
        {"value": "ms_imap", "label": "微软 IMAP (ms_imap)"},
        {"value": "microsoft", "label": "微软 (microsoft)"},
        {"value": "self_built", "label": "自建邮箱 (self_built)"},
        {"value": "google_variant", "label": "谷歌变种 (google_variant)"},
        {"value": "ms_variant", "label": "微软变种 (ms_variant)"},
    ]
    assert isinstance(mailbox, LuckMailMailbox)


def test_luckmail_creates_order_and_waits_for_code(monkeypatch):
    session = FakeSession(
        [
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "order_no": "ord_123",
                        "email_address": "user@outlook.com",
                        "project": "openai",
                    },
                }
            ),
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "order_no": "ord_123",
                        "status": "pending",
                    },
                }
            ),
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "order_no": "ord_123",
                        "status": "success",
                        "verification_code": "123456",
                        "mail_subject": "OpenAI verification code",
                    },
                }
            ),
        ]
    )
    monkeypatch.setattr("requests.Session", lambda: session)

    mailbox = LuckMailMailbox(
        base_url="https://mails.example.test",
        api_key="fake-api-key",
        project_code="openai",
        email_type="ms_graph",
        domain="outlook.com",
        poll_interval=1,
    )

    account = mailbox.get_email()
    code = mailbox.wait_for_code(account, keyword="OpenAI", timeout=2)

    assert account.email == "user@outlook.com"
    assert account.account_id == "ord_123"
    assert code == "123456"
    assert session.calls[0]["url"] == "https://mails.example.test/api/v1/openapi/order/create"
    assert session.calls[0]["headers"]["X-API-Key"] == "fake-api-key"
    assert session.calls[0]["kwargs"]["json"] == {
        "project_code": "openai",
        "email_type": "ms_graph",
        "domain": "outlook.com",
    }
    assert session.calls[1]["url"] == "https://mails.example.test/api/v1/openapi/order/ord_123/code"

    serialized_extra = json.dumps(account.extra, ensure_ascii=False)
    assert "fake-api-key" not in serialized_extra
    assert "ord_123" in serialized_extra


def test_luckmail_test_connection_does_not_create_order(monkeypatch):
    session = FakeSession(
        [
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "username": "demo",
                        "email": "demo@example.com",
                        "balance": "12.3400",
                    },
                }
            ),
        ]
    )
    monkeypatch.setattr("requests.Session", lambda: session)

    mailbox = LuckMailMailbox(
        base_url="https://mails.example.test",
        api_key="fake-api-key",
        project_code="openai",
        email_type="ms_graph",
    )

    result = mailbox.test_connection()

    assert result["ok"] is True
    assert "API Key 有效" in result["message"]
    assert "12.3400" in result["message"]
    assert session.calls == [
        {
            "method": "GET",
            "url": "https://mails.example.test/api/v1/openapi/user/info",
            "kwargs": {"timeout": 30},
            "headers": {
                "X-API-Key": "fake-api-key",
                "user-agent": "SuperAutoplus/LuckMail-mailbox",
                "accept": "application/json",
                "content-type": "application/json",
            },
        }
    ]


def test_provider_settings_luckmail_test_uses_connection_check_without_order(monkeypatch):
    ProviderDefinitionsRepository().ensure_seeded()
    definition = ProviderDefinitionsRepository().get_by_key("mailbox", "luckmail_api")
    session = FakeSession(
        [
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "username": "demo",
                        "balance": "12.3400",
                    },
                }
            ),
        ]
    )
    monkeypatch.setattr("requests.Session", lambda: session)

    result = _test_mailbox(
        "luckmail_api",
        {
            "luckmail_base_url": "https://mails.example.test",
            "luckmail_api_key": "fake-api-key",
            "luckmail_project_code": "openai",
            "luckmail_email_type": "ms_graph",
        },
        definition,
    )

    assert result["ok"] is True
    assert "API Key 有效" in result["message"]
    assert [call["method"] for call in session.calls] == ["GET"]
    assert session.calls[0]["url"] == "https://mails.example.test/api/v1/openapi/user/info"
