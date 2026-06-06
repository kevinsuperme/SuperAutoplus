"""LuckMail API mailbox provider."""
from __future__ import annotations

import html
import re
import time
from typing import Any
from urllib.parse import quote, urlparse

import requests

from core.base_mailbox import BaseMailbox, MailboxAccount, _extract_verification_link
from core.tls import mark_session_insecure, suppress_insecure_request_warning


DEFAULT_BASE_URL = "https://mails.luckyous.com"
DEFAULT_CODE_PATTERN = r"(?<!#)(?<!\d)(\d{6})(?!\d)"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_base_url(value: str | None) -> str:
    raw = _text(value) or DEFAULT_BASE_URL
    if "://" not in raw:
        raw = f"https://{raw.lstrip('/')}"
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"LuckMail 服务地址无效: {value!r}")
    return raw.rstrip("/")


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return min(max(number, minimum), maximum)


def _strip_markup(text: str) -> str:
    cleaned = html.unescape(str(text or ""))
    cleaned = re.sub(r"<style[^>]*>.*?</style>", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<script[^>]*>.*?</script>", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


class LuckMailMailbox(BaseMailbox):
    """Create LuckMail orders and poll them for verification codes."""

    def __init__(
        self,
        *,
        base_url: str = "",
        api_key: str,
        project_code: str = "openai",
        email_type: str = "ms_graph",
        domain: str = "",
        specified_email: str = "",
        variant_mode: str = "",
        poll_interval: str | int = "",
        request_timeout: str | int = "",
        proxy: str | None = None,
    ):
        self.api = _normalize_base_url(base_url)
        self.api_key = _text(api_key)
        self.project_code = _text(project_code) or "openai"
        self.email_type = _text(email_type)
        self.domain = _text(domain)
        self.specified_email = _text(specified_email)
        self.variant_mode = _text(variant_mode)
        self.poll_interval = _bounded_int(poll_interval, default=3, minimum=1, maximum=30)
        self.request_timeout = _bounded_int(request_timeout, default=30, minimum=5, maximum=120)
        self.proxy = {"http": proxy, "https": proxy} if proxy else None
        self._session: requests.Session | None = None

        self._assert_ready()

    @classmethod
    def from_config(cls, config: dict) -> "LuckMailMailbox":
        return cls(
            base_url=config.get("luckmail_base_url", ""),
            api_key=config.get("luckmail_api_key", ""),
            project_code=config.get("luckmail_project_code", ""),
            email_type=config.get("luckmail_email_type", ""),
            domain=config.get("luckmail_domain", ""),
            specified_email=config.get("luckmail_specified_email", ""),
            variant_mode=config.get("luckmail_variant_mode", ""),
            poll_interval=config.get("luckmail_interval_s", ""),
            request_timeout=config.get("luckmail_request_timeout_s", ""),
            proxy=config.get("proxy") or config.get("mailbox_proxy"),
        )

    def _assert_ready(self) -> None:
        if not self.api_key:
            raise RuntimeError("LuckMail 未配置 API Key")
        if not self.project_code:
            raise RuntimeError("LuckMail 未配置项目代码")

    def _get_session(self) -> requests.Session:
        if self._session is None:
            session = requests.Session()
            session.proxies = self.proxy or {}
            mark_session_insecure(session)
            session.headers.update(
                {
                    "X-API-Key": self.api_key,
                    "user-agent": "SuperAutoplus/LuckMail-mailbox",
                    "accept": "application/json",
                    "content-type": "application/json",
                }
            )
            self._session = session
        return self._session

    @staticmethod
    def _response_json(response, label: str) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception as exc:
            raise RuntimeError(f"{label} 响应不是 JSON: HTTP {response.status_code}") from exc
        return payload if isinstance(payload, dict) else {"items": payload}

    @staticmethod
    def _unwrap_payload(response, label: str) -> dict[str, Any]:
        payload = LuckMailMailbox._response_json(response, label)
        if response.status_code in {401, 403}:
            raise RuntimeError("LuckMail API Key 认证失败")
        if response.status_code >= 400:
            message = payload.get("message") or payload.get("error") or f"HTTP {response.status_code}"
            raise RuntimeError(f"{label} 请求失败: {message}")

        if "code" in payload:
            code = payload.get("code")
            if code not in (0, "0", None):
                message = payload.get("message") or payload.get("error") or f"code={code}"
                raise RuntimeError(f"{label} 请求失败: {message}")
            data = payload.get("data")
            if isinstance(data, dict):
                return data
            return {} if data in (None, "") else {"data": data}
        return payload

    def _post_json(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        session = self._get_session()
        url = f"{self.api}{path}"
        with suppress_insecure_request_warning():
            response = session.post(url, json=body, timeout=self.request_timeout)
        return self._unwrap_payload(response, f"LuckMail POST {path}")

    def _get_json(self, path: str) -> dict[str, Any]:
        session = self._get_session()
        url = f"{self.api}{path}"
        with suppress_insecure_request_warning():
            response = session.get(url, timeout=self.request_timeout)
        return self._unwrap_payload(response, f"LuckMail GET {path}")

    def _create_order_body(self) -> dict[str, str]:
        body = {"project_code": self.project_code}
        for key, value in (
            ("email_type", self.email_type),
            ("domain", self.domain),
            ("specified_email", self.specified_email),
            ("variant_mode", self.variant_mode),
        ):
            if value:
                body[key] = value
        return body

    def test_connection(self) -> dict[str, Any]:
        payload = self._get_json("/api/v1/openapi/user/info")
        balance = _text(payload.get("balance"))
        username = _text(payload.get("username") or payload.get("email"))
        parts = ["LuckMail API Key 有效"]
        if username:
            parts.append(f"账号: {username}")
        if balance:
            parts.append(f"余额: {balance}")
        return {
            "ok": True,
            "message": "，".join(parts),
            "data": payload,
        }

    def _build_account(self, order: dict[str, Any]) -> MailboxAccount:
        order_no = _text(order.get("order_no") or order.get("orderNo"))
        email = _text(order.get("email_address") or order.get("email") or order.get("address"))
        if not order_no:
            raise RuntimeError("LuckMail 创建订单后未返回 order_no")
        if not email:
            raise RuntimeError("LuckMail 创建订单后未返回 email_address")

        metadata = {
            "order_no": order_no,
            "email": email,
            "api_url": self.api,
            "project_code": self.project_code,
        }
        for key in ("project", "email_type", "domain", "specified_email", "variant_mode"):
            value = order.get(key) or getattr(self, key, "")
            if value not in (None, ""):
                metadata[key] = value

        return MailboxAccount(
            email=email,
            account_id=order_no,
            extra={
                "provider_account": {
                    "provider_type": "mailbox",
                    "provider_name": "luckmail_api",
                    "login_identifier": email,
                    "display_name": email,
                    "credentials": {},
                    "metadata": metadata,
                },
                "provider_resource": {
                    "provider_type": "mailbox",
                    "provider_name": "luckmail_api",
                    "resource_type": "mailbox_order",
                    "resource_identifier": order_no,
                    "handle": email,
                    "display_name": email,
                    "metadata": metadata,
                },
            },
        )

    def get_email(self) -> MailboxAccount:
        order = self._post_json("/api/v1/openapi/order/create", self._create_order_body())
        return self._build_account(order)

    def get_current_ids(self, account: MailboxAccount) -> set:
        order_no = _text(account.account_id)
        return {order_no} if order_no else set()

    @staticmethod
    def _message_text(payload: dict[str, Any]) -> str:
        fields = (
            "verification_code",
            "mail_subject",
            "subject",
            "mail_body_html",
            "mail_body",
            "body_html",
            "body",
            "text",
            "content",
        )
        return _strip_markup(" ".join(_text(payload.get(field)) for field in fields))

    @staticmethod
    def _extract_code(payload: dict[str, Any], code_pattern: str | None = None) -> str:
        explicit = _text(payload.get("verification_code"))
        if explicit:
            if not code_pattern:
                return explicit
            match = re.search(code_pattern, explicit)
            if match:
                return match.group(1) if match.groups() else match.group(0)

        text = re.sub(
            r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
            " ",
            LuckMailMailbox._message_text(payload),
        )
        match = re.search(code_pattern or DEFAULT_CODE_PATTERN, text)
        if match:
            return match.group(1) if match.groups() else match.group(0)
        return ""

    def wait_for_code(
        self,
        account: MailboxAccount,
        keyword: str = "",
        timeout: int = 120,
        before_ids: set = None,
        code_pattern: str = None,
    ) -> str:
        order_no = _text(account.account_id)
        if not order_no:
            raise RuntimeError("LuckMail 账号缺少 order_no，无法等待验证码")

        started = time.time()
        last_error: Exception | None = None
        path = f"/api/v1/openapi/order/{quote(order_no, safe='')}/code"

        while time.time() - started < timeout:
            try:
                payload = self._get_json(path)
                status = _text(payload.get("status")).lower()
                if status in {"timeout", "cancelled", "canceled", "failed", "fail"}:
                    raise RuntimeError(f"LuckMail 订单状态异常: {status or 'unknown'}")

                code = self._extract_code(payload, code_pattern)
                if status == "success" and code:
                    return code
                if code and not status:
                    return code
            except RuntimeError:
                raise
            except Exception as exc:  # noqa: BLE001
                last_error = exc

            elapsed = time.time() - started
            remaining = timeout - elapsed
            if remaining <= 0:
                break
            time.sleep(min(self.poll_interval, remaining))

        message = f"等待 LuckMail 验证码超时 ({timeout}s)"
        if last_error:
            message += f"，最后一次错误: {last_error}"
        raise TimeoutError(message)

    def wait_for_link(
        self,
        account: MailboxAccount,
        keyword: str = "",
        timeout: int = 120,
        before_ids: set = None,
    ) -> str:
        order_no = _text(account.account_id)
        if not order_no:
            raise RuntimeError("LuckMail 账号缺少 order_no，无法等待验证链接")

        started = time.time()
        path = f"/api/v1/openapi/order/{quote(order_no, safe='')}/code"
        while time.time() - started < timeout:
            payload = self._get_json(path)
            status = _text(payload.get("status")).lower()
            if status in {"timeout", "cancelled", "canceled", "failed", "fail"}:
                raise RuntimeError(f"LuckMail 订单状态异常: {status or 'unknown'}")
            link = _extract_verification_link(self._message_text(payload), keyword)
            if status == "success" and link:
                return link
            remaining = timeout - (time.time() - started)
            if remaining <= 0:
                break
            time.sleep(min(self.poll_interval, remaining))
        raise TimeoutError(f"等待 LuckMail 验证链接超时 ({timeout}s)")
