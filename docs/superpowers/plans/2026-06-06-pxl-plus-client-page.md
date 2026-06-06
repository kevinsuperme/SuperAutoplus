# PXL Plus Client Page Implementation Record

> 原始计划已按当前代码实现归档更新。以当前实现为准：客户侧远端异常和远端业务失败均返回脱敏提示，不透出可能包含 token 的远端 message/reason。

**Goal:** Build a public `/pxl-plus` customer page where users submit a CKD code plus ChatGPT Access Token or Session JSON to generate Plus PIX activation output.

**Architecture:** `PixGptPlusService` owns Nerver PIX calls. `generate_for_client_token()` validates CKD codes, extracts a temporary access token from plain text or JSON, calls the existing `_call_remote_pix()` method, and returns a sanitized response. The React app renders `/pxl-plus` outside the authenticated admin shell while the new API route is public only through CKD validation.

**Tech Stack:** FastAPI, Pydantic, SQLModel test fixture, httpx, React 19, React Router 7, Vite, Tailwind CSS, lucide-react, pytest.

---

## Implemented Files

- `application/pix_gpt_plus.py`: CKD parsing, credential parsing, `generate_for_client_token()`, Nerver PIX call wrapper.
- `api/pix_gpt_plus.py`: `POST /api/pix-gpt-plus/generate` and `POST /api/pix-gpt-plus/client/open`.
- `core/auth.py`: public prefix `/api/pix-gpt-plus/client/`.
- `tests/test_api_pix_gpt_plus.py`: backend batch, client flow, sanitization and auth-public tests.
- `frontend/src/pages/PxlPlusClient.tsx`: public customer form and result panel.
- `frontend/src/lib/public-routes.ts`: includes `/pxl-plus`.
- `frontend/src/App.tsx`: renders `/pxl-plus` before auth gating.

## Current Input Contract

```json
{
  "ckd": "CUSTOMER-CODE",
  "credential": "access token 或 session json"
}
```

CKD sources:

- Config key: `pix_client_ckd_codes`
- Environment variable: `PIX_CLIENT_CKD_CODES`

CKD values are split by comma, whitespace, or newline and are case-sensitive.

Credential parsing:

- Plain text is treated as an access token.
- JSON object/list is searched recursively for `access_token`, `accessToken`, `primary_token`, or `token`.
- Malformed JSON returns `invalid_credential`.
- JSON without a token returns `missing_token`.

## Current Nerver API Usage

Supported modes:

- `short` -> `/api/v1/pix-short`
- `business` -> `/api/v1/pix-business`
- `long` -> `/api/v1/pix`

Configuration:

| Config key | Environment variable | Default |
| --- | --- | --- |
| `nerver_api_base_url` | `NERVER_API_BASE_URL` | `https://cha.nerver.cc` |
| `nerver_api_timeout` | `NERVER_API_TIMEOUT` | `120` |
| `nerver_pix_short_token` | `NERVER_PIX_SHORT_TOKEN` | empty |
| `nerver_pix_business_token` | `NERVER_PIX_BUSINESS_TOKEN` | falls back to short token |

## Current Response States

- `success`
- `ckd_not_configured`
- `invalid_ckd`
- `missing_credential`
- `invalid_credential`
- `missing_token`
- `invalid_api_mode`
- `remote_error`
- `remote_failed`

Customer-safe remote failures:

- Exceptions from Nerver calls return `remote_error` with `Nerver PIX 接口调用失败，请稍后重试`.
- Nerver business failures return `remote_failed` with `Nerver PIX 返回失败，请稍后重试`.
- Customer response does not include remote `message` or `reason` fields that may contain an access token.

## Verification Commands

Use these commands after changes touching PXL/PIX:

```bash
python -m pytest tests/test_api_pix_gpt_plus.py -q
cd frontend
npm run build
```

Optional online smoke:

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"ckd":"TEST","credential":"token"}' \
  http://127.0.0.1:8000/api/pix-gpt-plus/client/open
```

Expected without matching CKD configuration: `ckd_not_configured` or `invalid_ckd`, not `401`.
