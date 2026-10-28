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
- The default strength is **18** (native Shell sigma), adjustable from 4–36.
- Check **Live compositor attachment** for `Attached: N Ptyxis window(s)`.
- Start with a small floating Ptyxis window over a wallpaper or another
  application, then drag it over contrasting content to visually check blur.
- Keep the native Ptyxis background partly transparent to see the backdrop.

**Important:** Attachment status only proves that a GPU blur actor was added.
It does not prove that the compositor has rendered the desired visual result.
Verify visually and compare to the switch OFF state. Some other extensions
such as Blur My Shell/WinFX may independently own window blur; Velora avoids
stacking another blur when it detects their known actor names.

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
- **Rendering:** a `St.Widget` carrying `Shell.BlurEffect(BACKGROUND)` is
  inserted directly beneath the original Meta.WindowActor surface, sized and
  positioned with `Clutter.BindConstraint(ALL)`. Native terminal content
  remains higher in paint order. Mutter samples already painted content.
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

- GNOME Shell's `Shell.BlurEffect` BACKGROUND mode as used in GNOME 50
  window-effect projects.
- winfx effects documentation:
  https://winfx.readthedocs.io/en/latest/guide/effects/
- Blur My Shell application effects implementation:
  https://github.com/aunetx/blur-my-shell
- Native Ptyxis profiles and transparency:
  https://github.com/kreed/ptyxis
