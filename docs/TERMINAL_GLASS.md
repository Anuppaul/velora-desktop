# Velora Terminal Glass — native Ptyxis on GNOME Shell 50

Velora supports **two separate, optional effects** on native Ptyxis:

1. **Phase 1: Ptyxis translucent background.** The profile opacity setting
   changes only the terminal's background transparency. Text stays sharp.
2. **Phase 2: compositor-native GPU backdrop blur (experimental).** GNOME
   Shell 50 inserts a single `Shell.BlurEffect` in `BACKGROUND` mode
   underneath each matched Ptyxis window's *native* surface. Actual windows
   and wallpaper behind the terminal can be blurred in real time. The blur
   does not require a separate extension or per-frame JavaScript capture.

Phase 2 is **OFF by default**. It does **not** put the full Velora Liquid
Glass lens shader into Ptyxis, replace GTK theming, inject a global window
overlay, fade window text, or alter other programs. Each rendered window costs
an additional GPU blur pass. This integration is still subject to real GNOME
50.1/Wayland testing and GNOME Extensions reviewer acceptance.

## 1. Verify your terminal and existing transparency

```bash
cd ~/Documents/code/velora-desktop
git pull origin main
python3 tools/velora_terminal_glass.py status
```

The status tool is **read-only**. `TERM=xterm-256color` indicates a
terminal capability, not which terminal application is running.

Your existing Ptyxis opacity value (for example **0.88**) is preserved.
If transparency isn't enabled, explicitly opt in:

```bash
python3 tools/velora_terminal_glass.py apply --opacity 0.88
```

This developer utility saves the original Ptyxis opacity under
`~/.local/state/velora-desktop/terminal-glass.json`, with restrictive
permissions, and supports full restoration. **Never use sudo.**

## 2. Install the new native blur runtime

After updating the repo, run the existing developer installer:

```bash
bash gnome-shell/install.sh
```

This is necessary **once per source update** to hot-swap Velora's new
`terminalBackdropBlur.js` module and compile the updated Velora GSettings
schema. When the bootstrap is compatible and active, it reports:

```text
Velora runtime hot-swap succeeded.
No logout is required.
```

No new OS packages or additional GNOME extensions are installed.

## 3. Turn on blur (opt-in)

Open **GNOME Extensions → Velora Desktop → Preferences → Terminal**.

- Turn on **Real backdrop blur**.
- The default strength is **18** (legacy sigma-equivalent), adjustable from 4–36. GNOME Shell 50 uses **`radius = strength × 2`**, so the native blur radius is 36 at the default value.
- Check **Live compositor attachment** for `Masked: N Ptyxis window(s)`:
  a frame-bounded blur with an outer rounded GPU alpha mask has been
  attached. This remains **visual-unverified** until tested on GNOME 50.1.
- Start with a small floating Ptyxis window over a wallpaper or another
  application, then drag it over contrasting content to visually check blur.
- Keep the native Ptyxis background partly transparent to see the backdrop.

**Important:** Attachment status only proves that the GPU blur actor was
added. It does **not** prove that its pixels were painted or that Ptyxis
actually has alpha. The revised status says **"visual unverified; check
profile opacity"** to prevent false-positive success reports.

### Why "Attached: 1" may still look opaque

A compositor BACKGROUND blur actor sits **behind** the native terminal surface.
If Ptyxis paints that surface opaque, no backdrop pixels can show through.
Ptyxis transparency is *independent* of the Velora blur toggle. At 0.88
opacity, only 12% of the backdrop is visible: on dark backgrounds this can be
nearly indistinguishable from an opaque window.

Before debugging the compositor, perform this controlled A/B test:

```bash
cd ~/Documents/code/velora-desktop
python3 tools/velora_terminal_glass.py status
```

The read-only status now reports both **Ptyxis opacity** and (where installed)
Velora's extension-scoped blur status. It also warns if the default profile is
opaque or nearly opaque. A Ptyxis tab may use a **non-default profile**; if
the status disagrees with the visible tab, check its profile in Ptyxis.

To test a visibly translucent background **without losing your original
backup**, use the existing opt-in tool:

```bash
python3 tools/velora_terminal_glass.py apply --opacity 0.78
```

Close all Ptyxis windows and open Ptyxis again if the alpha does not redraw.
Then put a strongly contrasting Firefox window behind Ptyxis. First compare
with Velora's **Real backdrop blur OFF** (true native transparency), then ON
(blur behind the same native background). If OFF is also opaque, fix the
Ptyxis profile/window itself before changing any compositor code.

Some other extensions (e.g., Blur My Shell/WinFX) may own a window blur.
Velora avoids stacking known actor names, but cannot detect every external
extension's modifications. Never change compositor opacity of the **entire**
Ptyxis window: doing so would fade terminal text as well.

To restore the original background-opacity setting, after testing run:

```bash
python3 tools/velora_terminal_glass.py restore
```

Note: if the original opacity was 1.0, restore makes it opaque again.

### GNOME 50.1: troubleshooting a failed native attachment

If Preferences reports `Unavailable (...)`, the updated diagnostic now
identifies the failing stage: `find-surface`, `frame-geometry`,
`create-actor`, `connect-geometry`, `create-blur-effect`,
`add-effect`, `insert-under-surface`, or `connect-destroy`.

**Rounded blur output mask (October 2026):** PR #76 used frame/buffer
geometry and `Clutter.set_clip()`, but live testing confirmed that blur still
appeared outside the main Ptyxis window. The old code also guessed the
compositor scale from actor dimensions, which can shift the blur on GNOME 50.

The updated path has two independent bounds:

1. **Native GNOME 50 geometry:** determine frame-local coordinates from
   `frame_rect - buffer_rect`, intersect with the actual client buffer,
   and round *inwards*. GNOME 50 uses the framebuffer-scale pipeline; do
   not apply a second inferred `actorWidth / bufferWidth` scale. If actor
   geometry contradicts the native buffer size by more than 8%, the blur
   **fails closed** instead of guessing and spilling outside.
2. **GPU final output alpha mask:** before adding the background blur, install
   an outermost `Shell.GLSLEffect` (original Velora code). It masks the
   *blurred output* after the blur pass to a 12px rounded rectangle, with
   a 1.5px interior safety inset and antialiased corners. Maximized/fullscreen
   Terminal windows use square corners. No extra library, system theme,
   screenshot or full-screen overlay is installed.

If GNOME 50 cannot create the mask, resolve its uniforms or establish the
expected effect order, Velora **does not show an unmasked blur**. The terminal
continues using its native Ptyxis transparency. The GObject shader type
is cached in the Shell process to avoid duplicate registration during
developer hot-swaps.

The status `Masked: N Ptyxis window(s)` means the two shader effects are
attached in order—not that their pixels have passed live visual QA.
The output mask adds a GPU offscreen pass and may increase compositor cost
on large windows. Rectangular clipping alone was not sufficient for this
device. GNOME Shell 50 Wayland corner shape, fractional scaling, fullscreen
and resize still require real-device comparison.

Capture the exact failure without restarting the session:

```bash
GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
  gsettings get org.gnome.shell.extensions.velora terminal-backdrop-blur-status
journalctl --user -b --no-pager -o cat | grep -F '[Velora][TerminalBlur]' | tail -n 30
```

If the Shell writes to the system journal instead, use:

```bash
journalctl -b --no-pager -o cat /usr/bin/gnome-shell | grep -F '[Velora][TerminalBlur]' | tail -n 30
```

The stage and real GJS exception matter more than a generic "unavailable"
message. If failure persists, turn **Real backdrop blur** OFF and keep
Ptyxis's already-working native transparency. Neither the fallback nor
the tests prove GPU pixels are correctly composited: check live GNOME 50.1
and, if necessary, share these logs for the next targeted fix.

## 4. If a new PR makes **no visual difference**

The previous terminal backdrop was intentionally switched OFF while fixing
Quick Settings brightness. **Updating Velora does not automatically enable
an opt-in setting.** Even a perfectly installed new renderer changes nothing
when `terminal-backdrop-blur-enabled=false`.

Run this read-only on-device check before proposing another GPU patch:

```bash
cd ~/Documents/code/velora-desktop
python3 tools/velora_terminal_diagnose.py
```

The diagnostic prints the real GNOME Shell requested/loaded runtime revisions,
installed shader module fingerprints (current checkout vs loaded runtime),
the opt-in blur setting, compositor attachment/error status, the default
Ptyxis profile opacity, and the latest **Velora-owned** TerminalBlur journal
messages. It does **not** enable blur, alter terminal profiles, change GPU
settings or install anything.

Distinguish the outcomes carefully:

- **Blur OFF:** enable **Preferences → Terminal → Real backdrop blur**.
  No installer or code fix is required merely to switch the setting back ON.
- **Runtime mismatch/error:** verify `git pull origin main`, then rerun
  `bash gnome-shell/install.sh`; the installer checks that GNOME loaded the
  requested hot-swap revision. An installed module with a different hash
  means the Shell may be running old code.
- **Native Ptyxis opacity 1.0:** the blur effect is entirely hidden behind
  an opaque app background. Verify the actual open tab uses that profile.
- **Unavailable/Paused:** capture the stage and GNOME Shell error; do not
  call the effect visually successful.
- **Masked/Attached but visibly unchanged:** this only establishes actor
  bookkeeping, **not rendered backdrop pixels**. The nested
  `Shell.GLSLEffect` / `Shell.BlurEffect(BACKGROUND)` framebuffer sampling
  path requires genuine GNOME 50.1 validation; synthetic tests cannot prove
  the correct background framebuffer is being sampled.

**Important architectural warning:** GNOME Shell 50's background blur
samples the framebuffer supplied by its Clutter paint context. Applying a
second *outer* offscreen effect for rounded masking can change that paint
context, so a mask that passes JavaScript mocks may still sample the wrong
background or appear unchanged. This is a rendering risk, not a profile
setting problem. Do not add more stacked offscreen masks to compensate
without checking live compositor behavior.

The diagnostic does not itself prove successful pixels. For visual
comparison, place a small Ptyxis window over high-contrast Firefox content
and compare the exact same window position with blur OFF and ON; do not
confuse a transparent window with a blurred window.

## 4. Disable / restore

To remove the GPU effect immediately, switch **Real backdrop blur** OFF.
This removes all Velora-added blur actors and disconnects compositor window
listeners. It leaves Ptyxis opacity alone.

To restore the original Ptyxis opacity as well:

```bash
python3 tools/velora_terminal_glass.py restore
```

If another application has changed the opacity meanwhile, the restore
command refuses to overwrite it. Review the conflict before using
`restore --force`.

## Architecture / constraints

- **Window match:** native Ptyxis WM class / GTK app ID only; no title,
  command-line or PID guessing, no other terminal brands by default.
- **Lifecycle:** initially scans already mapped windows, then listens only
  for GNOME window map/create events. No timeout polling, screenshots or CPU
  readbacks. Actor destruction and extension disable free owned resources.
- **Rendering:** `St.Widget` carries two effects, ordered
  `TerminalBlurOutputMask (outer)` then
  `Shell.BlurEffect(BACKGROUND) (inner)`, underneath the native Ptyxis
  surface. The outer shader masks final blurred pixels to the visible
  rounded frame; native text remains sharp and the Mutter window is not
  reparented or faded. The frame is located via native GNOME 50
  `frame_rect - buffer_rect` geometry, without guessed fractional
  scaling. There is **no** full WindowActor blur fallback.
- **Compatibility:** GNOME Shell 50 only; depends on private compositor actor
  APIs that may change. Unsupported API branches fail closed. Physical GNOME
  50.1/Wayland, multiple monitor, minimization/overview, tiling/fullscreen,
  resize, light/dark readability, and hot-swap cleanup still require QA.
- **Safety on geometry changes:** native `size-changed`,
  `position-changed` and actor allocation notifications recompute
  the frame clip. Invalid or stale geometry temporarily hides blur;
  disabling Velora disconnects these signals and destroys only its
  own backdrop actor.
- **Performance:** one GPU background blur pass per matching Ptyxis window.
  Higher radius and larger windows increase GPU cost. Effects are never
  constructed with the switch OFF.
- **Distribution:** module is bundled as readable JavaScript in Velora's
  GNOME Store review ZIP; the standalone Python transparency utility and
  tests are **not** shipped inside the extension ZIP.
- **Not Liquid Glass v10:** this uses GNOME's native background diffusion,
  not Velora's refractive displacement/rim/chroma rendering.

## Implementation references

- GNOME Shell 46 migration guide (replace `sigma` with `radius = sigma * 2`):
  https://gjs.guide/extensions/upgrading/gnome-shell-46.html
- GNOME Shell 50 `Shell.BlurEffect(BACKGROUND)` final-paint behavior:
  https://github.com/GNOME/gnome-shell/blob/gnome-50/src/shell-blur-effect.c
- GNOME Shell 50 `Shell.GLSLEffect` fragment pipeline lifecycle, used for
  Velora's original rounded alpha mask: `vfunc_build_pipeline`,
  `get_uniform_location`, `set_uniform_float`.
- winfx effects documentation:
  https://winfx.readthedocs.io/en/latest/guide/effects/
- Blur My Shell application effects implementation:
  https://github.com/aunetx/blur-my-shell
- Native Ptyxis profiles and transparency:
  https://github.com/kreed/ptyxis
