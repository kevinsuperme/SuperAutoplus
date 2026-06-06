# LuckMail Client Code Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/luckmail-code` page where customers paste `email----token` and retrieve the matching LuckMail verification code.

**Architecture:** Add a small LuckMail client-code service that parses the pasted ticket, resolves the existing `luckmail_api` provider settings, and reuses `LuckMailMailbox` for one-shot code lookup. Expose it through a public FastAPI route and render a standalone React page outside the authenticated admin shell, mirroring the `/pxl-plus` public-page pattern.

**Tech Stack:** FastAPI, Pydantic, SQLModel provider settings, existing `LuckMailMailbox`, React, Vite, Tailwind utility classes, pytest.

---

## File Structure

- Create `application/luckmail_client.py`: customer-facing parsing and code lookup service; owns sanitized response shaping.
- Modify `core/luckmail_mailbox.py`: add a one-shot `get_code_now()` helper that reuses existing `_get_json()` and `_extract_code()`.
- Create `api/luckmail_client.py`: public API router for `POST /api/luckmail/client/code`.
- Modify `core/auth.py`: add `/api/luckmail/client/` to public prefixes.
- Modify `main.py`: include the new API router.
- Create `tests/test_api_luckmail_client.py`: service, route, auth-public, and sanitized error tests.
- Create `frontend/src/pages/LuckMailCodeClient.tsx`: public customer page.
- Modify `frontend/src/App.tsx`: render `/luckmail-code` before auth gating.

---

### Task 1: Add LuckMail One-Shot Code Lookup

**Files:**
- Modify: `core/luckmail_mailbox.py`
- Test: `tests/test_luckmail_mailbox.py`

- [ ] **Step 1: Write the failing test**

Add this test at the end of `tests/test_luckmail_mailbox.py`:

```python
def test_luckmail_get_code_now_queries_single_order_without_waiting(monkeypatch):
    session = FakeSession(
        [
            FakeResponse(
                {
                    "code": 0,
                    "data": {
                        "order_no": "tok_abc123",
                        "status": "success",
                        "verification_code": "654321",
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
    )

    code = mailbox.get_code_now(mailbox._build_account({"order_no": "tok_abc123", "email_address": "user@example.com"}))

    assert code == "654321"
    assert session.calls == [
        {
            "method": "GET",
            "url": "https://mails.example.test/api/v1/openapi/order/tok_abc123/code",
            "kwargs": {"timeout": 30},
            "headers": {
                "X-API-Key": "fake-api-key",
                "user-agent": "SuperAutoplus/LuckMail-mailbox",
                "accept": "application/json",
                "content-type": "application/json",
            },
        }
    ]
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
python -m pytest tests/test_luckmail_mailbox.py::test_luckmail_get_code_now_queries_single_order_without_waiting -q
```

Expected: FAIL with `AttributeError: 'LuckMailMailbox' object has no attribute 'get_code_now'`.

- [ ] **Step 3: Implement the minimal one-shot helper**

In `core/luckmail_mailbox.py`, add this method inside `LuckMailMailbox`, just above `wait_for_code()`:

```python
    def get_code_now(
        self,
        account: MailboxAccount,
        code_pattern: str | None = None,
    ) -> str:
        order_no = _text(account.account_id)
        if not order_no:
            raise RuntimeError("LuckMail 账号缺少 order_no，无法查询验证码")

        payload = self._get_json(f"/api/v1/openapi/order/{quote(order_no, safe='')}/code")
        status = _text(payload.get("status")).lower()
        if status in {"timeout", "cancelled", "canceled", "failed", "fail"}:
            raise RuntimeError(f"LuckMail 订单状态异常: {status or 'unknown'}")
        return self._extract_code(payload, code_pattern)
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
python -m pytest tests/test_luckmail_mailbox.py::test_luckmail_get_code_now_queries_single_order_without_waiting -q
```

Expected: `1 passed`.

- [ ] **Step 5: Run the existing LuckMail provider tests**

Run:

```bash
python -m pytest tests/test_luckmail_mailbox.py -q
```

Expected: all tests in `tests/test_luckmail_mailbox.py` pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add core/luckmail_mailbox.py tests/test_luckmail_mailbox.py
git commit -m "feat: add luckmail one-shot code lookup"
```

---

### Task 2: Add LuckMail Client Service

**Files:**
- Create: `application/luckmail_client.py`
- Test: `tests/test_api_luckmail_client.py`

- [ ] **Step 1: Write the failing service tests**

Create `tests/test_api_luckmail_client.py` with this content:

```python
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
```

- [ ] **Step 2: Run the new service tests to verify they fail**

Run:

```bash
python -m pytest tests/test_api_luckmail_client.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'application.luckmail_client'`.

- [ ] **Step 3: Implement the client service**

Create `application/luckmail_client.py`:

```python
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
        return None, _client_response(
            ok=False,
            status="invalid_ticket_format",
            message="请输入正确的邮箱 Token 文本",
        )

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
                email=ticket.email,
            )

        return _client_response(
            ok=True,
            status="success",
            message="验证码已获取",
            email=ticket.email,
            code=code,
        )
```

- [ ] **Step 4: Run the new service tests to verify they pass**

Run:

```bash
python -m pytest tests/test_api_luckmail_client.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add application/luckmail_client.py tests/test_api_luckmail_client.py
git commit -m "feat: add luckmail client code service"
```

---

### Task 3: Add Public LuckMail API Route and Auth Exemption

**Files:**
- Create: `api/luckmail_client.py`
- Modify: `core/auth.py`
- Modify: `main.py`
- Test: `tests/test_api_luckmail_client.py`

- [ ] **Step 1: Add failing API/public-auth tests**

Append these tests to `tests/test_api_luckmail_client.py`:

```python
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
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
python -m pytest tests/test_api_luckmail_client.py::test_luckmail_client_code_endpoint_uses_service tests/test_api_luckmail_client.py::test_luckmail_client_code_endpoint_is_public -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'api.luckmail_client'`.

- [ ] **Step 3: Implement the API router**

Create `api/luckmail_client.py`:

```python
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from application.luckmail_client import LuckMailClientCodeService


router = APIRouter(prefix="/luckmail", tags=["luckmail-client"])
service = LuckMailClientCodeService()


class LuckMailClientCodeRequest(BaseModel):
    ticket: str = ""


@router.post("/client/code")
def get_luckmail_client_code(body: LuckMailClientCodeRequest):
    return service.get_code(body.model_dump())
```

- [ ] **Step 4: Add the public auth prefix**

In `core/auth.py`, update `_PUBLIC_PREFIXES` to include the new route:

```python
_PUBLIC_PREFIXES = (
    "/api/health",
    "/api/ready",
    "/api/auth/",
    "/api/sms/pingme/callback",
    "/api/pix-gpt-plus/client/",
    "/api/luckmail/client/",
)
```

- [ ] **Step 5: Register the router in the main app**

In `main.py`, add the import near the other API imports:

```python
from api.luckmail_client import router as luckmail_client_router
```

Then include the router near the other `app.include_router(...)` calls:

```python
app.include_router(luckmail_client_router, prefix="/api")
```

- [ ] **Step 6: Run API/public-auth tests**

Run:

```bash
python -m pytest tests/test_api_luckmail_client.py -q
```

Expected: all tests in `tests/test_api_luckmail_client.py` pass.

- [ ] **Step 7: Run adjacent public API tests**

Run:

```bash
python -m pytest tests/test_api_luckmail_client.py tests/test_api_pix_gpt_plus.py::test_pix_client_open_endpoint_is_public_with_ckd -q
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add api/luckmail_client.py core/auth.py main.py tests/test_api_luckmail_client.py
git commit -m "feat: expose public luckmail code api"
```

---

### Task 4: Add Public LuckMail React Page

**Files:**
- Create: `frontend/src/pages/LuckMailCodeClient.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create the customer page component**

Create `frontend/src/pages/LuckMailCodeClient.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  Mail,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { API, cn } from "@/lib/utils";

type CodeResponse = {
  ok: boolean;
  status?: string;
  message?: string;
  email?: string;
  code?: string;
};

type StepKey = "parse" | "query" | "extract";
type BannerTone = "neutral" | "loading" | "success" | "error";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseTicketPreview(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes("----")) return { email: "", token: "", valid: false };
  const [email, token] = trimmed.split("----", 2);
  const cleanEmail = email.trim();
  const cleanToken = token.trim();
  return {
    email: cleanEmail,
    token: cleanToken,
    valid: EMAIL_RE.test(cleanEmail) && cleanToken.length > 0,
  };
}

async function readCodeResponse(res: Response): Promise<CodeResponse> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as CodeResponse;
  }
  return {
    ok: false,
    status: String(res.status),
    message: "服务返回格式异常，请稍后重试。",
  };
}

export default function LuckMailCodeClient() {
  const [ticket, setTicket] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<CodeResponse | null>(null);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string }>({
    tone: "neutral",
    message: "粘贴邮箱 Token 文本后即可查询验证码。",
  });
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);

  const preview = useMemo(() => parseTicketPreview(ticket), [ticket]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const value = ticket.trim();
    if (!value) {
      setResult(null);
      setActiveStep("parse");
      setBanner({ tone: "error", message: "请输入邮箱 Token 文本。" });
      return;
    }
    if (!preview.valid) {
      setResult(null);
      setActiveStep("parse");
      setBanner({ tone: "error", message: "格式应为 邮箱----token。" });
      return;
    }

    setSubmitting(true);
    setCopied(false);
    setResult(null);
    setActiveStep("query");
    setBanner({ tone: "loading", message: "正在查询 LuckMail 验证码..." });

    try {
      const response = await fetch(`${API}/luckmail/client/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: value }),
      });
      const data = await readCodeResponse(response);
      setResult(data);

      if (!response.ok || !data.ok) {
        setActiveStep(data.status === "code_not_ready" ? "extract" : "query");
        setBanner({
          tone: "error",
          message: data.message || data.status || `请求失败，HTTP 状态码 ${response.status}`,
        });
        return;
      }

      setActiveStep("extract");
      setBanner({ tone: "success", message: data.message || "验证码已获取。" });
    } catch (error) {
      setActiveStep("query");
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "请求失败，请确认服务在线后重试。",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!result?.code) return;
    await navigator.clipboard?.writeText(result.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-hard)] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="border-b border-[var(--border)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-5 flex items-center gap-3">
              <div className="eco-icon h-11 w-11 shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  LuckMail 验证码查询
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  粘贴邮箱 Token 文本后获取验证码。
                </p>
              </div>
            </div>

            <div
              className={cn(
                "mb-5 flex gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                banner.tone === "success" &&
                  "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
                banner.tone === "error" && "border-red-500/25 bg-red-500/10 text-red-600",
                banner.tone === "loading" &&
                  "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]",
                banner.tone === "neutral" &&
                  "border-[var(--border)] bg-[var(--bg-pane)]/60 text-[var(--text-secondary)]",
              )}
              role={banner.tone === "error" ? "alert" : "status"}
            >
              {banner.tone === "loading" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : banner.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <div>
                <label
                  htmlFor="luckmail-ticket"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
                >
                  邮箱 Token 文本
                </label>
                <textarea
                  id="luckmail-ticket"
                  value={ticket}
                  onChange={(event) => setTicket(event.target.value)}
                  placeholder="jadelee7905@outlook.com----tok_894d7778268489752c2c077e7ac6a603"
                  className="control-surface control-surface-mono min-h-28 w-full resize-y"
                  disabled={submitting}
                  spellCheck={false}
                />
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/50 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)]">已解析邮箱</span>
                  <span className="min-w-0 truncate font-mono text-[var(--text-secondary)]">
                    {preview.email || "-"}
                  </span>
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                {submitting ? "正在查询" : "获取验证码"}
              </Button>
            </form>
          </div>

          <div className="space-y-5 bg-[var(--bg-pane)]/35 p-5 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">查询状态</h2>
              <div className="mt-4 space-y-3">
                <StatusStep
                  label="解析文本"
                  description="识别邮箱与 token"
                  done={preview.valid || Boolean(result)}
                  active={activeStep === "parse"}
                />
                <StatusStep
                  label="查询 LuckMail"
                  description="后端使用系统配置查询订单"
                  done={Boolean(result)}
                  active={activeStep === "query"}
                />
                <StatusStep
                  label="提取验证码"
                  description="从返回邮件内容提取 6 位验证码"
                  done={Boolean(result?.ok && result.code)}
                  active={activeStep === "extract"}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-2 text-xs text-[var(--text-muted)]">验证码</div>
              {result?.ok && result.code ? (
                <>
                  <div className="font-mono text-4xl font-bold tracking-[0.18em] text-[var(--text-primary)]">
                    {result.code}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={copyCode} className="mt-4">
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {copied ? "已复制" : "复制验证码"}
                  </Button>
                </>
              ) : (
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)]">
                  等待查询结果
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusStep({
  label,
  description,
  done,
  active,
}: {
  label: string;
  description: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          done
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
            : active
              ? "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--text-muted)]",
        )}
      >
        {done ? <ClipboardCheck className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
        <div className="text-xs text-[var(--text-muted)]">{description}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the page in `frontend/src/App.tsx`**

Add the import near `PxlPlusClient`:

```tsx
import LuckMailCodeClient from "@/pages/LuckMailCodeClient";
```

Then update the public-route branch in `AppContent()`:

```tsx
  if (window.location.pathname === "/pxl-plus") {
    return (
      <BrowserRouter>
        <PxlPlusClient />
      </BrowserRouter>
    );
  }

  if (window.location.pathname === "/luckmail-code") {
    return (
      <BrowserRouter>
        <LuckMailCodeClient />
      </BrowserRouter>
    );
  }
```

- [ ] **Step 3: Run the frontend build**

Run:

```bash
npm run build
```

Working directory: `frontend`

Expected: TypeScript and Vite build exit with code 0 and write updated assets to `static/`.

- [ ] **Step 4: Commit**

Run:

```bash
git add frontend/src/pages/LuckMailCodeClient.tsx frontend/src/App.tsx static
git commit -m "feat: add public luckmail code page"
```

---

### Task 5: Full Verification

**Files:**
- Verify only; no code changes expected.

- [ ] **Step 1: Run backend tests**

Run:

```bash
python -m pytest tests/test_luckmail_mailbox.py tests/test_api_luckmail_client.py tests/test_api_pix_gpt_plus.py::test_pix_client_open_endpoint_is_public_with_ckd -q
```

Expected: all selected backend tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Working directory: `frontend`

Expected: build exits with code 0.

- [ ] **Step 3: Run a local server smoke test**

Start the backend if no local server is running:

```bash
python main.py
```

Then verify:

```bash
curl -i http://127.0.0.1:8000/luckmail-code
curl -sS -H "Content-Type: application/json" -d "{\"ticket\":\"bad\"}" http://127.0.0.1:8000/api/luckmail/client/code
```

Expected:

- `/luckmail-code` returns `HTTP 200` with the SPA entry.
- Invalid ticket returns JSON with `status` equal to `invalid_ticket_format`.
- No response includes `Unauthorized`.

- [ ] **Step 4: Browser render check**

Open `/luckmail-code` in a browser or headless Chrome and verify the rendered DOM contains:

- `LuckMail 验证码查询`
- `邮箱 Token 文本`
- `获取验证码`
- `查询状态`

Expected: the page renders without the admin sidebar and without the login form.

- [ ] **Step 5: Final commit if verification caused rebuilt static changes**

Run:

```bash
git status --short
```

If `static/` changed after the final build, commit it:

```bash
git add static
git commit -m "build: refresh frontend assets"
```

If no files changed, do not create an empty commit.

---

## Self-Review

- Spec coverage: the plan covers the single-paste input, public `/luckmail-code` page, public `/api/luckmail/client/code` API, LuckMail API Key isolation, sanitized responses, one-shot code lookup, auth exemption, and verification.
- Placeholder scan: the plan contains no TBD/TODO steps and no unspecified implementation steps.
- Type consistency: the service method is `LuckMailClientCodeService.get_code(payload)`, the request field is `ticket`, the API path is `/api/luckmail/client/code`, and the React route is `/luckmail-code` throughout.
