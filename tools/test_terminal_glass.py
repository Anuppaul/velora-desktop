"""Unit tests for Velora's optional, non-destructive Ptyxis terminal styling."""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("velora_terminal_glass.py")
spec = importlib.util.spec_from_file_location("velora_terminal_glass", SCRIPT)
terminal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(terminal)


class FakePtyxis:
    profile = "98b8e52b9af866698178242d6907dd24"

    def __init__(self, opacity=1.0, explicit=True):
        self.opacity = opacity
        self.explicit = explicit
        self.calls = []
        self.profile_spec = terminal.profile_schema(self.profile)

    def run(self, args, *, allow_failure=False):
        self.calls.append(args)
        if args == ["gsettings", "get", terminal.APP_SCHEMA, "default-profile-uuid"]:
            return repr(self.profile)
        if args == ["gsettings", "list-keys", self.profile_spec]:
            return "opacity\npalette"
        if args == ["gsettings", "get", self.profile_spec, "opacity"]:
            return str(self.opacity)
        if len(args) >= 4 and args[:3] == [
            "gsettings", "set", self.profile_spec
        ] and args[3] == "opacity":
            self.opacity = float(args[4])
            self.explicit = True
            return ""
        if args == ["gsettings", "reset", self.profile_spec, "opacity"]:
            self.opacity = 1.0
            self.explicit = False
            return ""
        raise AssertionError(f"Unexpected GSettings command: {args!r}")


class TerminalGlassTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "state" / "terminal-glass.json"
        self.ptyxis = FakePtyxis()
        self.run_patch = patch.object(
            terminal, "run_command", side_effect=self.ptyxis.run
        )
        self.which_patch = patch.object(
            terminal.shutil, "which", return_value="/usr/bin/gsettings"
        )
        self.default_patch = patch.object(
            terminal, "original_is_default", return_value=False
        )
        self.run_patch.start()
        self.which_patch.start()
        self.default_patch.start()
        self.addCleanup(self.run_patch.stop)
        self.addCleanup(self.which_patch.stop)
        self.addCleanup(self.default_patch.stop)

    def test_default_profile_and_opaque_start(self):
        profile, spec, value = terminal.read_profile()
        self.assertEqual(profile, FakePtyxis.profile)
        self.assertEqual(spec, self.ptyxis.profile_spec)
        self.assertEqual(value, 1.0)
        self.assertFalse(self.path.exists())

    def test_opt_in_then_exact_restore(self):
        terminal.apply(None, self.path, 0.88)
        self.assertAlmostEqual(self.ptyxis.opacity, 0.88)
        record = json.loads(self.path.read_text())
        self.assertEqual(record["before"], 1.0)
        self.assertEqual(record["applied"], 0.88)
        self.assertEqual(record["profile"], FakePtyxis.profile)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        terminal.restore(self.path)
        self.assertAlmostEqual(self.ptyxis.opacity, 1.0)
        self.assertFalse(self.path.exists())

    def test_repeat_apply_retains_original(self):
        terminal.apply(None, self.path, 0.88)
        terminal.apply(None, self.path, 0.88)
        terminal.apply(None, self.path, 0.84)
        self.assertEqual(json.loads(self.path.read_text())["before"], 1.0)
        self.assertEqual(json.loads(self.path.read_text())["applied"], 0.84)
        terminal.restore(self.path)
        self.assertEqual(self.ptyxis.opacity, 1.0)

    def test_restore_can_reset_original_default(self):
        terminal.original_is_default = lambda _: True
        terminal.apply(None, self.path, 0.88)
        terminal.restore(self.path)
        self.assertFalse(self.ptyxis.explicit)
        self.assertEqual(self.ptyxis.opacity, 1.0)

    def test_original_is_not_overwritten_by_external_changes(self):
        terminal.apply(None, self.path, 0.88)
        self.ptyxis.opacity = 0.71  # changed by user after applying
        with self.assertRaisesRegex(RuntimeError, "changed outside"):
            terminal.apply(None, self.path, 0.90)
        with self.assertRaisesRegex(RuntimeError, "changed outside"):
            terminal.restore(self.path)
        self.assertAlmostEqual(self.ptyxis.opacity, 0.71)
        terminal.restore(self.path, force=True)
        self.assertAlmostEqual(self.ptyxis.opacity, 1.0)

    def test_refuses_unsafe_profile(self):
        for bad in ["", "../bad", "xyz/bar", "$(whoami)", "x"*129]:
            with self.subTest(bad=bad), self.assertRaises(RuntimeError):
                terminal.profile_schema(bad)
        for raw in ["''", "None", "42", "'../escape'"]:
            with self.subTest(raw=raw), self.assertRaises(RuntimeError):
                terminal.parse_profile(raw)

    def test_refuses_bad_opacity_and_nan(self):
        for value in [0, 0.3, 0.99, float("nan"), float("inf")]:
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                terminal.apply(None, self.path, value)
        self.assertFalse(self.path.exists())
        self.assertEqual(self.ptyxis.opacity, 1.0)

    def test_non_ptyxis_schema_is_refused_without_mutation(self):
        self.ptyxis.run = lambda a, **k: (
            "no-such-key" if a[1] == "list-keys"
            else repr(FakePtyxis.profile)
        )
        # patch side-effect captured a bound method; use a fresh patch here.
        with patch.object(terminal, "run_command", side_effect=self.ptyxis.run):
            with self.assertRaisesRegex(RuntimeError, "does not expose"):
                terminal.apply(None, self.path, 0.88)
        self.assertFalse(self.path.exists())

    def test_corrupt_backup_is_not_destroyed(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{corrupt")
        with self.assertRaisesRegex(RuntimeError, "unreadable"):
            terminal.apply(None, self.path, 0.88)
        self.assertEqual(self.path.read_text(), "{corrupt")

    def test_restore_without_backup_noop(self):
        terminal.restore(self.path)
        self.assertEqual(self.ptyxis.opacity, 1.0)

    def test_status_does_not_write(self):
        with patch.object(terminal, "identify_terminal", return_value="ptyxis"):
            terminal.status(None, self.path)
        self.assertFalse(any(
            c[1] in ("set", "reset") for c in self.ptyxis.calls
        ))
        self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
