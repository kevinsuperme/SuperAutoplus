# PXL Plus Client Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/pxl-plus` customer page where users submit a CKD code plus ChatGPT Access Token or Session JSON to generate Plus PIX activation output.

**Architecture:** The existing `PixGptPlusService` keeps ownership of Nerver PIX calls. A new client-facing service method validates CKD codes, extracts a temporary access token from plain text or JSON, calls the existing remote PIX method, and returns a sanitized response. The React app renders `/pxl-plus` outside the authenticated admin shell while the new API route is public only through CKD validation.

**Tech Stack:** FastAPI, Pydantic, SQLModel test fixture, httpx, React 19, React Router 7, Vite, Tailwind CSS, lucide-react, pytest.

---

## File Structure

- Modify `application/pix_gpt_plus.py`: add CKD parsing, credential parsing, and `generate_for_client_token()`.
- Modify `api/pix_gpt_plus.py`: add request model and `POST /api/pix-gpt-plus/client/open`.
- Modify `core/auth.py`: add `/api/pix-gpt-plus/client/` to public prefixes.
- Modify `tests/test_api_pix_gpt_plus.py`: add service and API tests for the client flow.
- Create `frontend/src/pages/PxlPlusClient.tsx`: public customer form, state banner, result panel.
- Modify `frontend/src/App.tsx`: route `/pxl-plus` before admin auth gating.

---

### Task 1: Backend Client Flow Tests

**Files:**
- Modify: `tests/test_api_pix_gpt_plus.py`

- [ ] **Step 1: Add failing service tests**

Append these tests to `tests/test_api_pix_gpt_plus.py`:

```python
def test_client_open_with_access_token_calls_nerver(monkeypatch):
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")
    captured: dict[str, object] = {}

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        captured["endpoint_path"] = endpoint_path
        captured["body"] = body
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201PIX",
            "pix_qr_image_url": "https://files.example/pix.png",
            "pix_hosted_url": "https://pay.example/pix",
            "pix_expires_iso": "2026-06-06T12:00:00.000Z",
            "request_id": "req_123",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": "ac_customer_token"}
    )

    assert result["ok"] is True
    assert result["status"] == "success"
    assert result["pix_qr_data"] == "000201PIX"
    assert captured == {
        "endpoint_path": "/api/v1/pix-short",
        "body": {"token": "ac_customer_token", "promoId": "plus-1-month-free"},
    }


def test_client_open_with_session_json_extracts_access_token(monkeypatch):
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-JSON")
    captured: dict[str, object] = {}

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        captured["body"] = body
        return {
            "ok": True,
            "reason": "ok",
            "mode": "short_emv",
            "pix_qr_data": "000201JSON",
        }

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {
            "ckd": "CKD-JSON",
            "credential": '{"session":{"accessToken":"ac_from_json"}}',
        }
    )

    assert result["ok"] is True
    assert result["status"] == "success"
    assert captured["body"] == {
        "token": "ac_from_json",
        "promoId": "plus-1-month-free",
    }


def test_client_open_rejects_missing_ckd_configuration(monkeypatch):
    monkeypatch.delenv("PIX_CLIENT_CKD_CODES", raising=False)
    monkeypatch.setattr("application.pix_gpt_plus.config_store.get", lambda key, default="": "")

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "ANY", "credential": "ac_customer_token"}
    )

    assert result == {
        "ok": False,
        "status": "ckd_not_configured",
        "message": "服务端未配置 CKD 授权码",
    }


def test_client_open_rejects_invalid_ckd(monkeypatch):
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "WRONG", "credential": "ac_customer_token"}
    )

    assert result == {
        "ok": False,
        "status": "invalid_ckd",
        "message": "CKD 授权码无效",
    }


def test_client_open_rejects_missing_token(monkeypatch):
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": '{"session":{}}'}
    )

    assert result == {
        "ok": False,
        "status": "missing_token",
        "message": "未能从 Access Token / Session JSON 中提取 token",
    }


def test_client_open_wraps_remote_error(monkeypatch):
    monkeypatch.setenv("PIX_CLIENT_CKD_CODES", "CKD-OK")

    def fake_call(self, *, endpoint_path: str, body: dict) -> dict:  # noqa: ANN001
        raise RuntimeError("remote timeout")

    monkeypatch.setattr(PixGptPlusService, "_call_remote_pix", fake_call)

    result = PixGptPlusService().generate_for_client_token(
        {"ckd": "CKD-OK", "credential": "ac_customer_token"}
    )

    assert result["ok"] is False
    assert result["status"] == "remote_error"
    assert "remote timeout" in result["message"]
```

- [ ] **Step 2: Add failing endpoint auth test**

Append this test to `tests/test_api_pix_gpt_plus.py`:

```python
def test_pix_client_open_endpoint_is_public_with_ckd(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.pix_gpt_plus import router
    from application.pix_gpt_plus import PixGptPlusService
    from core.auth import AuthMiddleware

    monkeypatch.setenv("APP_PASSWORD", "admin-password")
    captured: dict[str, object] = {}

    def fake_generate(self, payload: dict) -> dict:  # noqa: ANN001
        captured["payload"] = payload
        return {
            "ok": True,
            "status": "success",
            "message": "PIX 已生成",
            "pix_qr_data": "000201PUBLIC",
        }

    monkeypatch.setattr(PixGptPlusService, "generate_for_client_token", fake_generate)

    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix="/api")
    local_client = TestClient(app)

    response = local_client.post(
        "/api/pix-gpt-plus/client/open",
        json={"ckd": "CKD-OK", "credential": "ac_customer_token"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert captured["payload"] == {
        "ckd": "CKD-OK",
        "credential": "ac_customer_token",
    }
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
pytest tests/test_api_pix_gpt_plus.py -q
```

Expected: fail with `AttributeError: 'PixGptPlusService' object has no attribute 'generate_for_client_token'` or route `404` for `/client/open`.

---

### Task 2: Backend Service Implementation

**Files:**
- Modify: `application/pix_gpt_plus.py`

- [ ] **Step 1: Add imports**

At the top of `application/pix_gpt_plus.py`, change the imports to include `json` and `re`:

```python
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
```

- [ ] **Step 2: Add constants and helpers**

Add these constants and helper functions below `PIX_ENDPOINTS`:

```python
CLIENT_TOKEN_KEYS = {"access_token", "accessToken", "token", "primary_token"}


def _split_codes(value: str) -> set[str]:
    return {item.strip() for item in re.split(r"[\s,]+", value or "") if item.strip()}


def _client_response(
    *,
    ok: bool,
    status: str,
    message: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {"ok": ok, "status": status, "message": message}
    if extra:
        result.update(extra)
    return result


def _find_token_in_json(value: Any) -> str:
    if isinstance(value, dict):
        for key in CLIENT_TOKEN_KEYS:
            token = _remote_text(value.get(key))
            if token:
                return token
        for item in value.values():
            token = _find_token_in_json(item)
            if token:
                return token
    if isinstance(value, list):
        for item in value:
            token = _find_token_in_json(item)
            if token:
                return token
    return ""
```

- [ ] **Step 3: Add client methods**

Add these methods inside `class PixGptPlusService`, before `_call_remote_pix`:

```python
    def generate_for_client_token(self, payload: dict[str, Any]) -> dict[str, Any]:
        ckd = str(payload.get("ckd") or "").strip()
        credential = str(payload.get("credential") or "").strip()
        if not ckd:
            return _client_response(
                ok=False,
                status="invalid_ckd",
                message="CKD 授权码无效",
            )
        if not credential:
            return _client_response(
                ok=False,
                status="missing_credential",
                message="请填写 Access Token / Session JSON",
            )

        allowed_codes = self._client_ckd_codes()
        if not allowed_codes:
            return _client_response(
                ok=False,
                status="ckd_not_configured",
                message="服务端未配置 CKD 授权码",
            )
        if ckd not in allowed_codes:
            return _client_response(
                ok=False,
                status="invalid_ckd",
                message="CKD 授权码无效",
            )

        token = self._extract_client_token(credential)
        if not token:
            return _client_response(
                ok=False,
                status="missing_token",
                message="未能从 Access Token / Session JSON 中提取 token",
            )

        mode = str(payload.get("api_mode") or "short").strip().lower()
        endpoint_path = PIX_ENDPOINTS.get(mode)
        if not endpoint_path:
            return _client_response(
                ok=False,
                status="invalid_api_mode",
                message=f"不支持的 PIX API 模式: {mode}",
            )

        promo_id = str(
            payload.get("promo_id") or payload.get("promoId") or "plus-1-month-free"
        ).strip()
        try:
            remote = self._call_remote_pix(
                endpoint_path=endpoint_path,
                body={"token": token, "promoId": promo_id},
            )
        except Exception as exc:  # noqa: BLE001 - expose remote summary to customer UI
            return _client_response(
                ok=False,
                status="remote_error",
                message=f"Nerver PIX 接口调用失败: {exc}",
                extra={"mode": mode, "endpoint": endpoint_path},
            )

        return self._client_result_from_remote(
            remote=remote,
            mode=mode,
            endpoint_path=endpoint_path,
        )

    def _client_ckd_codes(self) -> set[str]:
        configured = _config_value("pix_client_ckd_codes", "PIX_CLIENT_CKD_CODES", "")
        return _split_codes(configured)

    def _extract_client_token(self, credential: str) -> str:
        raw = credential.strip()
        if not raw:
            return ""
        if raw.startswith("{") or raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except ValueError:
                return ""
            return _find_token_in_json(parsed)
        return raw

    def _client_result_from_remote(
        self,
        *,
        remote: dict[str, Any],
        mode: str,
        endpoint_path: str,
    ) -> dict[str, Any]:
        ok = bool(remote.get("ok"))
        status = "success" if ok else "remote_failed"
        message = (
            _remote_text(remote.get("message"))
            or ("PIX 已生成" if ok else f"Nerver PIX 返回失败: {_remote_text(remote.get('reason')) or 'unknown'}")
        )
        return _client_response(
            ok=ok,
            status=status,
            message=message,
            extra={
                "mode": mode,
                "endpoint": endpoint_path,
                "reason": _remote_text(remote.get("reason")),
                "pix_qr_data": _remote_text(remote.get("pix_qr_data")),
                "pix_qr_image_url": _remote_text(remote.get("pix_qr_image_url")),
                "pix_hosted_url": _remote_text(remote.get("pix_hosted_url")),
                "stripe_hosted_url": _remote_text(remote.get("stripe_hosted_url")),
                "pix_expires_iso": _remote_text(remote.get("pix_expires_iso")),
                "request_id": _remote_text(remote.get("request_id")),
            },
        )
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
pytest tests/test_api_pix_gpt_plus.py::test_client_open_with_access_token_calls_nerver tests/test_api_pix_gpt_plus.py::test_client_open_with_session_json_extracts_access_token tests/test_api_pix_gpt_plus.py::test_client_open_rejects_missing_ckd_configuration tests/test_api_pix_gpt_plus.py::test_client_open_rejects_invalid_ckd tests/test_api_pix_gpt_plus.py::test_client_open_rejects_missing_token tests/test_api_pix_gpt_plus.py::test_client_open_wraps_remote_error -q
```

Expected: all selected service tests pass.

---

### Task 3: Public API and Auth Prefix

**Files:**
- Modify: `api/pix_gpt_plus.py`
- Modify: `core/auth.py`

- [ ] **Step 1: Add request model and endpoint**

In `api/pix_gpt_plus.py`, add this model after `PixGptPlusGenerateRequest`:

```python
class PixGptPlusClientOpenRequest(BaseModel):
    ckd: str = ""
    credential: str = ""
```

Add this endpoint after `generate_pix`:

```python
@router.post("/client/open")
def open_pix_client(body: PixGptPlusClientOpenRequest):
    return service.generate_for_client_token(body.model_dump())
```

- [ ] **Step 2: Make client endpoint public**

In `core/auth.py`, update `_PUBLIC_PREFIXES` to include `/api/pix-gpt-plus/client/`:

```python
_PUBLIC_PREFIXES = (
    "/api/health",
    "/api/ready",
    "/api/auth/",
    "/api/sms/pingme/callback",
    "/api/pix-gpt-plus/client/",
)
```

- [ ] **Step 3: Run endpoint test**

Run:

```powershell
pytest tests/test_api_pix_gpt_plus.py::test_pix_client_open_endpoint_is_public_with_ckd -q
```

Expected: pass.

- [ ] **Step 4: Run all PIX API tests**

Run:

```powershell
pytest tests/test_api_pix_gpt_plus.py -q
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit backend work**

Run:

```powershell
git add application\pix_gpt_plus.py api\pix_gpt_plus.py core\auth.py tests\test_api_pix_gpt_plus.py
git commit -m "feat: add public pxl plus client api"
```

Expected: commit succeeds with only backend files included.

---

### Task 4: Public Customer Page

**Files:**
- Create: `frontend/src/pages/PxlPlusClient.tsx`

- [ ] **Step 1: Create page component**

Create `frontend/src/pages/PxlPlusClient.tsx` with this component:

```tsx
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  LockKeyhole,
  QrCode,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { API, cn } from "@/lib/utils";

type ClientResult = {
  ok: boolean;
  status: string;
  message: string;
  mode?: string;
  endpoint?: string;
  reason?: string;
  pix_qr_data?: string;
  pix_qr_image_url?: string;
  pix_hosted_url?: string;
  stripe_hosted_url?: string;
  pix_expires_iso?: string;
  request_id?: string;
};

type BannerState = "idle" | "loading" | "success" | "warning";

function compact(value: string, head = 24, tail = 18) {
  if (!value) return "";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export default function PxlPlusClient() {
  const [ckd, setCkd] = useState("");
  const [credential, setCredential] = useState("");
  const [result, setResult] = useState<ClientResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const banner = useMemo<{ type: BannerState; message: string }>(() => {
    if (busy) return { type: "loading", message: "正在提交开通请求，请等待当前结果。" };
    if (result?.ok) return { type: "success", message: result.message || "PIX 已生成。" };
    if (result) return { type: "warning", message: result.message || "开通请求失败。" };
    return { type: "idle", message: "输入 CKD 与 ChatGPT 凭据后即可发起自助开通。" };
  }, [busy, result]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!ckd.trim() || !credential.trim()) {
      setResult({
        ok: false,
        status: "missing_input",
        message: "请填写 CKD 授权码和 Access Token / Session JSON。",
      });
      return;
    }

    setBusy(true);
    setCopied("");
    setResult(null);
    try {
      const response = await fetch(`${API}/pix-gpt-plus/client/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ckd: ckd.trim(), credential: credential.trim() }),
      });
      const data = await response.json().catch(() => ({
        ok: false,
        status: "invalid_response",
        message: "服务返回格式异常。",
      }));
      setResult(data);
    } catch (error: any) {
      setResult({
        ok: false,
        status: "network_error",
        message: `请求失败: ${error?.message || error}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setCopied(label);
  };

  const hostedUrl = result?.pix_hosted_url || result?.stripe_hosted_url || "";

  return (
    <div className="min-h-screen bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[460px] items-center">
        <main className="w-full rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-hard)]">
          <header className="border-b border-[var(--border)] px-5 py-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-strong)_100%)] text-white shadow-[0_14px_30px_rgba(var(--accent-rgb),0.26)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              ChatGPT Plus 自助开通
            </h1>
            <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              PXL Plus Client
            </p>
          </header>

          <form onSubmit={submit} className="space-y-4 px-5 py-5">
            <div
              className={cn(
                "flex gap-2 rounded-2xl border px-3 py-3 text-xs leading-relaxed",
                banner.type === "success"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
                  : banner.type === "warning"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-600"
                    : "border-[var(--border)] bg-[var(--bg-pane)] text-[var(--text-secondary)]",
              )}
            >
              {banner.type === "loading" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : banner.type === "success" ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                <LockKeyhole className="h-3.5 w-3.5" />
                CKD 授权码
              </span>
              <input
                value={ckd}
                onChange={(event) => setCkd(event.target.value)}
                autoComplete="off"
                className="control-surface w-full"
                placeholder="请输入 CKD"
                disabled={busy}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
                Access Token / Session JSON
              </span>
              <textarea
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                className="control-surface control-surface-mono min-h-[156px] w-full resize-y"
                placeholder="粘贴 access token 或 session JSON"
                disabled={busy}
              />
            </label>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              提交开通
            </Button>
          </form>

          {result && (
            <section className="border-t border-[var(--border)] px-5 py-5">
              {result.ok ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[132px_1fr]">
                    <div className="flex aspect-square items-center justify-center rounded-2xl border border-[var(--border)] bg-white p-2">
                      {result.pix_qr_image_url ? (
                        <img
                          src={result.pix_qr_image_url}
                          alt="PIX QR"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <QrCode className="h-14 w-14 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-2 text-xs">
                      <InfoLine label="状态" value={result.status} />
                      <InfoLine label="模式" value={result.mode || "-"} />
                      <InfoLine label="过期" value={result.pix_expires_iso || "-"} />
                      <InfoLine label="请求" value={compact(result.request_id || "") || "-"} />
                    </div>
                  </div>

                  {result.pix_qr_data && (
                    <button
                      type="button"
                      onClick={() => copyText(result.pix_qr_data || "", "EMV")}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-pane)] px-3 py-3 text-left text-xs transition-colors hover:border-[var(--accent-edge)]"
                    >
                      <span className="min-w-0 truncate font-mono text-[var(--text-secondary)]">
                        {compact(result.pix_qr_data)}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[var(--accent)]">
                        <Copy className="h-3.5 w-3.5" />
                        {copied === "EMV" ? "已复制" : "复制"}
                      </span>
                    </button>
                  )}

                  {hostedUrl && (
                    <a
                      href={hostedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--accent-edge)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
                    >
                      打开支付链接
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
                  {result.message}
                </div>
              )}
            </section>
          )}

          <footer className="flex items-center justify-center gap-4 border-t border-[var(--border)] px-5 py-4 text-xs text-[var(--text-muted)]">
            <a className="hover:text-[var(--accent)]" href="#" onClick={(e) => e.preventDefault()}>
              联系客服
            </a>
            <a className="hover:text-[var(--accent)]" href="#" onClick={(e) => e.preventDefault()}>
              查看教程
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[42px_1fr] gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate font-mono text-[var(--text-primary)]">
        {value || "-"}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check through build**

Run:

```powershell
cd frontend
npm run build
```

Expected: fail because the page is not routed yet is acceptable only if there is an import issue; otherwise it may pass.

---

### Task 5: Public Route Before Admin Auth

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import public page**

Add this import near the page imports:

```tsx
import PxlPlusClient from "@/pages/PxlPlusClient";
```

- [ ] **Step 2: Add route gate before auth check UI**

Inside `AppContent`, after `toggleTheme` and before `if (authState === "loading")`, add:

```tsx
  if (window.location.pathname === "/pxl-plus") {
    return (
      <BrowserRouter>
        <PxlPlusClient />
      </BrowserRouter>
    );
  }
```

- [ ] **Step 3: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: `tsc -b && vite build` exits with code 0 and writes build output to `static/`.

- [ ] **Step 4: Commit frontend work**

Run:

```powershell
git add frontend\src\App.tsx frontend\src\pages\PxlPlusClient.tsx
git commit -m "feat: add pxl plus client page"
```

Expected: commit succeeds with only frontend files included.

---

### Task 6: End-to-End Verification and Deploy Prep

**Files:**
- No new files required.

- [ ] **Step 1: Run backend tests**

Run:

```powershell
pytest tests/test_api_pix_gpt_plus.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Check worktree**

Run:

```powershell
git status --short
```

Expected: only intentional build output or no changes remain. If `static/` is ignored or generated, do not commit it unless this repository already tracks it.

- [ ] **Step 4: Start local backend for manual route check**

Run:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Expected: server starts and prints FastAPI startup logs.

- [ ] **Step 5: Manual browser check**

Open:

```text
http://127.0.0.1:8000/pxl-plus
```

Expected:

- Page loads without admin password prompt.
- Empty form submission shows missing input.
- Invalid CKD returns a clear CKD error when `PIX_CLIENT_CKD_CODES` is configured differently.
- Admin routes still require login when `APP_PASSWORD` is set.

- [ ] **Step 6: Deploy configuration note**

Before server deployment, set:

```env
PIX_CLIENT_CKD_CODES=CKD-DEMO-20260606
```

Expected: server has the demo CKD configured for verification and existing Nerver PIX settings remain unchanged. Replace the demo value with the real customer code before production use.

---

## Self-Review

- Spec coverage: public page, CKD validation, credential parsing, client API, auth bypass, tests, build, and deploy check are covered.
- Placeholder scan: no implementation steps use placeholder-only language; snippets define concrete code.
- Type consistency: API request fields are `ckd` and `credential`; frontend sends the same fields; backend method is consistently named `generate_for_client_token`.
