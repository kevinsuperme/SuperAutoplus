param(
    [string]$HostName = "129.204.48.16",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\codex_abaiautoplus_129_204_48_16",
    [string]$RemoteBaseUrl = "http://127.0.0.1:8000",
    [string]$ArtifactsDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "artifacts"),
    [int]$TimeoutSec = 15,
    [switch]$NoExitOnFailure
)

$ErrorActionPreference = "Stop"

function Assert-File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required file not found: $Path"
    }
}

function Invoke-RemotePython {
    param([string]$Script)
    $target = "$User@$HostName"
    $sshArgs = @(
        "-i", $KeyPath,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        $target,
        "python3", "-", $RemoteBaseUrl, [string]$TimeoutSec
    )
    $Script | & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Remote smoke command failed with exit code $LASTEXITCODE"
    }
}

Assert-File -Path $KeyPath
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

$python = @'
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request


base = sys.argv[1].rstrip("/")
timeout = int(sys.argv[2])
checks: list[dict] = []


def decode_json(body: str) -> dict:
    try:
        data = json.loads(body)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def request(name: str, method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return {
                "name": name,
                "method": method,
                "path": path,
                "http_status": response.status,
                "content_type": response.headers.get("Content-Type", ""),
                "body_preview": body[:500],
                "json": decode_json(body),
                "transport_ok": True,
            }
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {
            "name": name,
            "method": method,
            "path": path,
            "http_status": exc.code,
            "content_type": exc.headers.get("Content-Type", ""),
            "body_preview": body[:500],
            "json": decode_json(body),
            "transport_ok": True,
        }
    except Exception as exc:
        return {
            "name": name,
            "method": method,
            "path": path,
            "http_status": 0,
            "content_type": "",
            "body_preview": "",
            "json": {},
            "transport_ok": False,
            "error": repr(exc),
        }


def expect(check: dict, passed: bool, detail: str) -> None:
    check["passed"] = bool(passed)
    check["expectation"] = detail
    checks.append(check)


health = request("health", "GET", "/api/health")
expect(
    health,
    health["http_status"] == 200 and health["json"].get("ok") is True,
    "/api/health returns 200 and ok=true",
)

ready = request("ready", "GET", "/api/ready")
expect(
    ready,
    ready["http_status"] == 200 and ready["json"].get("ok") is True,
    "/api/ready returns 200 and ok=true",
)

pxl_page = request("pxl-plus page", "GET", "/pxl-plus")
expect(
    pxl_page,
    pxl_page["http_status"] == 200 and "<!doctype html" in pxl_page["body_preview"].lower(),
    "/pxl-plus serves the SPA HTML",
)

luckmail_page = request("luckmail-code page", "GET", "/luckmail-code")
expect(
    luckmail_page,
    luckmail_page["http_status"] == 200 and "<!doctype html" in luckmail_page["body_preview"].lower(),
    "/luckmail-code serves the SPA HTML",
)

luckmail_invalid = request(
    "luckmail invalid ticket",
    "POST",
    "/api/luckmail/client/code",
    {"ticket": "bad"},
)
expect(
    luckmail_invalid,
    luckmail_invalid["json"].get("status") == "invalid_ticket_format",
    "LuckMail invalid ticket returns invalid_ticket_format and does not require admin auth",
)

pxl_invalid = request(
    "pxl invalid ckd",
    "POST",
    "/api/pix-gpt-plus/client/open",
    {"ckd": "TEST", "credential": "token"},
)
expect(
    pxl_invalid,
    pxl_invalid["json"].get("status") in {"ckd_not_configured", "invalid_ckd"},
    "PXL invalid CKD returns ckd_not_configured or invalid_ckd and does not serve admin UI",
)

report = {
    "base_url": base,
    "ok": all(item.get("passed") for item in checks),
    "checks": checks,
}
print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))
'@

$raw = Invoke-RemotePython -Script $python
$report = $raw | ConvertFrom-Json

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artifact = Join-Path $ArtifactsDir "remote-smoke-$stamp.json"
$report | ConvertTo-Json -Depth 20 | Set-Content -Path $artifact -Encoding UTF8

Write-Output "Remote smoke report: $artifact"
foreach ($check in $report.checks) {
    $state = if ($check.passed) { "PASS" } else { "FAIL" }
    Write-Output ("[{0}] {1} {2} {3} -> {4} ({5})" -f $state, $check.method, $check.path, $check.name, $check.http_status, $check.expectation)
}

if (-not $report.ok -and -not $NoExitOnFailure) {
    exit 1
}
