"""VLIQ public-name regression tests; preserve the installed GNOME UUID.

A branding-only release must not silently create a second GNOME extension or
reset existing users' saved GSettings / native Ubuntu Dock state.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "gnome-shell" / "velora@wonderer.tech"
METADATA = EXT / "metadata.json"
SCHEMA = EXT / "schemas" / "org.gnome.shell.extensions.velora.gschema.xml"


class VLIQBrandingTests(unittest.TestCase):
    def test_exact_public_display_name(self):
        metadata = json.loads(METADATA.read_text(encoding="utf-8"))
        self.assertEqual(metadata["name"], "VLIQ")
        self.assertEqual(metadata["shell-version"], ["50"])
        self.assertNotIn("VLIQ Desktop", metadata["description"])

    def test_legacy_uuid_and_schema_are_stable(self):
        metadata = json.loads(METADATA.read_text(encoding="utf-8"))
        self.assertEqual(metadata["uuid"], "velora@wonderer.tech")
        self.assertEqual(
            metadata["settings-schema"],
            "org.gnome.shell.extensions.velora"
        )
        schema = SCHEMA.read_text(encoding="utf-8")
        self.assertIn(
            '<schema id="org.gnome.shell.extensions.velora" '
            'path="/org/gnome/shell/extensions/velora/">',
            schema,
        )
        self.assertIn('name="orb-enabled"', schema)
        self.assertIn('name="quick-brightness-enabled"', schema)
        self.assertIn('name="terminal-backdrop-blur-enabled"', schema)

    def test_installer_preserves_existing_extension_home(self):
        script = (ROOT / "gnome-shell" / "install.sh").read_text()
        self.assertIn('UUID="velora@wonderer.tech"', script)
        self.assertIn('VELORA_SCHEMA="org.gnome.shell.extensions.velora"',
                      script)
        self.assertIn("VLIQ installer:", script)
        self.assertNotIn("VLIQ Desktop", script)

    def test_store_release_preserves_install_identity(self):
        builder = (ROOT / "tools" / "build_ego_release.py").read_text()
        self.assertIn(
            'ARCHIVE_NAME = "velora@wonderer.tech.shell-extension.zip"',
            builder,
        )
        release = (
            ROOT / ".github" / "workflows" / "release.yml"
        ).read_text()
        self.assertIn('ARCHIVE="vliq-${VERSION}.tar.gz"'.replace("\\", ""),
                      release)
        self.assertIn('--title "VLIQ ${TAG}"'.replace("\\", ""), release)
        self.assertNotIn("VLIQ Desktop", release)

    def test_settings_prefs_and_presets_use_vliq_only(self):
        prefs = (EXT / "prefs.js").read_text()
        runtime = (EXT / "orbThemeRuntime.js").read_text()
        presets = (EXT / "wallpaperAtmosphereConfig.js").read_text()
        self.assertIn("VLIQ Terminal Glass", prefs)
        self.assertIn("VLIQ", runtime)
        for name in ("VLIQ Natural", "VLIQ Cinematic", "VLIQ Atmosphere"):
            self.assertIn(name, presets)
        for source in (prefs, runtime, presets):
            self.assertNotIn("VLIQ Desktop", source)

    def test_glass_renderer_symbol_remains_compatible(self):
        consumer = (EXT / "liquidGlassDock.js").read_text()
        producer = (EXT / "glassMaterialSystem.js").read_text()
        self.assertIn("applyVeloraGlassRole", consumer)
        self.assertIn("export function applyVeloraGlassRole(", producer)
        self.assertNotIn("applyVLIQGlassRole", consumer)

    def test_public_docs_use_vliq(self):
        readme = (ROOT / "README.md").read_text()
        self.assertTrue(readme.startswith("# VLIQ\n"))
        self.assertIn("## Why VLIQ", readme)
        self.assertIn("VLIQ", (ROOT / "gnome-shell" / "README.md").read_text())
        self.assertIn(
            "Public name: VLIQ.",
            (ROOT / "docs" / "VLIQ_REBRAND.md").read_text()
        )


if __name__ == "__main__":
    unittest.main()
