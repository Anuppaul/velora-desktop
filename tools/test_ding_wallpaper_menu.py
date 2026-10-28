import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout
from io import StringIO

spec = importlib.util.spec_from_file_location(
    'ding_glass', Path(__file__).with_name('ding_wallpaper_menu.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DingThemeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'ding@rastersoft.com'
        (self.root / 'app').mkdir(parents=True)
        (self.root / 'metadata.json').write_text(
            json.dumps({'uuid': 'ding@rastersoft.com'}))
        (self.root / 'app' / 'ding.js').write_text(
            'cssProvider.load_from_file(Gio.File.new_for_path("stylesheet.css"));')
        self.css = self.root / 'app' / 'stylesheet.css'
        self.css.write_text('/* upstream */\n.desktop-icon { color: white; }\n')

    def test_reversible_and_idempotent(self):
        original = self.css.read_bytes()
        with redirect_stdout(StringIO()):
            module.run('status', str(self.root))
            module.run('apply', str(self.root))
            module.run('apply', str(self.root))
        self.assertIn(module.START, self.css.read_text())
        self.assertEqual(self.css.read_text().count(module.START), 1)
        self.assertEqual(
            self.css.with_name('stylesheet.css.velora-original').read_bytes(),
            original)
        with redirect_stdout(StringIO()):
            module.run('restore', str(self.root))
        self.assertEqual(self.css.read_bytes(), original)

    def test_refuses_different_uuid(self):
        (self.root / 'metadata.json').write_text(json.dumps({'uuid': 'not-ding'}))
        with self.assertRaises(RuntimeError):
            module.run('apply', str(self.root))

    def test_refuses_gtk4_resource_loader(self):
        (self.root / 'app' / 'ding.js').write_text(
            'cssProvider.load_from_resource("/org/gtk/stylesheet.css");')
        with self.assertRaises(RuntimeError):
            module.run('apply', str(self.root))

    def test_refuses_gtk4_even_if_uses_file_loader(self):
        (self.root / 'app' / 'gtk4.js').write_text(
            "import Gtk from 'gi://Gtk?version=4.0';"
        )
        with self.assertRaises(RuntimeError):
            module.run('apply', str(self.root))

    def test_preserves_external_css(self):
        with redirect_stdout(StringIO()):
            module.run('apply', str(self.root))
        self.css.write_text(
            self.css.read_text() + '/* new third-party rule */\n')
        with redirect_stdout(StringIO()):
            module.run('restore', str(self.root))
        self.assertIn('/* new third-party rule */', self.css.read_text())

    def test_rejects_partial_marker(self):
        self.css.write_text(self.css.read_text() + module.START)
        with self.assertRaises(RuntimeError):
            module.run('apply', str(self.root))


if __name__ == '__main__':
    unittest.main()
