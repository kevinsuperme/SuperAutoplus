"""PingMe SMS provider registration."""
from core.base_sms import PingMeProvider  # noqa: F401
from providers.registry import register_provider

register_provider("sms", "pingme_api")(PingMeProvider)
