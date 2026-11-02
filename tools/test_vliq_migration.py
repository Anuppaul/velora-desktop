"""VLIQ UUID-change migration safety and rollback regression tests."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "gnome-shell" / "migrate_legacy_install.py"
spec = importlib.util.spec_from_file_location("vliq_migration", SCRIPT)
migration = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(migration)


class VLIQMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = self.root / "state"
        self.previous_dir = self.root / "previous-extension"
        self.previous_dir.mkdir()
        self.state = patch.object(migration, "state_root", return_value=self.store)
        self.previous = patch.object(migration, "old_extension_dir",
                                     return_value=self.previous_dir)
        self.state.start()
        self.previous.start()
        self.addCleanup(self.state.stop)
        self.addCleanup(self.previous.stop)

    def test_filter_preserves_actual_user_keys_not_running_shell_state(self):
        old = (
            "[/]\n"
            "orb-enabled=false\n"
            "dock-original-fixed=true\n"
            "dock-state-captured=true\n"
            "dock-extension-state-captured=true\n"
            "quick-soft-brightness=62\n"
            "terminal-backdrop-blur-enabled=true\n"
            "runtime-revision='abc'\n"
            "runtime-loaded-revision='abc'\n"
            "runtime-error='old error'\n"
            "wallpaper-runtime-status='old GPU state'\n"
            "app-preview-size=110\n"
        )
        clean = migration.filter_user_settings(old)
        for key in ("orb-enabled=false", "quick-soft-brightness=62",
                    "terminal-backdrop-blur-enabled=true", "app-preview-size=110"):
            self.assertIn(key, clean)
        for key in ("dock-original-", "dock-state-captured",
                    "dock-extension-state-captured", "runtime-revision",
                    "runtime-loaded-revision", "runtime-error",
                    "wallpaper-runtime-status"):
            self.assertNotIn(key, clean)

    def test_prepare_creates_private_backup_and_migrates_once(self):
        legacy = "[/]\norb-enabled=false\nruntime-revision='abc'\n"
        calls = []
        def fake(args, *, input_text=None, required=True):
            calls.append((args, input_text))
            if args == ["dconf", "dump", migration.LEGACY_DCONF]:
                return legacy
            if args == ["dconf", "dump", migration.NEW_DCONF]:
                return ""
            if args == ["dconf", "load", migration.NEW_DCONF]:
                self.assertIn("orb-enabled=false", input_text)
                self.assertNotIn("runtime-revision", input_text)
                return ""
            raise AssertionError(args)
        with patch.object(migration.shutil, "which", return_value="/usr/bin/dconf"), \
             patch.object(migration, "command", side_effect=fake):
            migration.prepare()
            migration.prepare()
        self.assertEqual(sum(x[0][1] == "load" for x in calls), 1)
        backup = self.store / "legacy-settings-backup.ini"
        self.assertEqual(backup.read_text(), legacy)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.store.stat().st_mode & 0o777, 0o700)
        self.assertTrue(migration.load_state()["settings_copied"])

    def test_existing_new_user_settings_not_overwritten(self):
        with patch.object(migration.shutil, "which", return_value="/usr/bin/dconf"), \
             patch.object(migration, "command", side_effect=lambda a, **_:
                "[/]\norb-enabled=false\n" if a[2] == migration.LEGACY_DCONF
                else "[/]\norb-enabled=true\n"):
            migration.prepare()
        self.assertFalse(migration.load_state()["settings_copied"])
        self.assertTrue((self.store / "legacy-settings-backup.ini").exists())

    def test_retire_disable_and_rollback_restore_old_without_deletion(self):
        migration.save_state({"version": 1, "prepared": True, "retired": False})
        calls = []
        with patch.object(migration, "is_active", return_value=True), \
             patch.object(migration, "command",
                          side_effect=lambda args, **_: calls.append(args) or ""):
            migration.retire()
            self.assertTrue(migration.load_state()["retired"])
            migration.retire()  # at most one disable
            migration.rollback()
        self.assertEqual(calls, [
            ["gnome-extensions", "disable", migration.LEGACY_UUID],
            ["gnome-extensions", "disable", migration.NEW_UUID],
            ["gnome-extensions", "enable", migration.LEGACY_UUID],
        ])
        self.assertFalse(migration.load_state()["retired"])
        self.assertTrue(self.previous_dir.exists())

    def test_finalize_requires_new_extension_active(self):
        migration.save_state({"version": 1, "prepared": True, "retired": True})
        with patch.object(migration, "is_active", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "must be active"):
                migration.finalize()
        self.assertTrue(self.previous_dir.exists())

    def test_finalize_uninstalls_old_only_when_new_running(self):
        migration.save_state({"version": 1, "prepared": True, "retired": True})
        calls = []
        def active(uuid):
            return uuid == migration.NEW_UUID
        with patch.object(migration, "is_active", side_effect=active), \
             patch.object(migration, "command",
                          side_effect=lambda args, **_: calls.append(args) or ""):
            migration.finalize()
        self.assertEqual(calls,
                         [["gnome-extensions", "uninstall", migration.LEGACY_UUID]])
        self.assertTrue(migration.load_state()["finalized"])

    def test_cannot_overwrite_a_symlinked_migration_state(self):
        self.store.mkdir()
        elsewhere = self.root / "external"
        elsewhere.write_text("do not touch", encoding="utf-8")
        (self.store / "migration-state.json").symlink_to(elsewhere)
        with self.assertRaisesRegex(RuntimeError, "symlink"):
            migration.save_state({"version": 1})
        self.assertEqual(elsewhere.read_text(), "do not touch")


if __name__ == "__main__":
    unittest.main()
