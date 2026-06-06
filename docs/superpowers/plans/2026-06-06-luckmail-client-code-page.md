# LuckMail Client Code Page Implementation Record

> 原始计划已按当前代码实现归档更新。以当前实现为准：客户验证码查询使用 LuckMail 已购邮箱 token 接口，而不是订单号查询接口。

**Goal:** Build a public `/luckmail-code` page where customers paste `email----token` or a standalone LuckMail token and retrieve the matching verification code.

**Architecture:** `frontend/src/pages/LuckMailCodeClient.tsx` renders outside the authenticated admin shell. `api/luckmail_client.py` exposes `POST /api/luckmail/client/code`. `application/luckmail_client.py` parses and validates customer input, creates `LuckMailMailbox` from provider runtime settings, calls the purchased-email token endpoint, extracts the code, and returns a sanitized customer response.

**Tech Stack:** FastAPI, Pydantic, SQLModel provider settings, existing `LuckMailMailbox`, React, Vite, Tailwind utility classes, pytest.

---

## Implemented Files

- `application/luckmail_client.py`: customer-facing parsing and code lookup service.
- `core/luckmail_mailbox.py`: LuckMail order creation, order-code lookup, purchased-token-code lookup, code extraction.
- `api/luckmail_client.py`: public API router for `POST /api/luckmail/client/code`.
- `core/auth.py`: public prefix `/api/luckmail/client/`.
- `main.py`: includes the LuckMail client router.
- `tests/test_api_luckmail_client.py`: service, token-only, auth-public and sanitized-error tests.
- `tests/test_luckmail_mailbox.py`: LuckMail provider and purchased-token endpoint tests.
- `frontend/src/pages/LuckMailCodeClient.tsx`: public customer page.
- `frontend/src/lib/session-token.ts`: extracts ChatGPT Access Token from copied session JSON or raw token text.
- `frontend/src/lib/public-routes.ts`: includes `/luckmail-code`.
- `frontend/src/App.tsx`: renders `/luckmail-code` before auth gating.
- `frontend/tests/session-token.test.mjs`: Node test coverage for Access Token extraction behavior.

## Current Input Contract

Supported full format:

```text
user@example.com----tok_example
```

Supported token-only format:

```text
tok_example
```

Parsing behavior:

- Empty input returns `missing_ticket`.
- Full format splits on the first `----`.
- Invalid full-format email returns `invalid_email`.
- Empty full-format token returns `missing_token`.
- Missing separator is accepted only when the text is a clean token without `@` or whitespace.
- Missing separator with an email-like or whitespace-containing value returns `invalid_ticket_format`.

## Current LuckMail API Usage

Customer page:

```text
GET /api/v1/openapi/email/token/{token}/code
```

Backend auto-generated mailbox orders:

```text
POST /api/v1/openapi/order/create
GET /api/v1/openapi/order/{order_no}/code
```

The customer token lookup does not treat a missing backend API Key as a preflight failure. API Key remains required for backend order creation and Provider connection testing.

## Current Response States

- `missing_ticket`
- `invalid_ticket_format`
- `invalid_email`
- `missing_token`
- `remote_error`
- `code_not_ready`
- `success`

Successful response:

```json
{
  "ok": true,
  "status": "success",
  "message": "验证码已获取",
  "email": "user@example.com",
  "code": "123456"
}
```

## Current ChatGPT Access Token Helper

The `/luckmail-code` page includes a client-side helper for customers who need to obtain a ChatGPT Access Token during the same workflow.

Current behavior:

- `打开 Session` opens `https://chatgpt.com/api/auth/session` in a new tab.
- The customer copies the session page content and returns to `/luckmail-code`.
- `从剪贴板填入` reads clipboard text and extracts `accessToken`, `access_token`, `token`, or `primary_token`.
- The Access Token textarea also supports manual paste of session JSON. If a token is recognized, the pasted JSON is replaced with the pure token.
- The Access Token is held only in frontend state. It is not written to local storage and is not submitted to `POST /api/luckmail/client/code`.

Browser constraints:

- A public web page cannot force the system browser to open an incognito/private window.
- A public web page cannot read `chatgpt.com` page contents across origins.
- Clipboard reads can be blocked by browser permissions or non-secure HTTP contexts, so manual paste remains the fallback path.

## Verification Commands

Use these commands after changes touching LuckMail:

```bash
cd frontend
node --test tests/session-token.test.mjs
npm run build
cd ..
python -m pytest tests/test_luckmail_mailbox.py tests/test_api_luckmail_client.py -q
```

Optional online smoke:

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"ticket":"user@example.com tok_abc"}' \
  http://127.0.0.1:8000/api/luckmail/client/code
```

Expected status for the invalid format smoke: `invalid_ticket_format`.
