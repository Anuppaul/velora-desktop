"""Check the extension runtime's import closure is packaged for hot-swap."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "gnome-shell" / "velora@wonderer.tech"
INSTALLER = ROOT / "gnome-shell" / "install.sh"


class RuntimePackagingTests(unittest.TestCase):
    def test_local_runtime_dependencies_are_staged(self):
        script = INSTALLER.read_text(encoding="utf-8")
        block = re.search(r"(?ms)^RUNTIME_FILES=\((.*?)^\)", script)
        self.assertIsNotNone(block, "Cannot find RUNTIME_FILES in installer")
        runtime_files = set(re.findall(r'"([^"]+)"', block.group(1)))

        # Bootstrap/aux files are copied separately; the vendor subtree
        # is copied recursively by RUNTIME_DIRS.
        separately_copied = {"extension.js", "prefs.js"}
        for filename in sorted(runtime_files):
            source = EXT / filename
            with self.subTest(filename=filename):
                self.assertTrue(source.is_file(), f"Missing runtime file: {filename}")
                code = source.read_text(encoding="utf-8")
                imports = re.findall(
                    r"""(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]\./([^'"]+\.js)['"]""",
                    code,
                )
                for dependency in imports:
                    if dependency.startswith("vendor/"):
                        continue
                    self.assertTrue(
                        dependency in runtime_files or dependency in separately_copied,
                        f"{filename} requires {dependency}, but install.sh does not stage it",
                    )


if __name__ == "__main__":
    unittest.main()
