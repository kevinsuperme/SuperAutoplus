"""Aitre mailbox provider wiring tests."""
from __future__ import annotations

from api.provider_settings import _test_mailbox
from core.base_mailbox import AitreMailbox, create_mailbox
from infrastructure.provider_definitions_repository import ProviderDefinitionsRepository


def test_aitre_provider_definition_and_factory_are_wired():
    ProviderDefinitionsRepository().ensure_seeded()

    definition = ProviderDefinitionsRepository().get_by_key("mailbox", "aitre_api")
    mailbox = create_mailbox(
        "aitre_api",
        extra={
            "aitre_email": "demo@example.com",
            "aitre_api_url": "https://mail.example.test/api/tempmail",
        },
    )

    assert definition is not None
    assert definition.driver_type == "aitre_api"
    assert isinstance(mailbox, AitreMailbox)
    assert mailbox.get_email().email == "demo@example.com"


def test_provider_settings_aitre_test_no_longer_reports_missing_driver():
    ProviderDefinitionsRepository().ensure_seeded()
    definition = ProviderDefinitionsRepository().get_by_key("mailbox", "aitre_api")

    result = _test_mailbox(
        "aitre_api",
        {
            "aitre_email": "demo@example.com",
            "aitre_api_url": "https://mail.example.test/api/tempmail",
        },
        definition,
    )

    assert result["ok"] is True
    assert result["email"] == "demo@example.com"
