#!/usr/bin/env python3
"""Opt-in Velora-inspired native Ptyxis terminal transparency.

Does not install fonts, modify global GTK themes, touch GNOME Shell, or
provide background blur. Requires an existing native Ptyxis GSettings profile.
"""
from __future__ import annotations

import argparse
import ast
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

APP_SCHEMA = "org.gnome.Ptyxis"
PROFILE_SCHEMA = "org.gnome.Ptyxis.Profile"
BACKUP_FILE = "terminal-glass.json"
DEFAULT_OPACITY = 0.88
PROFILE_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


def state_path() -> Path:
    base = os.environ.get("XDG_STATE_HOME")
    root = Path(base).expanduser() if base else Path.home() / ".local" / "state"
    return root / "velora-desktop" / BACKUP_FILE


def run_command(argv: list[str], *, allow_failure: bool = False) -> str:
    try:
        result = subprocess.run(
            argv, check=False, capture_output=True, text=True, timeout=8
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        if allow_failure:
            return ""
        raise RuntimeError(f"Cannot execute {argv[0]}: {exc}") from exc
    if result.returncode:
        if allow_failure:
            return ""
        detail = result.stderr.strip() or f"exit {result.returncode}"
        raise RuntimeError(f"{argv[0]} failed: {detail}")
    return result.stdout.strip()


def parse_profile(raw: str) -> str:
    try:
        value = ast.literal_eval(raw)
    except (ValueError, SyntaxError) as exc:
        raise RuntimeError("Invalid Ptyxis profile identifier from GSettings") from exc
    if not isinstance(value, str) or not PROFILE_PATTERN.fullmatch(value):
        raise RuntimeError("Unsafe or missing Ptyxis profile identifier")
    return value


def profile_schema(profile: str) -> str:
    if not PROFILE_PATTERN.fullmatch(profile):
        raise RuntimeError("Invalid profile identifier")
    return f"{PROFILE_SCHEMA}:/org/gnome/Ptyxis/Profiles/{profile}/"


def parse_opacity(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"Non-numeric Ptyxis opacity: {raw!r}") from exc
    if not math.isfinite(value) or not 0 <= value <= 1:
        raise RuntimeError(f"Out-of-range Ptyxis opacity: {raw!r}")
    return value


def read_profile(profile_override: str | None = None) -> tuple[str, str, float]:
    # A $TERM of xterm-256color does not identify a terminal application.
    if not shutil.which("gsettings"):
        raise RuntimeError("gsettings is missing; no settings were changed")
    if not profile_override:
        profile = parse_profile(run_command(
            ["gsettings", "get", APP_SCHEMA, "default-profile-uuid"]
        ))
    else:
        profile = profile_override
    spec = profile_schema(profile)
    keys = run_command(["gsettings", "list-keys", spec]).splitlines()
    if "opacity" not in keys:
        raise RuntimeError(
            f"Ptyxis profile {profile!r} does not expose an opacity key"
        )
    current = parse_opacity(run_command(["gsettings", "get", spec, "opacity"]))
    return profile, spec, current


def original_is_default(profile: str) -> bool | None:
    if not shutil.which("dconf"):
        return None
    key = f"/org/gnome/Ptyxis/Profiles/{profile}/opacity"
    # Empty output from 'dconf read' means no explicit override existed.
    try:
        result = subprocess.run(
            ["dconf", "read", key],
            check=False, capture_output=True, text=True, timeout=8
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    return not bool(result.stdout.strip())


def load_state(path: Path) -> dict | None:
    if not path.exists():
        return None
    if path.is_symlink() or not path.is_file():
        raise RuntimeError(f"Unsafe backup file: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        raise RuntimeError("Existing terminal backup is unreadable; refusing to overwrite") from exc
    if (
        data.get("version") != 1 or
        not isinstance(data.get("profile"), str) or
        not PROFILE_PATTERN.fullmatch(data["profile"]) or
        data.get("schema") != profile_schema(data["profile"])
    ):
        raise RuntimeError("Unexpected terminal backup data; refusing to overwrite")
    for key in ("before", "applied"):
        if not isinstance(data.get(key), (int, float)):
            raise RuntimeError("Invalid terminal backup opacity")
        parse_opacity(str(data[key]))
    if data.get("original_is_default") not in (True, False, None):
        raise RuntimeError("Invalid terminal backup reset marker")
    return data


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent.is_symlink():
        raise RuntimeError("Refusing symlinked state directory")
    fd, temporary = tempfile.mkstemp(
        prefix=".terminal-glass-", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            os.fchmod(out.fileno(), 0o600)
            json.dump(state, out, indent=2, sort_keys=True)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def roughly_equal(a: float, b: float) -> bool:
    return abs(a - b) <= 0.000001


def identify_terminal() -> str:
    """Best-effort process ancestry, not a guarantee of window ownership."""
    names = ("ptyxis", "gnome-terminal", "kgx", "ghostty",
             "kitty", "alacritty", "tilix", "konsole", "xfce4-terminal")
    pid = os.getppid()
    for _ in range(12):
        if pid <= 1:
            break
        proc = Path("/proc") / str(pid)
        try:
            command = (proc / "comm").read_text().strip().lower()
            if any(name in command for name in names):
                return command
            stat = (proc / "stat").read_text()
            # PID (comm) state PPID ... ; comm may contain spaces.
            tail = stat.rsplit(") ", 1)[1].split()
            pid = int(tail[1])
        except (OSError, ValueError, IndexError):
            break
    return "unknown (xterm-256color is a terminal capability, not an app name)"


def status(profile_override: str | None, path: Path) -> None:
    print("Velora Terminal Glass — read-only status")
    print(f"Detected terminal process: {identify_terminal()}")
    print(f"Session: {os.environ.get('XDG_SESSION_TYPE', 'unknown')}")
    print("Renderer: native terminal translucency ONLY; no wallpaper blur/refraction")
    backup = load_state(path)
    try:
        profile, _, current = read_profile(profile_override)
    except RuntimeError as exc:
        print(f"Ptyxis setting unavailable: {exc}")
    else:
        print(f"Ptyxis default/selected profile: {profile}")
        print(f"Current opacity: {current:.3f} ({(1-current)*100:.1f}% transparency)")
    if backup:
        print(f"Saved original opacity: {backup['before']:.3f}")
        print(f"Last applied opacity: {backup['applied']:.3f}")
        print(f"Backup: {path}")
    else:
        print("No Velora-managed terminal settings have been applied.")


def apply(profile_override: str | None, path: Path, opacity: float) -> None:
    if not 0.65 <= opacity <= 0.98:
        raise RuntimeError("Choose an opacity between 0.65 and 0.98 for readable text")
    profile, spec, current = read_profile(profile_override)
    existing = load_state(path)
    if existing and existing["profile"] != profile:
        raise RuntimeError(
            "An existing backup belongs to another profile. Restore it first."
        )
    if existing and not (
        roughly_equal(current, float(existing["applied"])) or
        roughly_equal(current, float(existing["before"]))
    ):
        raise RuntimeError(
            "Ptyxis opacity was changed outside Velora. Refusing to overwrite it."
        )
    if roughly_equal(current, opacity):
        print(f"Opacity is already {opacity:.3f}; no change required.")
        return
    if existing:
        record = {**existing, "applied": opacity}
    else:
        record = {
            "version": 1,
            "profile": profile,
            "schema": spec,
            "before": current,
            "applied": opacity,
            "original_is_default": original_is_default(profile),
        }
    # Persist recovery metadata BEFORE editing the user setting.
    save_state(path, record)
    run_command(["gsettings", "set", spec, "opacity", f"{opacity:.3f}"])
    print(f"Ptyxis profile {profile}: opacity {current:.3f} → {opacity:.3f}")
    print("No sudo, GNOME extension restart, or logout required.")
    print("If the terminal does not redraw, close and reopen Ptyxis.")
    print("This is translucency, not Velora's GPU blur/refraction.")


def restore(path: Path, *, force: bool = False) -> None:
    record = load_state(path)
    if not record:
        print("Nothing to restore; no Velora terminal backup exists.")
        return
    profile, spec, current = read_profile(record["profile"])
    if spec != record["schema"]:
        raise RuntimeError("Stored GSettings profile path mismatch")
    if not force and not (
        roughly_equal(current, float(record["applied"])) or
        roughly_equal(current, float(record["before"]))
    ):
        raise RuntimeError(
            "Opacity was changed outside Velora; use restore --force if intended."
        )
    if record["original_is_default"] is True:
        run_command(["gsettings", "reset", spec, "opacity"])
    else:
        run_command([
            "gsettings", "set", spec, "opacity", f"{record['before']:.6f}"
        ])
    path.unlink()
    print(f"Restored original Ptyxis profile {profile} opacity.")
    print("No logout or GNOME Shell restart required.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action", nargs="?", choices=("status", "apply", "restore"),
        default="status"
    )
    parser.add_argument("--profile", help="Optional existing Ptyxis profile ID")
    parser.add_argument(
        "--opacity", type=float, default=DEFAULT_OPACITY,
        help="0.65–0.98; default 0.88"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Allow restore when opacity was modified externally"
    )
    args = parser.parse_args()
    try:
        path = state_path()
        if args.action == "status":
            status(args.profile, path)
        elif args.action == "apply":
            if args.force:
                parser.error("--force is supported only for restore")
            apply(args.profile, path, args.opacity)
        else:
            restore(path, force=args.force)
        return 0
    except (OSError, RuntimeError) as exc:
        print(f"Velora Terminal Glass: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
