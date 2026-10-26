# Velora performance baseline

This opt-in, read-only sampler runs as a separate Python process. It does not patch GNOME Shell, restart it, add runtime timers, install packages, or require root.

## Capture repeatable scenarios

Run these commands from the repository root, one at a time. A five-second delay gives you time to open the requested surface. Return to the terminal only after 20 seconds of recording:

```bash
python3 tools/velora_perf.py capture --label desktop-idle --seconds 20
python3 tools/velora_perf.py capture --label overview --seconds 20
python3 tools/velora_perf.py capture --label app-grid --seconds 20
python3 tools/velora_perf.py capture --label orb-all-apps --seconds 20
# Use Ubuntu Dock Panel Mode with its Liquid Glass backdrop enabled:
python3 tools/velora_perf.py capture --label panel-idle --seconds 20
# While recording, repeatedly reveal/hide the native dock panel:
python3 tools/velora_perf.py capture --label panel-motion --seconds 20
```

During idle, keep the desktop still. During Overview/App Grid, leave the surface open. For Orb All Apps, keep a representative page open and still. Record a separate run for paging or rapid transitions. All reports are local at dist/velora-perf/ (ignored by Git) as CSV and summary JSON.

## Comparison

Repeat the same scenario before and after a change, matching screen resolution, GNOME version, session, workload, power state and other GPU-intensive programs:

```bash
python3 tools/velora_perf.py compare path/to/before.csv path/to/after.csv
python3 -m unittest discover -s tools -p 'test_velora_perf.py'
```

Use --pid PID if multiple same-user gnome-shell processes exist, --delay 10 to give yourself more time, --output PATH to control the destination, and --no-gpu for systems without NVIDIA.

## What this does and does not measure

- CPU% is GNOME Shell process usage: 100% equals one fully busy CPU core; multi-threaded values can exceed 100%.
- RSS is the whole GNOME Shell process, not the extension alone.
- NVIDIA utilization, VRAM and power are **device-wide**, including other programs. They cannot be attributed solely to GNOME Shell or Velora.
- Sampling nvidia-smi creates a small, external overhead. Compare runs under the same sampling settings.
- No FPS, compositor paint duration, dropped-frame rate, motion quality or per-effect GPU timing is measured. Use a GNOME Sysprof/compositor trace for those.
- Inspect reports before sharing: timestamps, PIDs and system workload may reveal information about your machine.

## Rendering budgets (source-level, not measured benchmarks)

- The native panel follows its geometry every compositor frame. A stationary panel skips repeated transformed-position queries until its existing 24 FPS window-clone deadline; geometry changes (autohide/reveal or mode handoff) bypass the shortcut so capture bounds stay aligned. No extra background GLib timer is installed.
- Orb's small, single-batch surface still samples every compositor frame. Once the expanded All Apps view has more than 16 visible glass regions, its geometry/hover scan is capped at 30 FPS, while the window-clone scene remains capped at its existing 24 FPS. Newly scanned/revealed regions get an immediate pass.
- The existing native-Dock 180 px monitor-thickness guard, stage clipping, fallback veil and no-fullscreen-panel-FBO architecture are unchanged. This optimization does not claim measured CPU, GPU, FPS or latency gains: capture the same desktop scenarios and compositor traces before attributing improvements.

Runtime guard checks: `node --experimental-default-type=module tools/test_frame_budget.mjs`; Velora JS modules are syntax-checked on PRs.
