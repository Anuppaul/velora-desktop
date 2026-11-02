"""Guard against stale old-brand names or paths in the VLIQ release tree.

The only permitted references to the former project identity are the
migration helper and its recovery documentation. Vendored third-party
upstream code must retain its original provenance and API names.
"""
from __future__ import annotations

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "gnome-shell" / "vliq@wonderer.tech"
ALLOWED_LEGACY = {
    "gnome-shell/migrate_legacy_install.py",
    "docs/VLIQ_REBRAND.md",
    # Explicit regression check uses old identifiers to catch reintroduction.
    "tools/test_vliq_branding.py",
    "tools/test_vliq_migration.py",
    "tools/test_vliq_identity.py",
}
TOKEN = "velora"


class VLIQIdentityTests(unittest.TestCase):
    def test_no_previous_project_directory_or_filename(self):
        self.assertTrue(EXT.is_dir())
        self.assertFalse((ROOT / "gnome-shell" /
                          "velora@wonderer.tech").exists())
        self.assertFalse((EXT / "schemas" /
                          "org.gnome.shell.extensions.velora.gschema.xml").exists())
        for root in (ROOT / "docs", ROOT / "tools", ROOT / "gnome-shell"):
            for path in root.rglob("*"):
                if "vendor/liquid-glass" in path.as_posix():
                    continue
                if path.is_file() and path.relative_to(ROOT).as_posix() not in ALLOWED_LEGACY:
                    self.assertNotIn(
                        TOKEN, path.name.lower(),
                        f"Legacy asset filename remains: {path}"
                    )

    def test_no_old_brand_in_first_party_release_text(self):
        for folder in (ROOT / ".github", ROOT / "gnome-shell", ROOT / "docs"):
            for path in folder.rglob("*"):
                if not path.is_file():
                    continue
                relative = path.relative_to(ROOT).as_posix()
                if relative in ALLOWED_LEGACY:
                    continue
                if "vendor/liquid-glass" in relative:
                    continue  # preserve upstream license/provenance
                if path.suffix not in {
                    ".js", ".css", ".json", ".xml",
                    ".md", ".yml", ".yaml", ".sh", ".svg",
                }:
                    continue
                text = path.read_text(encoding="utf-8").lower()
                self.assertNotIn(
                    TOKEN, text,
                    f"Old brand in VLIQ release code: {relative}",
                )
                self.assertNotIn(
                    "vliq-desktop", text,
                    f"Desktop suffix or obsolete repository URL: {relative}"
                )

    def test_new_gnome_metadata_and_repo_are_canonical(self):
        meta = json.loads((EXT / "metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["name"], "VLIQ")
        self.assertEqual(meta["uuid"], "vliq@wonderer.tech")
        self.assertEqual(meta["settings-schema"],
                         "org.gnome.shell.extensions.vliq")
        self.assertEqual(meta["url"], "https://github.com/Anuppaul/vliq")
        self.assertTrue((ROOT / "docs" / "screenshots" /
                         "vliq-extended-dock.png").is_file())


if __name__ == "__main__":
    unittest.main()
