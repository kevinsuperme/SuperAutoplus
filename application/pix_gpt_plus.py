from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import httpx
from sqlmodel import Session, select

from core.config_store import config_store
from core.account_graph import patch_account_graph
from core.db import AccountCredentialModel, AccountModel, engine
from core.platform_accounts import build_platform_account


NERVER_DEFAULT_BASE_URL = "https://cha.nerver.cc"

PIX_ENDPOINTS = {
    "short": "/api/v1/pix-short",
    "business": "/api/v1/pix-business",
    "long": "/api/v1/pix",
}

CLIENT_TOKEN_KEYS = ("access_token", "accessToken", "primary_token", "token")
CLIENT_EMAIL_KEYS = ("email", "email_address", "mail")


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


def _find_email_in_json(value: Any) -> str:
    if isinstance(value, dict):
        user = value.get("user")
        if isinstance(user, dict):
            email = _remote_text(user.get("email"))
            if "@" in email:
                return email
        for key in CLIENT_EMAIL_KEYS:
            email = _remote_text(value.get(key))
            if "@" in email:
                return email
        for item in value.values():
            email = _find_email_in_json(item)
            if email:
                return email
    if isinstance(value, list):
        for item in value:
            email = _find_email_in_json(item)
            if email:
                return email
    return ""


def _as_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _config_value(key: str, env_key: str, default: str = "") -> str:
    value = str(config_store.get(key, "") or "").strip()
    if value:
        return value
    return str(os.getenv(env_key, default) or "").strip()


def _remote_text(value: Any) -> str:
    return str(value or "").strip()


def _mask_secret(value: str, head: int = 6, tail: int = 4) -> str:
    text = _remote_text(value)
    if not text:
        return ""
    if len(text) <= head + tail + 3:
        return text
    return f"{text[:head]}...{text[-tail:]}"


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PixGptPlusService:
    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        account_ids = [
            int(item)
            for item in payload.get("chatgpt_account_ids") or []
            if int(item or 0) > 0
        ]
        if not account_ids:
            raise ValueError("请至少选择一个 ChatGPT 账号")

        mode = str(payload.get("api_mode") or "short").strip().lower()
        endpoint_path = PIX_ENDPOINTS.get(mode)
        if not endpoint_path:
            raise ValueError(f"不支持的 PIX API 模式: {mode}")

        promo_id = str(payload.get("promo_id") or payload.get("promoId") or "plus-1-month-free").strip()
        concurrency = min(max(_as_int(payload.get("concurrency"), 1), 1), 5)

        prepared: list[dict[str, Any]] = []
        with Session(engine) as session:
            for index, account_id in enumerate(account_ids):
                model = session.get(AccountModel, account_id)
                if not model:
                    prepared.append(
                        self._error_item(
                            index=index,
                            account_id=account_id,
                            email="",
                            reason="missing-account",
                            message="账号不存在",
                        )
                    )
                    continue
                if model.platform != "chatgpt":
                    prepared.append(
                        self._error_item(
                            index=index,
                            account_id=account_id,
                            email=model.email,
                            reason="invalid-platform",
                            message="只能选择 ChatGPT 账号",
                        )
                    )
                    continue
                account = build_platform_account(session, model)
                extra = dict(getattr(account, "extra", {}) or {})
                token = _remote_text(extra.get("access_token") or getattr(account, "token", ""))
                prepared.append(
                    {
                        "index": index,
                        "account_id": account_id,
                        "email": model.email,
                        "token": token,
                    }
                )

        results: list[dict[str, Any]] = []
        ready = [item for item in prepared if item.get("token")]
        results.extend([item for item in prepared if "token" not in item])
        results.extend(
            [
                self._error_item(
                    index=int(item["index"]),
                    account_id=int(item["account_id"]),
                    email=str(item.get("email") or ""),
                    reason="missing-token",
                    message="ChatGPT 账号缺少 access_token，无法生成 PIX",
                )
                for item in prepared
                if "token" in item and not item.get("token")
            ]
        )

        def run(item: dict[str, Any]) -> dict[str, Any]:
            body = {"token": item["token"], "promoId": promo_id}
            try:
                remote = self._call_remote_pix(endpoint_path=endpoint_path, body=body)
            except Exception as exc:  # noqa: BLE001 - surface remote API failure to UI
                return self._error_item(
                    index=int(item["index"]),
                    account_id=int(item["account_id"]),
                    email=str(item.get("email") or ""),
                    reason="remote-error",
                    message=f"Nerver PIX 接口调用失败: {exc}",
                )
            return self._success_or_remote_error_item(item=item, remote=remote)

        if ready:
            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = [executor.submit(run, item) for item in ready]
                for future in as_completed(futures):
                    results.append(future.result())

        results.sort(key=lambda item: int(item.get("index", 0)))
        for item in results:
            item.pop("index", None)

        success_count = sum(1 for item in results if item.get("ok") is True)
        error_count = len(results) - success_count
        return {
            "ok": success_count > 0 and error_count == 0,
            "mode": mode,
            "endpoint": endpoint_path,
            "success_count": success_count,
            "error_count": error_count,
            "results": results,
        }

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

        token, email, credential_error = self._extract_client_credential(credential)
        if credential_error == "invalid_credential":
            return _client_response(
                ok=False,
                status="invalid_credential",
                message="Session JSON 格式无效",
            )
        if not token:
            return _client_response(
                ok=False,
                status="missing_token",
                message="未能从 Access Token / Session JSON 中提取 token",
            )

        account_id, account_email = self._save_client_token_account(
            ckd=ckd,
            token=token,
            email=email,
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
        except Exception:  # noqa: BLE001 - expose safe remote failure to customer UI
            return _client_response(
                ok=False,
                status="remote_error",
                message="Nerver PIX 接口调用失败，请稍后重试",
                extra={
                    "mode": mode,
                    "endpoint": endpoint_path,
                    "account_id": account_id,
                    "email": account_email,
                },
            )

        result = self._client_result_from_remote(
            remote=remote,
            mode=mode,
            endpoint_path=endpoint_path,
            account_id=account_id,
            email=account_email,
        )
        self._patch_client_account_pix_result(
            account_id=account_id,
            remote=remote,
            status=str(result.get("status") or ""),
        )
        return result

    def _client_ckd_codes(self) -> set[str]:
        configured = _config_value("pix_client_ckd_codes", "PIX_CLIENT_CKD_CODES", "")
        return _split_codes(configured)

    def _extract_client_credential(self, credential: str) -> tuple[str, str, str]:
        raw = credential.strip()
        if not raw:
            return "", "", ""
        if raw.startswith("{") or raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except ValueError:
                return "", "", "invalid_credential"
            return _find_token_in_json(parsed), _find_email_in_json(parsed), ""
        return raw, "", ""

    def _save_client_token_account(
        self,
        *,
        ckd: str,
        token: str,
        email: str,
    ) -> tuple[int, str]:
        normalized_email = _remote_text(email).lower()
        if not normalized_email or "@" not in normalized_email:
            digest = sha256(_remote_text(ckd).encode("utf-8")).hexdigest()[:12]
            normalized_email = f"pxl-client-{digest}@local"

        with Session(engine) as session:
            model = session.exec(
                select(AccountModel).where(
                    AccountModel.platform == "chatgpt",
                    AccountModel.email == normalized_email,
                )
            ).first()
            if not model:
                model = AccountModel(
                    platform="chatgpt",
                    email=normalized_email,
                    password="",
                    user_id="",
                )
                session.add(model)
                session.commit()
                session.refresh(model)

            summary_updates = {
                "source": "pxl-plus-client",
                "client_source": "pxl-plus-client",
                "ckd_mask": _mask_secret(ckd),
                "token_saved": True,
                "token_saved_at": _utc_iso(),
                "chips": ["PXL 客户页"],
            }
            patch_account_graph(
                session,
                model,
                lifecycle_status="registered",
                primary_token=token,
                summary_updates=summary_updates,
            )
            credential = session.exec(
                select(AccountCredentialModel).where(
                    AccountCredentialModel.account_id == int(model.id or 0),
                    AccountCredentialModel.key == "access_token",
                )
            ).first()
            if credential:
                credential.source = "pxl-plus-client"
                credential.set_metadata(
                    {
                        "source": "pxl-plus-client",
                        "ckd_mask": _mask_secret(ckd),
                        "saved_at": _utc_iso(),
                    }
                )
                session.add(credential)
            session.commit()
            session.refresh(model)
            return int(model.id or 0), normalized_email

    def _patch_client_account_pix_result(
        self,
        *,
        account_id: int,
        remote: dict[str, Any],
        status: str,
    ) -> None:
        if account_id <= 0:
            return
        with Session(engine) as session:
            model = session.get(AccountModel, account_id)
            if not model:
                return
            patch_account_graph(
                session,
                model,
                summary_updates={
                    "source": "pxl-plus-client",
                    "client_source": "pxl-plus-client",
                    "last_pix_status": status,
                    "last_pix_request_id": _remote_text(remote.get("request_id")),
                    "last_pix_updated_at": _utc_iso(),
                    "cashier_url": _remote_text(
                        remote.get("pix_hosted_url")
                        or remote.get("stripe_hosted_url")
                    ),
                },
            )
            session.commit()

    def _client_result_from_remote(
        self,
        *,
        remote: dict[str, Any],
        mode: str,
        endpoint_path: str,
        account_id: int = 0,
        email: str = "",
    ) -> dict[str, Any]:
        ok = bool(remote.get("ok"))
        status = "success" if ok else "remote_failed"
        if ok:
            return _client_response(
                ok=True,
                status=status,
                message="PIX 已生成",
                extra={
                    "mode": mode,
                    "endpoint": endpoint_path,
                    "account_id": account_id,
                    "email": email,
                    "reason": "ok",
                    "pix_qr_data": _remote_text(remote.get("pix_qr_data")),
                    "pix_qr_image_url": _remote_text(remote.get("pix_qr_image_url")),
                    "pix_hosted_url": _remote_text(remote.get("pix_hosted_url")),
                    "stripe_hosted_url": _remote_text(remote.get("stripe_hosted_url")),
                    "pix_expires_iso": _remote_text(remote.get("pix_expires_iso")),
                    "request_id": _remote_text(remote.get("request_id")),
                },
            )
        return _client_response(
            ok=False,
            status=status,
            message="Nerver PIX 返回失败，请稍后重试",
            extra={
                "mode": mode,
                "endpoint": endpoint_path,
                "account_id": account_id,
                "email": email,
                "reason": "remote_failed",
                "request_id": _remote_text(remote.get("request_id")),
            },
        )

    def _call_remote_pix(self, *, endpoint_path: str, body: dict[str, Any]) -> dict[str, Any]:
        base_url = _config_value(
            "nerver_api_base_url",
            "NERVER_API_BASE_URL",
            NERVER_DEFAULT_BASE_URL,
        ).rstrip("/")
        timeout = float(
            _config_value("nerver_api_timeout", "NERVER_API_TIMEOUT", "120") or "120"
        )
        auth_token = _config_value("nerver_pix_short_token", "NERVER_PIX_SHORT_TOKEN", "")
        if endpoint_path.startswith("/api/v1/pix-business"):
            auth_token = _config_value("nerver_pix_business_token", "NERVER_PIX_BUSINESS_TOKEN", auth_token)

        headers = {"content-type": "application/json"}
        if auth_token:
            headers["authorization"] = f"Bearer {auth_token}"

        response = httpx.post(
            f"{base_url}{endpoint_path}",
            json=body,
            headers=headers,
            timeout=timeout,
        )
        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}") from exc
        if not response.is_success:
            message = data.get("message") or data.get("error") or data.get("reason") or response.reason_phrase
            raise RuntimeError(f"HTTP {response.status_code}: {message}")
        if not isinstance(data, dict):
            raise RuntimeError("远端返回不是 JSON object")
        return data

    @staticmethod
    def _error_item(
        *,
        index: int,
        account_id: int,
        email: str,
        reason: str,
        message: str,
    ) -> dict[str, Any]:
        return {
            "index": index,
            "account_id": account_id,
            "email": email,
            "ok": False,
            "reason": reason,
            "message": message,
        }

    def _success_or_remote_error_item(
        self,
        *,
        item: dict[str, Any],
        remote: dict[str, Any],
    ) -> dict[str, Any]:
        ok = bool(remote.get("ok"))
        reason = _remote_text(remote.get("reason")) or ("ok" if ok else "unknown")
        result = {
            "index": int(item["index"]),
            "account_id": int(item["account_id"]),
            "email": str(item.get("email") or ""),
            "ok": ok,
            "reason": reason,
            "message": _remote_text(remote.get("message")),
            "mode": _remote_text(remote.get("mode")),
            "pix_qr_data": _remote_text(remote.get("pix_qr_data")),
            "pix_qr_image_url": _remote_text(remote.get("pix_qr_image_url")),
            "pix_hosted_url": _remote_text(remote.get("pix_hosted_url")),
            "stripe_hosted_url": _remote_text(remote.get("stripe_hosted_url")),
            "pix_expires_at": remote.get("pix_expires_at"),
            "pix_expires_iso": _remote_text(remote.get("pix_expires_iso")),
            "setup_intent_id": _remote_text(remote.get("setup_intent_id")),
            "pm_id": _remote_text(remote.get("pm_id")),
            "session_id": _remote_text(remote.get("session_id")),
            "attempts": remote.get("attempts"),
            "attempts_log": remote.get("attempts_log") or [],
            "persona": remote.get("persona") or {},
            "request_id": _remote_text(remote.get("request_id")),
            "duration_ms": remote.get("duration_ms"),
            "remote": remote,
        }
        if not ok and not result["message"]:
            result["message"] = f"Nerver PIX 返回失败: {reason}"
        return result
