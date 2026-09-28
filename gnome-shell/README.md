# Velora Desktop for GNOME 50

Velora Desktop is a GNOME-native adaptation of the Velora launcher concept, not a phone launcher stretched onto a desktop.

## Current interaction model

- Ubuntu Dock is hidden while Velora is enabled.
- Velora clears fixed-dock reservation so a hidden dock does not leave an empty workspace gap.
- One movable Velora V orb defaults to the top-left.
- Drag V anywhere; its position survives resolution changes and is kept on a real monitor.
- Hover V -> GNOME Favorites + currently running apps.
- Click V -> GNOME Applications view with installed apps.
- Hover icons use adaptive 2–4 radial layers.
- Icon size, same-layer icon distance and layer distance are independent.
- Safe-slot geometry prevents normal and magnified icons from overlapping or leaving the visible monitor.
- Native app icons use premium circular glass surfaces, hover magnification and an optional running dot.

## Why local GNOME extensions normally need logout

GNOME 50's local `gnome-extensions install` command installs a bundle for the **next Shell session**. Its public D-Bus interface still lists `ReloadExtension`, but GNOME 50 implements that method as unsupported.

Remote extensions from extensions.gnome.org use a different internal install path that can create/load/enable an extension in the running Shell.

Velora therefore uses a stable bootstrap after the initial local install.

## Velora bootstrap + live runtime updates

Velora is split into:

    extension.js       stable bootstrap
    runtime.js         hot-swappable behavior
    runtime.css        hot-swappable visual layer
    apps.js
    dock.js
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

### When logout is still required

A logout/login is required only when the **bootstrap scaffold itself** changes:

- first-ever local Velora installation;
- `extension.js` bootstrap changes;
- `metadata.json` changes;
- GSettings schema changes;
- bootstrap `stylesheet.css` changes.

Normal changes to these files apply without Shell logout:

- `runtime.js`
- `runtime.css`
- `apps.js`
- `dock.js`
- `geometry.js`
- `prefs.js` (close/reopen the Preferences window if it was already open)

The current migration to this bootstrap architecture therefore needs **one final logout/login**. Once this bootstrap is loaded, future ordinary Velora development updates can be applied live.

## Install / update

From the repository root:

    git fetch origin
    git switch feat/velora-gnome-shell
    git pull origin feat/velora-gnome-shell
    bash gnome-shell/install.sh

Do not `chmod +x` the scripts; invoking them with `bash` avoids Git mode-only changes.

### First bootstrap install / scaffold change

The installer prints that the scaffold was installed. Then:

    Log Out
    Log In

and:

    gnome-extensions enable velora@wonderer.tech

That loads the stable bootstrap.

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

- Hide/show Ubuntu Dock.
- Adaptive / forced 2 / 3 / 4 hover layers.
- App icon size.
- Icon distance.
- Layer distance.
- Orb size.
- Orb opacity.
- Hover delay.
- Close delay.
- Animation duration.
- Running-app dot.
- App-name tooltips.
- Two Velora gradient colors.
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
