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
- Check **Live compositor attachment** for `Attached: N Ptyxis window(s)`.
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
identifies the failing stage: `find-surface`, `create-actor`,
`bind-geometry`, `create-blur-effect`, `add-effect`,
`insert-under-surface`, or `connect-destroy`. A GNOME/Mutter version
may reject a `Clutter.BindConstraint` to the native surface; in that case,
Velora attempts a bounded native frame/buffer geometry fallback with
allocation notifications. It **never** installs a fullscreen blur.

Capture the exact failure without restarting the session:

```bash
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
- **Rendering:** a paintable `St.Widget` carrying
  `Shell.BlurEffect(BACKGROUND)` is inserted directly beneath the
  Meta.WindowActor native surface. It binds **WIDTH and HEIGHT to the
  Meta.WindowActor**, not to an ambiguously sized texture child; a bounded
  frame/buffer fallback applies if binding fails. Native terminal glyphs
  remain higher in paint order. This corrects the earlier zero/incorrect
  blur-quad sizing risk; compositor pixels still need on-device visual QA.
- **Compatibility:** GNOME Shell 50 only; depends on private compositor actor
  APIs that may change. Unsupported API branches fail closed. Physical GNOME
  50.1/Wayland, multiple monitor, minimization/overview, tiling/fullscreen,
  resize, light/dark readability, and hot-swap cleanup still require QA.
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
- GNOME Shell's `Shell.BlurEffect` BACKGROUND mode as used in GNOME 50
  window-effect projects.
- winfx effects documentation:
  https://winfx.readthedocs.io/en/latest/guide/effects/
- Blur My Shell application effects implementation:
  https://github.com/aunetx/blur-my-shell
- Native Ptyxis profiles and transparency:
  https://github.com/kreed/ptyxis
