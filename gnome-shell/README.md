# Velora for GNOME 50

Velora is a GNOME Shell Liquid Glass material layer for Ubuntu/GNOME 50.

The current product direction is to preserve GNOME's existing UI and progressively replace supported Shell surface backgrounds with the Velora material. Layout, content, controls and native interaction should remain unchanged.

## Current rollout

Velora is being applied one surface at a time:

1. notification banners;
2. Date / Calendar menu;
3. Quick Settings;
4. other panel menus;
5. OSD surfaces;
6. panel and dock surfaces;
7. additional Shell-owned surfaces.

The notification banner is the current pilot target.

## Material engine

The production renderer lives under:

    velora@wonderer.tech/vendor/liquid-glass/

Key capabilities already present in the renderer include:

- shared wallpaper mirroring through `BackgroundMirror`;
- separable Gaussian blur;
- Dual Kawase blur;
- half- and quarter-resolution blur;
- cross-frame blur reuse;
- refraction and chromatic fringe;
- tint, brightness, contrast and saturation controls;
- rim/specular/shadow material terms;
- clipping, culling and damage-oriented rendering.

Rendering actors are internal implementation layers. They must not appear as a second visible card or change the original target geometry.

The current architecture contract is documented in:

    ../docs/ARCHITECTURE.md

## Runtime layout

Velora uses a stable bootstrap with hot-swappable runtime files:

    extension.js
    runtime.js
    runtime.css
    apps.js
    dock.js
    floatingDock.js
    liquidGlassDock.js
    geometry.js

Vendored Liquid Glass modules and shaders are loaded from a stable module root because several modules register process-global GObject types.

## Install / update

From the repository root:

    git fetch origin
    git switch main
    git pull --ff-only origin main
    bash gnome-shell/install.sh

For a fresh local install or bootstrap/schema change, enable GNOME Looking Glass unsafe mode first:

1. press `Alt+F2`;
2. enter `lg`;
3. open **Flags**;
4. enable **unsafe-mode**;
5. run the installer.

The installer disables unsafe mode again after live registration.

Ordinary runtime-only revisions use Velora's hot-swap path and do not require a logout.

## Status

Inspect the extension:

    gnome-extensions info velora@wonderer.tech

Open preferences:

    gnome-extensions prefs velora@wonderer.tech

Follow Shell logs:

    journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E 'velora|liquid glass|liquidglass'

Useful runtime status keys:

    GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
    gsettings get org.gnome.shell.extensions.velora runtime-revision

    GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
    gsettings get org.gnome.shell.extensions.velora runtime-loaded-revision

    GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/velora@wonderer.tech/schemas" \
    gsettings get org.gnome.shell.extensions.velora runtime-error

## Development rules

For a Shell target under conversion:

- preserve its original content tree and interaction;
- remove only the native opaque/background material;
- match the original geometry and corner radius;
- use the wallpaper-oriented low-load path unless live scene capture is necessary;
- coalesce geometry synchronization to redraw time;
- avoid unconditional per-frame work;
- ensure disable/cleanup restores native styling;
- stabilize the target before extending the material to another surface.

Some older launcher-oriented runtime code may still exist while the project is migrated. It is not the current architecture contract and should not drive new material work.

## Uninstall

From the repository root:

    bash gnome-shell/uninstall.sh
