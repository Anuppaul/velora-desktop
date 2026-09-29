# Velora Desktop for GNOME 50

Velora Desktop is a GNOME-native adaptation of the Velora launcher concept, not a phone launcher stretched onto a desktop.

## Current interaction model

- Ubuntu Dock is hidden while Velora is enabled.
- Velora clears fixed-dock reservation so a hidden dock does not leave an empty workspace gap.
- Orb and Liquid Glass Dock are independent launcher surfaces; either one or both can be enabled.
- One movable Velora Orb defaults to the top-left.
- The independent Liquid Glass Dock shows Favorites + running apps in a floating edge-aligned glass surface.
- Liquid Dock hover reuses Velora's native live window previews.
- Liquid Dock can adapt its tint to the wallpaper, use GNOME background blur, move to any screen edge and auto-hide.
- Drag the Orb anywhere; its position survives resolution changes and is kept on a real monitor.
- Hover the Orb -> GNOME Favorites + currently running apps.
- Click the Orb -> toggles the GNOME Applications view open/closed.
- Hover icons use compact adaptive 1–4 radial layers, filling the nearest ring first.
- Icon size, same-layer icon distance and layer distance are independent.
- Safe-slot geometry prevents normal and magnified icons from overlapping or leaving the visible monitor.
- Hover app buttons are clean shadowless circles with hover magnification and an optional running dot.

## Fresh local activation without logout

GNOME 50's normal `gnome-extensions install` path discovers a newly installed local extension on the next Shell session. Its public `ReloadExtension` D-Bus method is disabled.

For local Velora development, the installer therefore supports a controlled current-session registration path:

1. Press `Alt+F2`.
2. Type `lg` and press Enter.
3. Open the **Flags** tab.
4. Enable **unsafe-mode**.
5. Close Looking Glass.
6. Run `bash gnome-shell/install.sh`.

The installer clones the installed scaffold to a unique live-load directory so GNOME's JavaScript module cache cannot return an older `extension.js`. It then uses GNOME Shell's internal extension manager to create, load and enable Velora in the current session.

After the live-registration call, the installer turns `unsafe-mode` back **off automatically**.

This path is for local development. It intentionally avoids pretending that GNOME exposes a supported public live-install API for arbitrary local extension bundles.

## Full Liquid Glass integration

Velora vendors the upstream GNOME Liquid Glass implementation from:

    https://github.com/ryohsuke1231/liquid-glass

Pinned upstream source revision:

    8b216405aff906e56204fc0fa747e7ff69fe4451

The vendored source, compiled GJS runtime and shaders are kept under:

    velora@wonderer.tech/vendor/liquid-glass/

Velora does not rewrite the upstream renderer. The integration layer loads and
uses the upstream managers directly:

- DashManager for the Velora floating dock and any detected Dash-to-Dock / Ubuntu Dock container.
- UIManager for the calendar/date menu.
- PanelMenuManager for other top-bar menus.
- NotificationManager for notification banners.
- QuickSettingsManager for whole-panel or per-toggle Quick Settings glass.
- OsdManager for volume/brightness OSD surfaces.
- ApplicationManager for application windows and the desktop context menu.
- WindowListService for the application picker used by preferences.

The upstream Appearance, Effects and Rendering preference pages are also
embedded in the Velora preferences window. Their settings use the original
upstream schema and defaults.

The upstream code is MIT licensed. The retained upstream LICENSE and source
notice live in:

    velora@wonderer.tech/vendor/liquid-glass/

### Hot-swap safety

Several upstream modules register process-global GObject types. GObject types
cannot be unregistered during the lifetime of a GNOME Shell process, so Velora
loads Liquid Glass from one stable module URI and reuses the cached module
objects across hashed Velora runtime revisions. This prevents duplicate GType
registration during live runtime hot-swap.

If the original Liquid Glass extension is already active, Velora reuses its
loaded module root and leaves its global manager stack untouched; Velora only
attaches its own floating dock surface.

### Runtime health

A healthy startup logs one line per upstream manager, for example:

    [Velora][LiquidGlass] uiManager active
    [Velora][LiquidGlass] panelMenuManager active
    [Velora][LiquidGlass] notificationManager active
    [Velora][LiquidGlass] osdManager active
    [Velora][LiquidGlass] applicationManager active
    [Velora][LiquidGlass] windowListService active

Quick Settings is intentionally attached about 1.5 seconds later and logs its
own active line.

Useful journal filter:

    journalctl -b --since "2 minutes ago" -o cat /usr/bin/gnome-shell \
      | grep -i -E 'velora|liquid glass|liquidglass|GType|shader|cogl|allocation'

## Velora bootstrap + live runtime updates

Velora is split into:

    extension.js       stable bootstrap
    runtime.js         hot-swappable behavior
    runtime.css        hot-swappable visual layer
    apps.js
    dock.js
    floatingDock.js
    geometry.js

The bootstrap watches an internal `runtime-revision` GSettings key.

For ordinary runtime/style updates the installer:

1. hashes the runtime files;
2. copies them into `runtime-revisions/<hash>/`;
3. updates `runtime-revision`;
4. the running bootstrap dynamically imports the unique revision path;
5. old runtime/UI/CSS is disabled/unloaded;
6. new runtime/UI/CSS is enabled/loaded;
7. the bootstrap writes `runtime-loaded-revision` as acknowledgement;
8. the installer reports success without logout.

If the new runtime fails, the installer requests the previous revision again and the bootstrap rolls back.

### Bootstrap changes

Normal runtime, style and preferences changes apply live.

If the bootstrap/schema itself changes, rerun the installer with Looking Glass **unsafe-mode** enabled. The installer live-loads the changed bootstrap from a unique revision path, so a logout is not required for the local development workflow.

## Install / update

From the repository root:

    git fetch origin
    git switch main
    git pull --ff-only origin main
    bash gnome-shell/install.sh

Do not `chmod +x` the scripts; invoking them with `bash` avoids Git mode-only changes.

### Fresh install / bootstrap change

Enable Looking Glass `unsafe-mode` as described above, then run:

    bash gnome-shell/install.sh

Expected successful output ends with:

    Velora was registered and activated in the current Shell session.
    No logout is required.

### Later runtime-only update

Run:

    bash gnome-shell/install.sh

Expected output includes:

    Velora bootstrap is active; using live runtime hot-swap.
    Hot-loading Velora runtime revision <hash>...
    Velora runtime hot-swap succeeded.
    No logout is required.

## GNOME Extensions app

Open Extensions:

    gnome-extensions-app

Open Velora settings:

    gnome-extensions prefs velora@wonderer.tech

Inspect extension status:

    gnome-extensions info velora@wonderer.tech

Inspect hot runtime status:

    GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
    gsettings get org.gnome.shell.extensions.velora runtime-revision

    GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
    gsettings get org.gnome.shell.extensions.velora runtime-loaded-revision

    GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
    gsettings get org.gnome.shell.extensions.velora runtime-error

## Customization

Velora exposes:

- Orb on/off.
- Liquid Glass Dock on/off; Orb and Dock may be enabled together.
- Liquid Dock position: bottom / top / left / right.
- Liquid Dock icon size, gap, edge distance and glass opacity.
- Wallpaper-adaptive Liquid Dock tint.
- Optional native background blur with a no-blur fallback.
- Liquid Dock auto-hide with configurable delay.
- Hide/show Ubuntu Dock.
- Adaptive / forced 2 / 3 / 4 hover layers.
- Hover app icon size (20–80 px).
- Icon distance.
- Layer distance.
- Orb size (20–80 px).
- Orb opacity (0–100%).
- Optional Orb auto-fade to 0 opacity after an idle delay; hovering the same location restores the configured opacity.
- Custom Orb icon (themed icon name or absolute SVG/PNG path).
- Auto-hide Orb with configurable delay and edge reveal.
- Hover delay.
- Close delay.
- Animation duration.
- Running-app dot.
- App-name tooltips.
- Direct Orb drag positioning.
- Reset-to-top-left.

## Dock-state safety

Before hiding Ubuntu Dock, Velora persists the original:

- `manualhide`
- `dock-fixed`

The saved snapshot survives a Shell restart/crash. Velora restores it on normal disable, and the uninstaller can also recover it while Velora is inactive.

Manual emergency recovery:

    gsettings set org.gnome.shell.extensions.dash-to-dock manualhide false
    gsettings set org.gnome.shell.extensions.dash-to-dock dock-fixed true

Use the second command only if your Dock was fixed before Velora.

## Debug

Shell log:

    journalctl -f -o cat /usr/bin/gnome-shell | grep -i velora

Preferences log:

    journalctl -f -o cat /usr/bin/gjs

## Uninstall

From the repository root:

    bash gnome-shell/uninstall.sh
