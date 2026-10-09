"""Unit tests for optional GNOME Shell performance capture."""
import contextlib
import csv
import io
from pathlib import Path
import tempfile
import unittest

from velora_perf import FIELDS, proc_ticks, summarize, compare


class CaptureTests(unittest.TestCase):
    def test_proc_handles_parentheses(self):
        fields = ["S"] + ["0"] * 30
        fields[11] = "120"
        fields[12] = "30"
        self.assertEqual(proc_ticks("123 (name with ) parentheses) " + " ".join(fields)), 150)

    def test_proc_rejects_malformed_stat(self):
        with self.assertRaises(ValueError):
            proc_ticks("broken")

    def test_missing_gpu_is_not_averaged_as_zero(self):
        rows = [
            {"gnome_shell_cpu_pct": "25", "gnome_shell_rss_mib": "300"},
            {"gnome_shell_cpu_pct": "75", "gnome_shell_rss_mib": "500"},
        ]
        metrics = summarize(rows)
        self.assertEqual(metrics["gnome_shell_cpu_pct"]["mean"], 50)
        self.assertEqual(metrics["gnome_shell_rss_mib"]["peak"], 500)
        self.assertIsNone(metrics["gpu_total_util_pct"])

    def test_before_after_comparison(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for cpu in (10, 20):
                path = Path(directory) / f"{cpu}.csv"
                with path.open("w", newline="") as stream:
                    writer = csv.DictWriter(stream, fieldnames=FIELDS)
                    writer.writeheader()
                    writer.writerow({"gnome_shell_cpu_pct": cpu})
                paths.append(path)
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                compare(type("Args", (), {"before": paths[0], "after": paths[1]})())
            self.assertIn("10.0 -> 20.0", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
