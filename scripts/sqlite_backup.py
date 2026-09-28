#!/usr/bin/env python3
"""Backup or restore a SQLite database using SQLite's online backup API.

Stop the application containers before restoring. The script refuses to
overwrite an existing target unless --force is supplied.
"""

from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import shutil
import sqlite3
import sys


def check_integrity(path: pathlib.Path) -> None:
    conn = sqlite3.connect(path)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()
    finally:
        conn.close()
    if not result or result[0] != "ok":
        raise RuntimeError(f"SQLite integrity check failed for {path}: {result}")


def backup(source: pathlib.Path, output_dir: pathlib.Path) -> pathlib.Path:
    if not source.exists():
        raise FileNotFoundError(source)
    check_integrity(source)
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    target = output_dir / f"{source.stem}-{stamp}.db"
    src = sqlite3.connect(source)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    check_integrity(target)
    return target


def restore(source: pathlib.Path, target: pathlib.Path, force: bool) -> None:
    if not source.exists():
        raise FileNotFoundError(source)
    if target.exists() and not force:
        raise FileExistsError(f"Refusing to overwrite {target}; use --force")
    check_integrity(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".restore-tmp")
    if temporary.exists():
        temporary.unlink()
    src = sqlite3.connect(source)
    dst = sqlite3.connect(temporary)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    check_integrity(temporary)
    if target.exists():
        backup_target = target.with_suffix(target.suffix + ".before-restore")
        shutil.copy2(target, backup_target)
    temporary.replace(target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    backup_parser = sub.add_parser("backup")
    backup_parser.add_argument("source", type=pathlib.Path)
    backup_parser.add_argument("output_dir", type=pathlib.Path)

    restore_parser = sub.add_parser("restore")
    restore_parser.add_argument("source", type=pathlib.Path)
    restore_parser.add_argument("target", type=pathlib.Path)
    restore_parser.add_argument("--force", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "backup":
            print(backup(args.source, args.output_dir))
        else:
            restore(args.source, args.target, args.force)
            print(f"restored {args.source} -> {args.target}")
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
