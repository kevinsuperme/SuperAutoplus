from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_remote_deploy_script_has_required_safety_gates() -> None:
    script = ROOT / "scripts" / "deploy-remote.ps1"
    assert script.is_file()

    text = script.read_text(encoding="utf-8")
    assert "129.204.48.16" in text
    assert "ubuntu" in text
    assert "codex_abaiautoplus_129_204_48_16" in text
    assert "BEGIN OPENSSH PRIVATE KEY" not in text
    assert "[switch]$DryRun" in text
    assert "[switch]$SkipLocalChecks" in text
    assert "Invoke-LocalApiCheck" in text
    assert "[switch]$RunElectronChecks" in text
    assert "[switch]$UseExistingImageRuntime" in text
    assert "Backup-RemoteDeployment" in text
    assert "sudo tar -C \"$remote_dir\"" in text
    assert "UseExistingImageRuntime requires frontend build output at static/index.html." in text
    assert "Install-RemotePackageWithExistingImageRuntime" in text
    assert "superautoplus-app:pre-$release_id" in text
    assert "docker compose" in text
    assert "remote-smoke.ps1" in text
    assert "git -C $RepoRoot -c core.quotePath=false ls-files --cached --others --exclude-standard" in text
    assert "Copy-Item -LiteralPath $source" in text
    assert "-C\", $stagingRoot" in text
    assert "No files selected for deployment package." in text


def test_remote_deploy_script_normalizes_bash_stdin_to_lf() -> None:
    script = ROOT / "scripts" / "deploy-remote.ps1"
    text = script.read_text(encoding="utf-8")

    assert "$Script -replace '\\r\\n?', \"`n\"" in text
    assert "$normalizedScript | & ssh @args" in text


def test_remote_smoke_script_covers_release_gate_endpoints() -> None:
    script = ROOT / "scripts" / "remote-smoke.ps1"
    assert script.is_file()

    text = script.read_text(encoding="utf-8")
    for expected in (
        "/api/health",
        "/api/ready",
        "/pxl-plus",
        "/luckmail-code",
        "/api/luckmail/client/code",
        "/api/pix-gpt-plus/client/open",
        "invalid_ticket_format",
        "ckd_not_configured",
    ):
        assert expected in text
    assert "artifacts" in text
    assert "ConvertTo-Json" in text
