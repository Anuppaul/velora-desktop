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

## Liquid optics v10 — deeper liquid material

PR #42's v9 look is the baseline. v10 increases the visual liquidity by
tuning the same GPU material uniforms and hover response, not by changing the
render pipeline. The glass remains clear and the accepted milky shade, grain,
blur radius, tint, panel geometry, and Orb/App Grid animation remain intact.

| Optical parameter | v9 | v10 |
| --- | ---: | ---: |
| Lens depth (max_z) | 132 | 144 |
| Refraction (displacement_scale) | 50 | 58 |
| IOR | 1.68 | 1.78 |
| Edge chroma | 1.6 | 1.85 |
| Specular | 0.69 | 0.78 |
| Shininess | 70 | 74 |
| Rim width | 3.3 | 3.7 |
| Rim intensity | 1.07 | 1.15 |
| Fresnel rim power | 2.15 | 2.05 |
| Rim light color intensity | 1.24 | 1.28 |
| Sheen | 0.15 | 0.21 |

Orb hover optical response is 0.48 → 0.62; Spotlight hover/focus is
0.40/0.20 → 0.52/0.28; the shared engagement response is slightly stronger
and smoother. Material v9 migration targets are pinned to their historical
values, so older installs can advance through v9 to v10 deterministically.
Manual Advanced renderer overrides remain untouched.

No additional blur/capture/refraction pass, framebuffer allocation or timer
is introduced. **This is a source-level design claim, not an FPS or GPU power
benchmark.** Check real GNOME Shell 50 transitions, all glass surfaces,
readability and GPU usage before concluding visually or operationally perfect.
Run `node tools/test_liquid_optics.mjs` to verify migration behavior.

## Orb and Ubuntu Dock live-window preview glass

The shared running-window preview card previously used a nearly opaque
`rgba(8, 9, 12, 0.94)` black background. It now uses the same bounded
`ShellCardSurface` LiquidEffect as Velora's other premium shell cards:
live desktop/window refraction, 16px native card corners, v10 material optics,
and 104px capture margin around the card rather than a fullscreen effect.

The preview glass manager is **manual-only**: no global GNOME Shell tree scan
or extra recurring timer. It is only used after real, taskbar-visible app
windows are found; the original native `Shell.WindowPreviewLayout` tiles,
hover interactions, click-to-activate, position, opening/closing and fade
animations remain unchanged. Glass is placed **behind** those tiles.
Card destruction releases its WindowCloneManager and stage frame connection.
When the renderer cannot attach, a faint neutral translucent preview card
remains instead of the former opaque black rectangle.

Regression check: `node tools/test_preview_glass.mjs`. On a real
GNOME Shell 50 desktop, test one-, two-, three-, and four-window previews,
Orb hover and native Ubuntu Dock hover; switch windows, close/reopen previews,
drag near each screen edge, and check that glass never turns into a
full-monitor black surface, that the previews remain clickable, and that
idle resource use returns after closing a preview. Mock tests do not
replace compositor/GPU measurement.

## Enlarged Orb and Ubuntu Dock window preview rectangle

The shared running-window preview card is now approximately 25% larger:
both the live native window thumbnails and their surrounding v10 Liquid Glass
rectangle expand together, rather than scaling a painted bitmap.

| Windows | Previous rectangle | Enlarged rectangle |
| --- | --- | --- |
| One | 300 × 196 px | 378 × 248 px |
| Two | 468 × 160 px | 588 × 203 px |
| Three or four | 408 × 268 px | 514 × 338 px |

Values above assume the existing **100% App Preview Size** preference
and adequate display space. Existing 50–180% user preferences continue to
apply, but the layout fits the actual anchor monitor before allocating tiles.
That prevents the larger glass card from exceeding the monitor's visible
bounds on smaller or multi-monitor desktops. Native thumbnail aspect ratios,
click behavior and composited open/close animation are unchanged; the same
bounded preview LiquidEffect handles the larger material.

Run `node tools/test_preview_layout.mjs` for layout, size preference and
multi-monitor fit checks, and verify actual Orb/Dock previews visually on
GNOME Shell 50. Larger rectangles paint more pixels, so real GPU usage and
glass refresh timing should be measured before making performance claims.

## Edge-to-edge preview revision — larger, without side layers

Window preview cards (Orb radial launcher and native Ubuntu Dock hover) now
use a **1.65×** tile multiplier at the existing App Preview Size preference
instead of 1.25×. Their v10 Liquid Glass outer surface remains one material;
the duplicate painted CSS border/shadow and each native thumbnail's frosted
tile plate/border have been removed. Only a minimal neutral fallback remains
if the shader has not attached, and a faint hover highlight retains
clickability feedback. The padding is 6px instead of 14px, the inter-tile gap
8px instead of 10px, and the native live screenshot has only 2px breathing
room per side instead of 6px.

At 100% App Preview Size and a sufficiently large monitor:

| Windows | Previous size | Edge-to-edge size |
| --- | --- | --- |
| 1 | 378 × 248 px | 474 × 302 px |
| 2 | 588 × 203 px | 746 × 243 px |
| 3–4 | 514 × 338 px | 648 × 416 px |

App Preview Size remains fully adjustable (50–180%). Existing monitor-fit
limits, fixed GNOME `Shell.WindowPreviewLayout` click targets, opening and
closing transitions, one existing LiquidEffect per open preview, and lifetime
cleanup are preserved. Run `node tools/test_preview_layout.mjs` and
`node tools/test_preview_glass.mjs` to check the source implementation.
Visual acceptance on GNOME Shell 50 should focus on actual layered rims,
hover and focus visibility, screen-edge fit and larger-preview GPU budget.

## Native preview geometry correction (portrait Terminal / wide Files)

Previously every Orb or Ubuntu Dock live-window preview was laid out in a
**fixed landscape card** (single-window maximum 474 × 302 px), regardless of
the real source window's aspect ratio. A tall Terminal could occupy a narrow
strip in the middle of a huge glass plate and its compositor buffer/decoration
could protrude above or below the card. This was a layout bug, not extra
Liquid Glass shader depth or the previous side CSS border.

The preview now computes a *visible bounds union* from the native
`Meta.Window.get_frame_rect()` plus optional `get_buffer_rect()`. Each
window receives its own proportional live thumbnail size. The outer glass
card is assembled tightly from those tiles and not from fixed landscape
slots. Mixed 2–4-window groups use individual aspect ratios, centered rows
and one monitor-safe scale. The existing user's App Preview Size preference
and the 1.65× requested boost are retained **as upper limits**, not forced
blank-card dimensions.

The `Shell.WindowPreviewLayout` native compositor clone is positioned using
the frame/buffer offset so its paint fits within its tile; the tile and content
clip the final pixels. The frame actor alone does not clip (otherwise window
decorations disappear). Small real windows may scale up to fill their
proportional card, eliminating the old 1:1-size restriction. No new shader
pass, GPU texture, scene poll, or animation is added. v10 Liquid Glass,
preview click/hover and side-layer removal are unchanged.

At 100% settings on a large display, a portrait 600×1050 window now
receives a taller native thumbnail and approximately **302×520 px** of glass
instead of **474×302 px** of largely empty landscape glass. A landscape
1550×980 window still produces ~471×302 px. Portrait previews get up to a
2× extra height budget before the shared monitor-fit limiter. The actual sizes
depend on the source window's buffer and CSD shadow. The original screen
capture revealed the mismatch; mock tests verify the geometry, but a live
GNOME Shell 50 visual check is still required for buffer-clipping behavior.

Run `node tools/test_preview_layout.mjs` and
`node tools/test_preview_glass.mjs`; repeat with a tall Terminal, Files, an
app with mixed portrait/landscape windows, and the native Dock hover path.

## Running-window preview: exact 16:9 and visible Liquid Glass

The owner requested **one fixed 16:9 outer frame** for Terminal, Files and
other running-window previews (Orb and native Ubuntu Dock). Previous v47
followed each source window's aspect ratio; v48 deliberately makes only the
*outer* glass and each thumbnail tile 16:9. The live
`Shell.WindowPreviewLayout` clone still preserves the source window's
original aspect using *contain*, including its native CSD/window buffer.
A portrait Terminal may therefore have glass-visible side bands; unlike a
stretched thumbnail, its text remains proportionate and uncropped.

At 100% App Preview Size and at least a 1920×1080 monitor, the frame is
**784×441 logical pixels, exactly 16:9**, for 1, 2, 3, and 4-window previews.
At 50% it is 384×216. On smaller monitors its width snaps to a 16px unit
so the ratio remains exactly 16:9 after fitting screen boundaries. A single
window uses one 16:9 tile; multiple windows use centered, non-overlapping,
equal-aspect native click targets. The existing 1.65× boost and App Preview
Size preference still drive *overall* size.

The original Liquid Glass preview was inserted as a sibling inside the
desktop's `Clutter.FixedLayout`. This could leave the material invisible or
out of sync with its 120ms parent fade/zoom. The preview-only
`ShellCardSurface` now inserts its **one refractive material as the first
child of the preview card**, below the native live thumbnails. Parent opacity
and scale are inherited once, avoiding accidental squared translucency and
stale sibling allocation. Other shell cards retain their previous sibling
geometry and animation behavior. An 8.5% neutral tint is part of the active
card's CSS body, while an 18% neutral fallback makes the card visible even
before its asynchronous GPU shader loads or if attachment fails. Neither is
a second overlay actor, border, or new shader pass. The shader still drives
the v10 refractive rim, blur and background distortion.

The Orb app-region scanner ignores these nested preview clone subtrees to
avoid expensive recursive walks during hover. Preview destruction still
releases the bounded window-clone manager and its compositor frame callback.

Run `node tools/test_preview_layout.mjs` and
`node tools/test_preview_glass.mjs`. On a real GNOME Shell 50 session, check
Terminal, Files, several simultaneously running windows, the fixed frame
ratio, the visible refractive rim, window activation, native Dock hover,
monitor edges and whether short open/close fades flicker. CI's mocked
GObject/Clutter actors do not certify live GPU shader output.

## Compact fixed 16:9 preview (main update)

The user approved the visible v10 Liquid Glass preview and fixed 16:9 ratio, but requested a smaller overall frame. Reduce the preview multiplier from **1.65× to 1.35×**, giving **640×360 logical px at the existing 100% App Preview Size** (previously 784×441), and **320×180 px at 50%** (previously 384×216), on a sufficiently large monitor. It still obeys 50–180% settings and smaller-monitor safety clamps. No other native preview, glass material, layer, clip, animation or renderer code changes. On GNOME 50 confirm the glass remains visible, the outer frame stays 16:9, and native thumbnail clicks, CSD shadows and Dock hover work.

## Mini 16:9 window preview baseline

Following the approved 640×360 preview, the default 100% Window Preview Size now displays a **480×270 logical-pixel** card on a sufficiently large monitor (a 25% reduction in width and height). The existing 50% size displays **240×135**, and 180% displays **864×486** when screen space permits. A smaller monitor continues to cap the frame to the available space and maintain the exact **16:9** ratio. No changes to the v10 Liquid Glass renderer, visible backdrop, thumbnail aspect-ratio containment, input, preview fades, or resource lifetime are required. The mini-layout test covers the three representative sizes and multiple display geometries; the real compositor appearance still needs on-device validation.

## Remove the remaining preview white layer (single-material glass)

The compact **480×270 exact-16:9** running-window preview already has its own
Velora LiquidEffect as the first child of the native card. However, the card
still received a painted translucent white body when glass was active, and
`LiquidGlassIntegration._applyCardAppearanceStylesheet()` applied a generic
`.velora-liquid-shell-card` **`!important` white-filter override** on top of
all native shell cards, including this preview. A hovered/focused native
thumbnail also received an additional 5.5% white tile fill. These are visual
layers independent of the actual refractive LiquidEffect.

Active preview cards now draw **transparent CSS backgrounds** in both the
static stylesheet and the dynamically generated appearance stylesheet, with
a **preview-specific exception placed after the generic shell-card white
filter**. The generic white filter remains adjustable for other cards.
Thumbnail hover/focus no longer paints a white plate; hit targets, focus
semantics, live window clones and click-to-activate code are unchanged.

If preview glass fails to attach, the non-glass preview still has its existing
neutral 18% CSS fallback, so it never reverts to the original black surface.
No new shader, nested actor, compositor capture or GPU pass was introduced.
Preview dimensions remain **480×270** at 100% and exact **16:9** at all sizes.

Run `node tools/test_preview_glass.mjs` and
`node tools/test_preview_layout.mjs`. Verify the visual appearance in GNOME
Shell 50, particularly running-app hover, thumbnail focus, and dynamic changes
to the global Glass Filter setting; mock tests do not prove the GPU visuals.

## Live material modes: Liquid Glass v10 and Frosted Crystal

Velora now retains the original v10 **Liquid Glass** as the default and adds
**Frosted Crystal**, selected from **Extensions → Velora Desktop → Preferences
→ Appearance → Glass Material**. The selected mode is stored in Velora's
canonical `glass-style` GSettings key (`liquid` / `frosted`) and changes
live. Frost Density, Micro-grain and Crystal Edge Glow are independent
0–100 controls; changing modes never modifies a user's existing Advanced
Liquid optics, tint, blur, or Date Menu settings.

### Rendering architecture
- The canonical settings bridge sends a **0.0 (Liquid) or 0–1.0 (Frosted)**
  amount and grain/glow values to new vendored GSettings keys. Every existing
  `MaterialSettings` instance binds them to three added uniforms in the
  **same** LiquidEffect fragment shader. This includes native Dock/Panel,
  Orb, Spotlight, popups, Quick Settings, and the bounded window-preview card.
- **Liquid amount=0 is the identity path**: the original v10 blur radius and
  shader body/highlight/grain are unchanged. Selecting Liquid again uses the
  original saved values, not a reconstructed approximation.
- Frosted uses more of the existing blur (an amount-based addition up to
  12px when the original blur is enabled), desaturates and softens contrast,
  blends toward neutral satin white/cool crystal, raises the amplitude of
  the existing screen-static hash grain and reduces strong specular glints.
  It leaves a subtle single crystalline rim; both flat-interior and full
  refraction paths use the same matte treatment. Explicit user blur=0 stays
  off. Changing only Grain or Glow does **not** reconfigure the blur kernel.
- No second glass actor, GL texture, dedicated blur engine, animated noise
  pass, new framebuffer, CPU screenshot, or extra compositor timer is added.
  Blur radius **can** increase GPU work on the existing pipeline; this is not
  an FPS/performance benchmark.

### Verification and acceptance
Run `node tools/test_frosted_crystal.mjs`, plus existing
`test_liquid_optics.mjs`, `test_preview_glass.mjs` and Shell frame-budget
tests. CI also validates both GSettings schema files and modified vendored
module syntax. Test on GNOME Shell 50:
1. Switch `Liquid → Frosted → Liquid` repeatedly with Quick Settings,
   Calendar, Orb, Spotlight, and native Ubuntu Dock visible, checking that
   no black frame or one-frame white flash appears.
2. Compare identical wallpapers/settings and verify Liquid v10 optics return
   exactly; test custom Advanced optics and explicit blur=0, along with
   the Frosted Density/Grain/Edge controls and their persisted state.
3. Verify the compact **480×270 fixed-16:9** preview's shader, frame, live
   clickable thumbnail and no extra CSS overlay remain intact in both modes.
4. Check text contrast, all monitor edges, panel↔dock handoff, modal menus
   and repeated hover/close cleanup. Measure actual CPU/GPU impact in the
   accepted sampler before claiming performance parity.
