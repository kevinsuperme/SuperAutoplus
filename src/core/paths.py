"""Shared filesystem paths for source and bundled runtime modes."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def project_root() -> Path:
    """Return the repository/runtime root, not the ``src`` package directory."""
    override = os.getenv("SUPERAUTOPLUS_ROOT") or os.getenv("ACCOUNT_MANAGER_ROOT")
    if override:
        return Path(override).resolve()
    if getattr(sys, "frozen", False):
        return Path.cwd()
    return Path(__file__).resolve().parents[2]


def runtime_data_dir() -> Path:
    data_dir = Path(os.getenv("ACCOUNT_MANAGER_DATA_DIR") or project_root() / "data")
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir
