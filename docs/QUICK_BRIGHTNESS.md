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

## Fullscreen video and Mutter direct scanout

When a fullscreen browser/video/game is eligible for **direct scanout**,
Mutter may send its buffer directly to the monitor, bypassing Shell's
`uiGroup` compositor pass. That made videos suddenly return to their full
native brightness while the software brightness slider was still below
100%, even though windowed apps and the panel were dimmed.

GNOME Shell 50 exposes the same balanced compositor API used by its own
on-screen-display controls:

- **30–99% software brightness:** Velora calls
  `global.compositor.disable_unredirect()` exactly once while its
  `uiGroup` GPU brightness effect is active. Fullscreen video must then
  pass through the Shell compositor, which applies the same dimming.
- **100%, hardware-backlight switch, feature OFF, runtime hot-swap or GPU
  attach failure:** Velora removes its GPU effect and calls
  `enable_unredirect()` **once** on the *same compositor instance*.
- **No compositor API:** fail closed with an Unavailable status; never
  claim to dim fullscreen content while the compositor bypasses the
  effect. The slider remains safe but cannot enforce software brightness.
- Other extensions and GNOME OSD controls also hold compositor inhibitors.
  This method is **reference counted**; Velora releases only its own hold.

**Performance trade-off:** While below 100%, fullscreen video and games
cannot use direct scanout. They must be composited, which can increase GPU
activity, latency and power consumption compared with unmodified fullscreen
rendering. At 100% the restriction is removed. This is required for a
software-compositor brightness effect to remain visible in fullscreen;
it is not physical hardware backlight adjustment.

Device QA: compare the same video windowed versus fullscreen at 60%, then
at 100%. Try Firefox fullscreen video, and check that the brightness effect
stays active after closing Quick Settings. GNOME 50.1 Wayland multi-monitor,
HDR and gaming fullscreen paths require on-device verification.

## GPU / Wayland safety

The software fallback uses one bounded
`Clutter.BrightnessContrastEffect` on **`Main.layoutManager.uiGroup`**.
GNOME Shell 50 groups the normal desktop windows, top/always-on-top
windows, wallpaper, top panel, Quick Settings and other Shell-owned chrome
under this actor. Previously Velora attached the effect only to
`global.window_group`; this left the top panel and Quick Settings undimmed
and made the effect appear **not fullscreen**.

The new host affects the **whole GNOME desktop scene** at once, including
fullscreen applications while Mutter composites the scene. It is **not**
the dangerous root `global.stage`, and it does not create a fullscreen
overlay. If the GNOME scene tree does not contain both normal and
top-window groups, Velora fails closed rather than silently reverting to
partial window-only brightness.

At 100% the effect is removed completely and direct scanout can
resume. At 30–99% one GPU brightness postprocessing pass is active on
uiGroup, clamped to a maximum negative brightness offset of -0.5,
and Mutter's fullscreen direct scanout is explicitly inhibited.
It does not change actor/window opacity.
This is compositor software dimming, not hardware backlight control.
Unusual display/compositor/HDR paths still require device-specific
verification; test GNOME 50.1 with ordinary and fullscreen browser video.

Disable the feature or disable Velora to remove only the GPU effect owned
by Velora and restore native Quick Settings ordering. Any changes to a
native GNOME hardware brightness slider remain managed by GNOME itself.

If the full-screen effect looks wrong, restore normal brightness immediately:

```bash
GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
  gsettings set org.gnome.shell.extensions.velora quick-soft-brightness 100
```

Or use **Velora Preferences → Menus → Quick Settings Brightness → OFF**.
Both paths remove the Velora-owned GPU effect, leaving the native display
brightness and other extensions' effects alone.

For accessibility, the software slider's accessible name identifies that
it is not a hardware backlight control.

## Known limits and verification

- **Real GNOME 50.1 / Wayland visual testing is still required.** CI checks
  that the compositor effect targets uiGroup and holds a balanced
  direct-scanout inhibitor while dimming; disabling/100% releases both.
  Mocked tests cannot verify real video brightness or GPU frame timings.
  Check fullscreen Firefox video and multi-monitor setups in particular.
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
- GNOME developer confirmation of direct-scanout inhibition:
  https://discourse.gnome.org/t/my-window-borders-disappear-without-consistency/33951
- GNOME Shell 50 `js/ui/osdWindow.js` balanced
  `global.compositor.disable_unredirect()` /
  `global.compositor.enable_unredirect()` for its native OSD.
- GNOME Shell 49 brightness migration:
  https://gjs.guide/extensions/upgrading/gnome-shell-49.html
- `Clutter.BrightnessContrastEffect` (native Mutter effect):
  https://mutter.gnome.org/clutter/method.BrightnessContrastEffect.set_brightness.html
