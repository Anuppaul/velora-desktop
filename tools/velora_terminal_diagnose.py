#!/usr/bin/env python3
"""Read-only on-device diagnosis for Velora Ptyxis Terminal Glass.

Reports *live* GNOME extension settings, loaded revision and installed shader
content, Ptyxis native alpha, and recent Shell errors. Does not modify
GSettings, GNOME Shell, graphics drivers, files or terminal profiles.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

from velora_terminal_glass import read_profile

EXTENSION_UUID = "velora@wonderer.tech"
SCHEMA_NAME = "org.gnome.shell.extensions.velora"
TERMINAL_MODULES = ("terminalBackdropBlur.js", "terminalBlurMask.js")
SETTINGS_KEYS = (
    "runtime-revision",
    "runtime-loaded-revision",
    "runtime-error",
    "terminal-backdrop-blur-enabled",
    "terminal-backdrop-blur-radius",
    "terminal-backdrop-blur-status",
)


def extension_dir(home: Path | None = None) -> Path:
    """Match GLib.get_user_data_dir without using global schema changes."""
    if home is not None:
        return home / ".local" / "share" / "gnome-shell" / "extensions" / EXTENSION_UUID
    xdg = os.environ.get("XDG_DATA_HOME", "")
    user_data = Path(xdg).expanduser() if xdg else Path.home() / ".local" / "share"
    return user_data / "gnome-shell" / "extensions" / EXTENSION_UUID


def get_schema_values(directory: Path) -> dict[str, object] | None:
    schemas = directory / "schemas" / "gschemas.compiled"
    if not schemas.is_file() or not shutil.which("gsettings"):
        return None

    environment = dict(os.environ, GSETTINGS_SCHEMA_DIR=str(schemas.parent))
    values: dict[str, object] = {}
    for key in SETTINGS_KEYS:
        try:
            result = subprocess.run(
                ["gsettings", "get", SCHEMA_NAME, key],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
                env=environment,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        if result.returncode != 0:
            return None
        raw = result.stdout.strip()
        if key == "terminal-backdrop-blur-enabled":
            values[key] = {"true": True, "false": False}.get(raw, None)
        elif key == "terminal-backdrop-blur-radius":
            try:
                values[key] = int(raw)
            except ValueError:
                values[key] = None
        else:
            try:
                value = ast.literal_eval(raw)
                values[key] = value if isinstance(value, str) else raw
            except (ValueError, SyntaxError):
                values[key] = raw
    return values


def digest(path: Path) -> str | None:
    """Hash normal files only. Never follow a symlinked installed runtime."""
    if not path.is_file() or path.is_symlink():
        return None
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    except OSError:
        return None


def loaded_module_dir(directory: Path, loaded_revision: str) -> Path | None:
    """Never let untrusted GSettings revision strings escape extension tree."""
    if loaded_revision in ("", "base"):
        return directory
    if (
        len(loaded_revision) > 128 or
        not loaded_revision.isascii() or
        not all(c.isalnum() or c in "-_" for c in loaded_revision)
    ):
        return None
    return directory / "runtime-revisions" / loaded_revision


def compare_installed_modules(directory: Path, loaded_revision: str,
                              repo_root: Path) -> list[tuple[str, str]]:
    result = []
    installed = loaded_module_dir(directory, loaded_revision)
    if installed is None:
        return [(name, "invalid loaded runtime revision") for name in TERMINAL_MODULES]
    for name in TERMINAL_MODULES:
        local = digest(repo_root / "gnome-shell" / EXTENSION_UUID / name)
        active = digest(installed / name)
        if local is None:
            detail = "source module not found"
        elif active is None:
            detail = "loaded module missing or unsafe path"
        elif local == active:
            detail = "MATCH (checkout and active runtime)"
        else:
            detail = "MISMATCH (active runtime differs from checkout)"
        result.append((name, detail))
    return result


def shell_lines(max_lines: int = 12) -> list[str]:
    """Only explicitly Velora-owned TerminalBlur journal messages."""
    if not shutil.which("journalctl"):
        return []
    try:
        result = subprocess.run(
            ["journalctl", "--user", "-b", "--no-pager", "-o", "cat", "-n", "500"],
            capture_output=True, text=True, check=False, timeout=8,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    lines = [
        line.strip()[:500] for line in result.stdout.splitlines()
        if "[Velora][TerminalBlur]" in line
    ]
    return lines[-max_lines:]


def diagnose(directory: Path, repo_root: Path, *, with_logs: bool = True) -> None:
    print("Velora Ptyxis Terminal Glass — read-only runtime diagnosis")
    print("Session:", os.environ.get("XDG_SESSION_TYPE", "unknown"))
    print("Schema directory:", directory / "schemas")

    settings = get_schema_values(directory)
    if not settings:
        print("BLOCKER: Installed Velora private GSettings schema unavailable.")
        print("Run: bash gnome-shell/install.sh")
        return

    for key in SETTINGS_KEYS:
        print(f"{key}: {settings[key]}")

    requested = settings["runtime-revision"]
    loaded = settings["runtime-loaded-revision"]
    if requested != loaded:
        print("BLOCKER: Requested and loaded GNOME runtime revisions differ.")
        print("Check the installer hot-swap output and runtime-error above.")

    if settings["runtime-error"]:
        print("BLOCKER: GNOME runtime has reported a load error.")

    try:
        profile, _, opacity = read_profile()
        print(f"Ptyxis default profile: {profile}")
        print(f"Ptyxis native background opacity: {opacity:.3f}")
    except RuntimeError as error:
        opacity = None
        print("Ptyxis profile unavailable:", error)

    if isinstance(loaded, str):
        for module, detail in compare_installed_modules(
            directory, loaded, repo_root
        ):
            print(f"Active {module}: {detail}")

    enabled = settings["terminal-backdrop-blur-enabled"]
    status = str(settings["terminal-backdrop-blur-status"])
    if enabled is False:
        print("VERDICT: Blur is OFF. This was previously disabled while")
        print("         Quick Settings Brightness was being fixed.")
        print("Enable it in Velora Preferences → Terminal → Real backdrop blur.")
    elif enabled is not True:
        print("VERDICT: Cannot read the actual blur enabled state.")
    elif opacity is not None and opacity >= 0.98:
        print("VERDICT: Ptyxis background is effectively opaque.")
        print("         A blur UNDER its native surface cannot be seen.")
        print("For a controlled test, use the existing opt-in profile tool.")
    elif status.startswith("Unavailable") or status.startswith("Paused"):
        print("VERDICT: The compositor rejected or paused the blur.")
        print("         Check the exact status and journal messages below.")
    elif status.startswith("Masked") or status.startswith("Attached"):
        print("VERDICT: Compositor actors report attachment, NOT visible pixels.")
        print("         Confirm whether Terminal interior blurs, or only")
        print("         its outside/shadow area does. If unchanged, inspect")
        print("         the actual shader/framebuffer rendering path.")
    else:
        print("VERDICT: No successful Ptyxis blur attachment confirmed.")
        print("         Open a Ptyxis window and inspect its active profile.")

    print("No settings or files were modified.")
    if with_logs:
        lines = shell_lines()
        print("Recent Velora TerminalBlur journal messages:")
        if lines:
            for line in lines:
                print("  " + line)
        else:
            print("  (none in recent user journal; Shell may log elsewhere)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--without-logs", action="store_true",
                        help="Skip reading GNOME Shell journal messages")
    arguments = parser.parse_args(argv)
    diagnose(
        extension_dir(),
        Path(__file__).resolve().parent.parent,
        with_logs=not arguments.without_logs,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
