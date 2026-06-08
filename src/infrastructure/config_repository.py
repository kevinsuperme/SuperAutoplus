from __future__ import annotations

from core.config_store import config_store
from infrastructure.provider_definitions_repository import ProviderDefinitionsRepository


class ConfigRepository:
    BASE_KEYS = {
        "default_executor",
        "default_identity_provider", "default_oauth_provider", "oauth_email_hint",
        "chrome_user_data_dir", "chrome_cdp_url",
        "cpa_api_url", "cpa_api_key",
        "team_manager_url", "team_manager_key",
        "any2api_url", "any2api_password",
        "nerver_api_base_url", "nerver_api_timeout",
        "nerver_pix_short_token", "nerver_pix_business_token",
        "idp_team_automation_repo_dir",
        "idp_team_automation_python_executable",
        "idp_team_automation_artifact_root",
        "idp_team_automation_idp_base",
        "idp_team_automation_idp_token",
        "idp_team_automation_idp_client_id",
        "idp_team_automation_idp_channel_id",
        "idp_team_automation_idp_domain",
        "idp_team_automation_codex_client_id",
        "idp_team_automation_codex_redirect_uri",
        "idp_team_automation_codex_scope",
        "idp_team_automation_proxy",
        "idp_team_automation_sub2api_url",
        "idp_team_automation_sub2api_email",
        "idp_team_automation_sub2api_password",
        "idp_team_automation_sub2api_group",
        "idp_team_automation_sub2api_model_whitelist",
        "idp_team_automation_sub2api_concurrency",
        "idp_team_automation_sub2api_priority",
        "idp_team_automation_sub2api_rate_multiplier",
        "idp_team_automation_request_timeout",
        "idp_team_automation_schedule_enabled",
        "idp_team_automation_schedule_interval_minutes",
        "idp_team_automation_schedule_export_sub2api",
        "idp_team_automation_schedule_export_any2api",
        "idp_team_automation_schedule_push_sub2api",
        "idp_team_automation_schedule_scope",
        "idp_team_automation_schedule_anchor_at",
        "idp_team_automation_schedule_last_triggered_at",
    }

    def __init__(self, definitions: ProviderDefinitionsRepository | None = None):
        self.definitions = definitions or ProviderDefinitionsRepository()

    def get_allowed_keys(self) -> set[str]:
        keys = set(self.BASE_KEYS)
        for provider_type in ("mailbox", "captcha", "sms"):
            for definition in self.definitions.list_by_type(provider_type, enabled_only=False):
                for field in definition.get_fields():
                    field_key = str(field.get("key") or "").strip()
                    if field_key:
                        keys.add(field_key)
        return keys

    def get_flat(self) -> dict[str, str]:
        data = config_store.get_all()
        allowed = self.get_allowed_keys()
        return {
            key: str(value or "")
            for key, value in data.items()
            if key in allowed
        }

    def update_flat(self, data: dict[str, str]) -> list[str]:
        allowed = self.get_allowed_keys()
        safe = {key: value for key, value in data.items() if key in allowed}
        config_store.set_many(safe)
        return list(safe.keys())
