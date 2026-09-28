"""Health / readiness endpoint tests."""
from __future__ import annotations


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("ok") is True


def test_ready(client):
    resp = client.get("/api/ready")
    assert resp.status_code == 200


def test_ready_returns_503_when_runtime_is_not_ready(client, monkeypatch):
    from api import health as health_api

    monkeypatch.setattr(
        health_api.service,
        "readiness",
        lambda: {"ok": False, "database": {"ok": False}},
    )
    resp = client.get("/api/ready")
    assert resp.status_code == 503
    assert resp.json()["ok"] is False


def test_public_logo_is_served_as_an_image(client):
    resp = client.get("/superautoplus-logo.png")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert len(resp.content) > 1000
