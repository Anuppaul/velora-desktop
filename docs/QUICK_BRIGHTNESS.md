# Velora Quick Settings — Brightness directly below Sound

GNOME Shell 50 includes a native **Brightness QuickSlider**, but hides it
when `Main.brightnessManager.globalScale` is unavailable. This commonly
happens on desktop PCs using an external monitor without a GNOME-controlled
hardware backlight.

Velora makes this control usable in both cases, with **the same native
slider design and glass styling as Sound**, immediately below the volume
output slider. No new desktop package, DDC/CI utility or daemon is required.

## Behavior

| Display type | Quick Settings Brightness control | Effect |
| --- | --- | --- |
| Supported native backlight | GNOME's existing BrightnessItem | Native hardware brightness; GNOME owns updates |
| External monitor / no native backlight | One Velora QuickSlider | Software brightness reduction, 30–100% |
| Feature disabled | Original GNOME layout | Software GPU effect immediately removed |

**Important difference:** software dimming lowers perceived image brightness
by changing compositor color brightness; it cannot increase a monitor's
actual hardware brightness, adjust its physical backlight, save backlight
power or use DDC/CI. For physical external-monitor brightness, a supported
DDC/CI interface is needed separately.

The fallback never claims to control the physical monitor. It is labeled
**Brightness (software dimming)** for accessibility and in status.

## Install / hot reload

```bash
cd ~/Documents/code/velora-desktop
git pull origin main
bash gnome-shell/install.sh
```

The existing developer installer hot-swaps the new runtime on GNOME 50
without logout when Velora's compatible bootstrap is already active.

Open **Quick Settings** from the top right. The sound slider appears first,
with the new Brightness row directly below. On a laptop with hardware
backlight, Velora only repositions GNOME's own slider. On a desktop without
supported hardware backlight, Velora inserts the fallback in the same
`QuickSettingsMenu._grid` and gives it the same two-column span.

## Preferences

Open:

```bash
gnome-extensions prefs velora@wonderer.tech
```

Then **Menus → Quick Settings Brightness**:

- **Brightness below Sound** (default ON): enables the position override or
  software fallback.
- **Software brightness (%)** (30–100, default 100): available on displays
  without a supported hardware slider. At 100%, the image is unchanged and
  no extra GPU dimming effect is allocated.
- **Brightness control mode** shows whether GNOME hardware or software
  dimming is in use.

Only one QuickSlider is displayed for brightness: native when available,
Velora fallback otherwise. Input-volume and other Quick Settings entries
are not replaced. If native hardware support changes while running, Velora
switches modes and destroys the fallback before showing native brightness.

## GPU / Wayland safety

The software fallback uses one bounded
`Clutter.BrightnessContrastEffect` on `global.window_group`, which holds
desktop wallpaper and application windows; the Shell panel/Quick Settings
remain legible. No effect is created at the 100% setting. The dimmer runs
only at 30–99%, clamps to a maximum brightness-offset decrease of -0.5,
never touches window alpha, and never applies an effect to `global.stage`
(the root stage shader path can blank displays on Wayland).

Disable the feature or disable Velora to remove only the GPU effect owned
by Velora and restore native Quick Settings ordering. Any changes to a
native GNOME hardware brightness slider remain managed by GNOME itself.

For accessibility, the software slider's accessible name identifies that
it is not a hardware backlight control.

## Known limits and verification

- **Real GNOME 50.1 / Wayland visual testing is still required.** CI checks
  placement, slider/control behavior and cleanup with a mock Shell scene;
  they cannot prove the live display actually dims.
- The software dimmer processes the compositor's window group rather than
  changing monitor hardware. A maximum brightness of 100% is the original
  monitor output, not an enhancement.
- Other extensions that apply color/brightness effects to the same actor
  may combine with this effect. Velora creates only its own named effect and
  does not remove other extensions' effects.
- GSettings values remain within the extension's private schema directory.
  Read status with:

```bash
GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
  gsettings get org.gnome.shell.extensions.velora quick-brightness-status
```

## Terminal Glass remains paused

The unfinished Ptyxis Terminal Glass backdrop implementation is not
modified by this feature. To prevent its current frame-edge blur issue
from affecting testing, turn **Terminal → Real backdrop blur OFF** in
Velora Preferences. Native Ptyxis background transparency can remain on.

## Source references

- GNOME Shell 50 native brightness control:
  `js/ui/status/brightness.js` and `js/misc/brightnessManager.js`.
- GNOME Shell 50 Quick Settings widget/grid:
  `js/ui/quickSettings.js` and `js/ui/panel.js`.
- GNOME Shell 49 brightness migration:
  https://gjs.guide/extensions/upgrading/gnome-shell-49.html
- `Clutter.BrightnessContrastEffect` (native Mutter effect):
  https://mutter.gnome.org/clutter/method.BrightnessContrastEffect.set_brightness.html
