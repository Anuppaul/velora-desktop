# Velora for GNOME Shell 50

Velora keeps the native Ubuntu/GNOME desktop UI and replaces supported Shell surface materials with Liquid Glass.

The separate floating dock is removed. The Velora Orb keeps its full behavior: click toggles GNOME Applications and hover opens the radial launcher with previews, tooltips and running indicators.

## Active runtime

    velora@wonderer.tech/
      runtime.js
      orbThemeRuntime.js
      liquidGlassDock.js
      popupGlass.js
      notificationGlass.js
      runtime.css
      vendor/liquid-glass/

PopupGlassManager is the canonical path for standard GNOME PopupMenu surfaces. It inserts the material inside BoxPointer.bin under the original menu.box, so GNOME continues to own layout and animation.

Notifications retain the validated wallpaper-only material implementation.

The vendored renderer remains the production rendering engine.

## Install / update

From the repository root:

    git pull --ff-only origin main
    bash gnome-shell/install.sh

Velora targets GNOME Shell 50.

For a fresh bootstrap/schema install, follow the installer's unsafe-mode prompt if shown. Ordinary runtime revisions use the hot-swap path.

## Logs

    journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E 'velora|liquid glass|liquidglass'

Expected popup adapter startup log:

    [Velora][PopupGlass] global PopupMenu adapter active

When a popup is first converted:

    [Velora][PopupGlass] attached ...

## Preferences

    gnome-extensions prefs velora@wonderer.tech

The main Velora page contains only the shared system-glass profile and Orb controls. Advanced renderer controls come from the vendored Liquid Glass preference pages.

## Architecture

See:

    ../docs/ARCHITECTURE.md
