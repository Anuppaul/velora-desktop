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
- Orb's small, single-batch surface still samples every compositor frame. Expanded, **stationary** All Apps pages (>16 visible regions) cap geometry/hover scans at 30 FPS; while translation/scale/opacity transitions are active, region placement follows **every compositor frame**. The window-clone scene keeps its original 24 FPS cap. Newly scanned/revealed regions get an immediate pass.
- The existing native-Dock 180 px monitor-thickness guard, stage clipping, fallback veil and no-fullscreen-panel-FBO architecture are unchanged. This optimization does not claim measured CPU, GPU, FPS or latency gains: capture the same desktop scenarios and compositor traces before attributing improvements.

Runtime guard checks: `node tools/test_frame_budget.mjs`; Velora JS modules are syntax-checked on PRs.

## Transition blink / jump regression checklist

The app launcher uses fixed Clutter slot positions and paint-only `translation_x/y` animations to eliminate per-frame FixedLayout invalidation. Orb page changes reuse cached actor pages without replaying the radial entrance. Creating new shader batches updates the new effects only, keeping the existing Orb-face material intact.

GNOME Overview / Home → Applications keeps a single native wallpaper BlurEffect at the same radius throughout showing, shown, and hiding. No deferred zero-blur-to-full-blur switch runs during the first menu-grid paint.

**Manual GNOME 50 acceptance:**
1. Hover Orb and reveal a short app list; repeat 10 times and verify no initial blink or geometry jump.
2. Select Orb app source = All and open an expanded list with >16 apps. Test each geometry, then move between available pages via scroll. Check that icon glass and the icon themselves move in sync.
3. Open/close Home (Activities) → Show Applications repeatedly. Verify no one-frame sharp-to-blurred pulse, black panel, or overlay flash.
4. Verify dock autohide, native Panel Mode and panel↔dock switching remain unchanged.
5. Use the performance sampler from above under matching conditions. A CI syntax/unit test alone cannot prove frame-perfect rendering on a real compositor.

CI smoke checks: `node tools/test_frame_budget.mjs` and `node tools/test_orb_transitions.mjs`.

## Liquid Glass optics v9 (GPU cost unchanged by design)

The richer Liquid Glass look is a **material-uniform tune**, not a new rendering pipeline. The canonical `glass-optics-profile-version` migrates from v8 to v9 once, updating only the exact shipped prior optics values in the existing vendored GSettings namespace. Custom Advanced renderer values are kept.

| Uniform | Previous baseline | Liquid v9 |
| --- | ---: | ---: |
| glass-max-z (lens depth) | 118 | 132 |
| glass-displacement-scale (refraction) | 42 | 50 |
| glass-chroma-strength (color splitting) | 1.4 | 1.6 |
| glass-specular-intensity | 0.55 | 0.69 |
| glass-shininess | 62 | 70 |
| glass-rim-width | 2.8 | 3.3 |
| glass-rim-intensity | 0.90 | 1.07 |
| glass-rim-power | 2.3 | 2.15 |
| glass-rim-light-color-intensity | 1.18 | 1.24 |
| glass-sheen-intensity | 0.10 | 0.15 |

Orb hover response rises 0.38 → 0.48; Spotlight hover/focus responses increase modestly. Neutral white body shade, texture grain, user tint and filter, blur radius, GLSL implementation, FBO allocations, capture clipping, native window geometry, and the 24 FPS expensive-scene cap are unchanged. The same shader code executes with different constant uniforms, so no additional pass or texture is introduced; **this is not a measured FPS or GPU-power result**.

For visual acceptance on GNOME Shell 50, compare the exact same wallpaper and window arrangement before and after installing. Check Orb icon edges, Date/Quick Settings cards, Spotlight, Top Panel, and the native Ubuntu Dock in panel/floating modes; verify legibility and that there is no black-frame flash or shimmer. Run:
```bash
node tools/test_liquid_optics.mjs
```
This verifies migration and custom-setting preservation, not on-screen rendering.
