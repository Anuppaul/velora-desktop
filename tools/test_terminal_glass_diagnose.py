"""Regression tests for read-only GNOME 50 / Ptyxis Terminal Glass diagnosis."""
from __future__ import annotations

import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import velora_terminal_diagnose as diag


class TerminalGlassDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.extension = self.root / "installed"
        self.repo = self.root / "checkout"
        (self.extension / "schemas").mkdir(parents=True)
        (self.extension / "schemas" / "gschemas.compiled").write_bytes(b"mock")
        (self.repo / "gnome-shell" / diag.EXTENSION_UUID).mkdir(parents=True)

    def settings(self, *, enabled=True, status="Masked: 1 Ptyxis window(s)",
                 requested="abc", loaded="abc", error=""):
        return {
            "runtime-revision": requested,
            "runtime-loaded-revision": loaded,
            "runtime-error": error,
            "terminal-backdrop-blur-enabled": enabled,
            "terminal-backdrop-blur-radius": 18,
            "terminal-backdrop-blur-status": status,
        }

    def render(self, settings, opacity=0.78):
        output = io.StringIO()
        with patch.object(diag, "get_schema_values", return_value=settings), \
             patch.object(diag, "read_profile",
                          return_value=("existing-profile", "spec", opacity)), \
             patch.object(diag, "shell_lines",
                          side_effect=AssertionError("logs skipped")), \
             contextlib.redirect_stdout(output):
            diag.diagnose(self.extension, self.repo, with_logs=False)
        return output.getvalue()

    def test_disabled_feature_is_explained_without_changes(self):
        text = self.render(self.settings(enabled=False))
        self.assertIn("VERDICT: Blur is OFF.", text)
        self.assertIn("Quick Settings Brightness", text)
        self.assertIn("No settings or files were modified", text)
        self.assertIn("terminal-backdrop-blur-enabled: False", text)

    def test_opaque_ptyxis_profile_is_identified(self):
        text = self.render(self.settings(), opacity=1.0)
        self.assertIn("effectively opaque", text)
        self.assertIn("blur UNDER its native surface", text)

    def test_masked_is_not_visual_success(self):
        text = self.render(self.settings(), opacity=0.78)
        self.assertIn("NOT visible pixels", text)
        self.assertIn("only", text)
        self.assertIn("outside/shadow", text)

    def test_error_and_hot_swap_mismatch_are_highlighted(self):
        text = self.render(self.settings(
            requested="abc", loaded="old", error="Failed import",
            status="Unavailable: create-output-mask"
        ))
        self.assertIn("Requested and loaded", text)
        self.assertIn("GNOME runtime has reported a load error", text)
        self.assertIn("compositor rejected", text)

    def test_invalid_revision_cannot_escape_extension_tree(self):
        for bad in ("../etc", "foo/bar", "xx" * 90,
                    "ü", "/tmp/fake", "hijack\\path"):
            self.assertIsNone(diag.loaded_module_dir(self.extension, bad))
        self.assertEqual(diag.loaded_module_dir(self.extension, "base"),
                         self.extension)
        self.assertEqual(diag.loaded_module_dir(self.extension, "abc"),
                         self.extension / "runtime-revisions" / "abc")

    def test_source_and_live_runtime_hash_comparison(self):
        source = self.repo / "gnome-shell" / diag.EXTENSION_UUID
        loaded = self.extension / "runtime-revisions" / "abc"
        loaded.mkdir(parents=True)
        for name in diag.TERMINAL_MODULES:
            (source / name).write_text("// code: " + name)
            (loaded / name).write_text("// code: " + name)
        details = diag.compare_installed_modules(self.extension, "abc", self.repo)
        self.assertTrue(all("MATCH" in detail for _, detail in details))
        (loaded / "terminalBlurMask.js").write_text("// stale")
        details = diag.compare_installed_modules(self.extension, "abc", self.repo)
        self.assertIn("MISMATCH", details[1][1])
        (loaded / "terminalBlurMask.js").unlink()
        (loaded / "terminalBlurMask.js").symlink_to(source / "terminalBlurMask.js")
        details = diag.compare_installed_modules(self.extension, "abc", self.repo)
        self.assertIn("unsafe", details[1][1])

    def test_scoped_read_only_gsettings(self):
        values = self.settings()
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            self.assertEqual(args[:3],
                             ["gsettings", "get", diag.SCHEMA_NAME])
            self.assertEqual(kwargs["env"]["GSETTINGS_SCHEMA_DIR"],
                             str(self.extension / "schemas"))
            value = values[args[3]]
            if isinstance(value, bool):
                return SimpleNamespace(returncode=0, stdout=str(value).lower())
            return SimpleNamespace(returncode=0, stdout=repr(value))
        with patch.object(diag.shutil, "which",
                          return_value="/usr/bin/gsettings"), \
             patch.object(diag.subprocess, "run", side_effect=run):
            found = diag.get_schema_values(self.extension)
        self.assertEqual(found, values)
        self.assertEqual(len(calls), len(diag.SETTINGS_KEYS))
        self.assertTrue(all(c[0][1] == "get" for c in calls))

    def test_journal_only_reports_terminal_owned_logs(self):
        lines = [
            "other program error",
            "[Velora][TerminalBlur] create-output-mask failed",
            "[Velora][Dock] unrelated diagnostics",
            "[Velora][TerminalBlur] mapped native Ptyxis window",
        ]
        with patch.object(diag.shutil, "which",
                          return_value="/usr/bin/journalctl"), \
             patch.object(diag.subprocess, "run",
                return_value=SimpleNamespace(
                    returncode=0, stdout="\\n".join(lines))):
            self.assertEqual(len(diag.shell_lines(12)), 2)
            self.assertTrue(all(
                "[Velora][TerminalBlur]" in text
                for text in diag.shell_lines(12)
            ))


if __name__ == "__main__":
    unittest.main()
