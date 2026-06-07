from __future__ import annotations

import pytest

from services import solver_manager


def test_start_skips_all_solver_work_when_disabled(monkeypatch):
    monkeypatch.setenv("ACCOUNT_MANAGER_DISABLE_SOLVER", "1")
    monkeypatch.setattr(
        solver_manager,
        "is_running",
        lambda: pytest.fail("disabled solver should not probe the solver port"),
    )
    monkeypatch.setattr(
        solver_manager,
        "_ensure_camoufox_browser",
        lambda: pytest.fail("disabled solver should not check or install Camoufox"),
    )
    monkeypatch.setattr(
        solver_manager.subprocess,
        "Popen",
        lambda *args, **kwargs: pytest.fail("disabled solver should not spawn a process"),
    )

    solver_manager.start()


def test_start_async_does_not_create_thread_when_disabled(monkeypatch):
    monkeypatch.setenv("ACCOUNT_MANAGER_DISABLE_SOLVER", "true")
    monkeypatch.setattr(
        solver_manager.threading,
        "Thread",
        lambda *args, **kwargs: pytest.fail("disabled solver should not create a startup thread"),
    )

    solver_manager.start_async()
