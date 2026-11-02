#!/usr/bin/env python3
"""Opt-in read-only GNOME Shell resource sampler (not an FPS profiler)."""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys
import time

FIELDS = ["timestamp_utc", "elapsed_seconds", "gnome_shell_pid",
          "gnome_shell_cpu_pct", "gnome_shell_rss_mib",
          "gpu_total_util_pct", "gpu_total_memory_mib",
          "gpu_total_power_w", "gpu_total_temp_c"]
METRICS = FIELDS[3:]


def proc_ticks(stat: str) -> int:
    end = stat.rfind(")")
    if end < 0:
        raise ValueError("malformed process stat")
    items = stat[end + 1:].split()
    if len(items) < 13:
        raise ValueError("process stat has too few fields")
    return int(items[11]) + int(items[12])


def process_stats(pid: int) -> tuple[int, float]:
    ticks = proc_ticks(Path(f"/proc/{pid}/stat").read_text())
    rss = next(
        int(line.split()[1]) / 1024
        for line in Path(f"/proc/{pid}/status").read_text().splitlines()
        if line.startswith("VmRSS:")
    )
    return ticks, rss


def shell_pid() -> int:
    matches = []
    for item in Path("/proc").iterdir():
        if not item.name.isdigit():
            continue
        try:
            if item.stat().st_uid == os.getuid() and (
                item / "comm"
            ).read_text().strip() == "gnome-shell":
                matches.append(int(item.name))
        except (OSError, ValueError):
            continue
    if len(matches) != 1:
        raise ValueError(
            f"Found {len(matches)} same-user gnome-shell processes; use --pid"
        )
    return matches[0]


def gpu_sample(index: int) -> list[float | None]:
    query = "utilization.gpu,memory.used,power.draw,temperature.gpu"
    result = subprocess.run(
        ["nvidia-smi", "-i", str(index), f"--query-gpu={query}",
         "--format=csv,noheader,nounits"],
        check=True, capture_output=True, text=True, timeout=2,
    )
    fields = result.stdout.strip().splitlines()[0].split(",")
    if len(fields) != 4:
        raise ValueError("Unexpected NVIDIA metrics")
    output = []
    for field in fields:
        try:
            output.append(float(field.strip()))
        except ValueError:
            output.append(None)
    return output


def summarize(rows: list[dict]) -> dict:
    summary = {}
    for name in METRICS:
        nums = []
        for row in rows:
            try:
                nums.append(float(row[name]))
            except (TypeError, ValueError, KeyError):
                pass
        nums.sort()
        summary[name] = ({
            "mean": round(statistics.mean(nums), 3),
            "p95": round(nums[math.ceil(len(nums) * .95) - 1], 3),
            "peak": round(nums[-1], 3),
        } if nums else None)
    return summary


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not set(METRICS).issubset(reader.fieldnames or []):
            raise ValueError(f"Not a Velora capture: {path}")
        data = list(reader)
    if not data:
        raise ValueError(f"Empty capture: {path}")
    return data


def compare(args):
    before = summarize(read_csv(args.before))
    after = summarize(read_csv(args.after))
    for key in METRICS:
        a, b = before[key], after[key]
        if a and b:
            diff = b["mean"] - a["mean"]
            print(f"{key}: mean {a['mean']} -> {b['mean']} ({diff:+.3f}); "
                  f"p95 {a['p95']} -> {b['p95']}")
        else:
            print(f"{key}: not available in both captures")
    print("Only meaningful under matching workload/settings. No FPS or Velora-only GPU attribution.")


def capture(args):
    if args.seconds <= 0 or args.interval < .5 or args.delay < 0:
        raise ValueError("seconds > 0, interval >= 0.5, delay >= 0 required")
    pid = args.pid if args.pid is not None else shell_pid()
    if not Path(f"/proc/{pid}/stat").is_file():
        raise ValueError(f"PID {pid} not found")

    label = "".join(
        x if x.isalnum() or x in "-_" else "_" for x in args.label
    ) or "capture"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or Path("dist/velora-perf") / f"{stamp}-{label}.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    gpu_ok = not args.no_gpu and shutil.which("nvidia-smi") is not None
    print(f"Measuring PID {pid} / {args.label} in {args.delay:g}s "
          f"for {args.seconds:g}s (interval {args.interval:g}s)")
    print("Switch to the target surface during the delay; do not return until sampling ends.")
    print("GPU numbers apply to the entire NVIDIA GPU, not Velora. No FPS measurements.")
    time.sleep(args.delay)

    rows = []
    rate = os.sysconf("SC_CLK_TCK")
    start = prev = time.monotonic()
    prev_ticks, _ = process_stats(pid)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for index in range(math.ceil(args.seconds / args.interval)):
            due = start + min((index + 1) * args.interval, args.seconds)
            time.sleep(max(0, due - time.monotonic()))
            now = time.monotonic()
            ticks, rss = process_stats(pid)
            cpu = max(0, ticks - prev_ticks) * 100 / rate / max(now - prev, .000001)
            prev_ticks, prev = ticks, now
            gpu = [None] * 4
            if gpu_ok:
                try:
                    gpu = gpu_sample(args.gpu_index)
                except (OSError, subprocess.SubprocessError, ValueError, IndexError):
                    print("NVIDIA metrics unavailable; continuing without GPU sampling.", file=sys.stderr)
                    gpu_ok = False
            row = dict(
                timestamp_utc=datetime.now(timezone.utc).isoformat(),
                elapsed_seconds=round(now - start, 3),
                gnome_shell_pid=pid,
                gnome_shell_cpu_pct=round(cpu, 3),
                gnome_shell_rss_mib=round(rss, 3),
            )
            row.update({
                metric: value for metric, value in zip(METRICS[2:], gpu)
            })
            writer.writerow(row)
            rows.append(row)
    try:
        git_head = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True,
            text=True, check=True, timeout=2,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        git_head = None
    summary = {
        "scenario": args.label, "pid": pid, "samples": len(rows),
        "seconds": args.seconds, "interval": args.interval,
        "git_sha": git_head, "session": os.getenv("XDG_SESSION_TYPE"),
        "note": "GPU metrics are device-wide; CPU/RSS refer to entire GNOME Shell; no FPS.",
        "metrics": summarize(rows),
    }
    dest = output.with_suffix(".summary.json")
    dest.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Saved CSV: {output}")
    print(f"Saved summary: {dest}")
    for field in ("gnome_shell_cpu_pct", "gnome_shell_rss_mib", "gpu_total_util_pct"):
        info = summary["metrics"][field]
        if info:
            print(f"{field}: mean {info['mean']} / p95 {info['p95']} / peak {info['peak']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    cap = commands.add_parser("capture")
    cap.add_argument("--label", required=True)
    cap.add_argument("--seconds", type=float, default=20)
    cap.add_argument("--interval", type=float, default=1)
    cap.add_argument("--delay", type=float, default=5)
    cap.add_argument("--pid", type=int)
    cap.add_argument("--gpu-index", type=int, default=0)
    cap.add_argument("--no-gpu", action="store_true")
    cap.add_argument("--output", type=Path)
    cap.set_defaults(run=capture)
    cmp = commands.add_parser("compare")
    cmp.add_argument("before", type=Path)
    cmp.add_argument("after", type=Path)
    cmp.set_defaults(run=compare)
    args = parser.parse_args()
    try:
        args.run(args)
    except (OSError, ValueError, StopIteration) as exc:
        parser.exit(2, f"Profiler error: {exc}\n")


if __name__ == "__main__":
    main()
