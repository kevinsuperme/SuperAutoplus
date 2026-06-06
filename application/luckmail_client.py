from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from core.base_mailbox import MailboxAccount
from core.luckmail_mailbox import LuckMailMailbox
from infrastructure.provider_settings_repository import ProviderSettingsRepository


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TICKET_SEPARATOR = "----"


@dataclass(frozen=True)
class LuckMailClientTicket:
    email: str
    token: str
    token_only: bool = False


def _text(value: Any) -> str:
    return str(value or "").strip()


def _client_response(
    *,
    ok: bool,
    status: str,
    message: str,
    email: str = "",
    code: str = "",
) -> dict[str, Any]:
    result: dict[str, Any] = {"ok": ok, "status": status, "message": message}
    if email:
        result["email"] = email
    if code:
        result["code"] = code
    return result


def parse_luckmail_ticket(value: str) -> tuple[LuckMailClientTicket | None, dict[str, Any] | None]:
    raw = _text(value)
    if not raw:
        return None, _client_response(
            ok=False,
            status="missing_ticket",
            message="请输入邮箱 Token 文本",
        )
    if TICKET_SEPARATOR not in raw:
        if "@" in raw or any(char.isspace() for char in raw):
            return None, _client_response(
                ok=False,
                status="invalid_ticket_format",
                message="请输入正确的邮箱 Token 文本",
            )
        return LuckMailClientTicket(email="", token=raw, token_only=True), None

    email, token = raw.split(TICKET_SEPARATOR, 1)
    email = email.strip()
    token = token.strip()
    if not EMAIL_RE.match(email):
        return None, _client_response(
            ok=False,
            status="invalid_email",
            message="邮箱格式无效",
        )
    if not token:
        return None, _client_response(
            ok=False,
            status="missing_token",
            message="Token 不能为空",
            email=email,
        )
    return LuckMailClientTicket(email=email, token=token), None


def _payload_email(payload: dict[str, Any]) -> str:
    return _text(payload.get("email_address") or payload.get("email") or payload.get("address"))


class LuckMailClientCodeService:
    def __init__(self, repository: ProviderSettingsRepository | None = None):
        self.repository = repository or ProviderSettingsRepository()

    def get_code(self, payload: dict[str, Any]) -> dict[str, Any]:
        ticket, error = parse_luckmail_ticket(_text(payload.get("ticket")))
        if error is not None:
            return error
        assert ticket is not None

        settings = self.repository.resolve_runtime_settings("mailbox", "luckmail_api", {})
        if not _text(settings.get("luckmail_api_key")):
            return _client_response(
                ok=False,
                status="luckmail_not_configured",
                message="服务端未配置 LuckMail API Key",
                email=ticket.email,
            )

        try:
            mailbox = LuckMailMailbox.from_config(settings)
            account = MailboxAccount(email=ticket.email, account_id=ticket.token)
            if ticket.token_only:
                code_payload = mailbox.get_code_payload_now(ticket.token)
                email = _payload_email(code_payload)
                code = mailbox._extract_code(code_payload)
            else:
                email = ticket.email
                code = mailbox.get_code_now(account)
        except Exception:  # noqa: BLE001 - keep public client response sanitized
            return _client_response(
                ok=False,
                status="remote_error",
                message="LuckMail 查询失败，请稍后重试",
                email=ticket.email,
            )

        if not code:
            return _client_response(
                ok=False,
                status="code_not_ready",
                message="验证码暂未到达，请稍后重试",
                email=email,
            )

        return _client_response(
            ok=True,
            status="success",
            message="验证码已获取",
            email=email,
            code=code,
        )
