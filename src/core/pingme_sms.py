"""PingMe callback message store for SMS verification codes."""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from typing import Any


DEFAULT_PINGME_CODE_PATTERN = r"(?<!\d)(\d{4,8})(?!\d)"

_LOCK = threading.RLock()
_CONDITION = threading.Condition(_LOCK)
_MESSAGES: list["PingMeMessage"] = []
_MAX_MESSAGES = 500


@dataclass
class PingMeMessage:
    user_id: str
    app: str
    from_number: str
    to_number: str
    text: str
    provider_time: str
    received_at: float

    def to_dict(self) -> dict:
        return {
            "userId": self.user_id,
            "app": self.app,
            "from": self.from_number,
            "to": self.to_number,
            "text": self.text,
            "time": self.provider_time,
            "received_at": self.received_at,
        }


def normalize_pingme_phone(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return ""
    return f"+{digits}"


def extract_pingme_code(text: str, pattern: str | None = None) -> str:
    match = re.search(pattern or DEFAULT_PINGME_CODE_PATTERN, str(text or ""))
    if not match:
        return ""
    return match.group(1) if match.groups() else match.group(0)


def record_pingme_message(payload: dict) -> dict:
    message = PingMeMessage(
        user_id=str(payload.get("userId") or "").strip(),
        app=str(payload.get("app") or "").strip(),
        from_number=str(payload.get("from") or "").strip(),
        to_number=normalize_pingme_phone(payload.get("to")),
        text=str(payload.get("text") or ""),
        provider_time=str(payload.get("time") or "").strip(),
        received_at=time.time(),
    )
    if not message.user_id:
        raise ValueError("PingMe callback missing userId")
    if not message.app:
        raise ValueError("PingMe callback missing app")
    if not message.to_number:
        raise ValueError("PingMe callback missing to")
    if not message.text:
        raise ValueError("PingMe callback missing text")

    with _CONDITION:
        _MESSAGES.append(message)
        if len(_MESSAGES) > _MAX_MESSAGES:
            del _MESSAGES[: len(_MESSAGES) - _MAX_MESSAGES]
        _CONDITION.notify_all()
    return message.to_dict()


def wait_for_pingme_code(
    *,
    user_id: str,
    app: str,
    number: str,
    after: float = 0,
    timeout: int = 120,
    pattern: str | None = None,
) -> str:
    user_id = str(user_id or "").strip()
    app = str(app or "").strip()
    number = normalize_pingme_phone(number)
    deadline = time.time() + max(0, int(timeout or 0))

    with _CONDITION:
        while True:
            for message in _MESSAGES:
                if message.received_at < float(after or 0):
                    continue
                if message.user_id != user_id:
                    continue
                if message.app != app:
                    continue
                if message.to_number != number:
                    continue
                code = extract_pingme_code(message.text, pattern=pattern)
                if code:
                    return code

            remaining = deadline - time.time()
            if remaining <= 0:
                return ""
            _CONDITION.wait(timeout=min(remaining, 1.0))


def clear_pingme_messages() -> None:
    with _CONDITION:
        _MESSAGES.clear()
