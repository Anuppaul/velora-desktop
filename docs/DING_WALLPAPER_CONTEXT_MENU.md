# Desktop wallpaper right-click: optional DING frosted menu

This is **not** the App Grid or Ubuntu Dock context menu. On Ubuntu GNOME 50,
empty-desktop right-click is owned by Desktop Icons NG
(`ding@rastersoft.com`), a **separate GTK application**.

## What the opt-in treatment does

`tools/ding_wallpaper_menu.py` applies only to the **installed DING
application stylesheet**, not GNOME Shell, GTK globally or Velora's main
Liquid/Frosted renderer. It gives DING's GTK3 context menus a
theme-aware translucent surface, rounded corners, subtle rim and hover
treatment. It also affects DING desktop-file menus that use the same GTK
menu CSS nodes.

**Optical limitation:** GTK CSS translucency is not Velora's GPU LiquidEffect.
The menu **will not** refract or blur wallpaper pixels. It is a frosted
*appearance*, not a true Liquid Glass port. Do not describe a passing unit
test as on-device visual proof.

**Scope and safety:** This optional helper is developer-side tooling. It is
excluded from GNOME Extensions Store ZIPs. It does not run automatically when
installing Velora. DING source/version may change after a distro or extension
update, so inspect/reapply only after verifying support.

## Install (GNOME Shell 50 / supported GTK3 DING)

First update the Velora checkout:

```bash
cd ~/Documents/code/velora-desktop
git pull origin main
```

Find the active DING install:

```bash
gnome-extensions info ding@rastersoft.com
python3 tools/ding_wallpaper_menu.py status
```

The tool must recognize DING's `metadata.json` UUID and verify that
the GTK3 application loads `app/stylesheet.css` directly. If it reports
GTK4/resources or unsupported layout, **stop**. It changes nothing.

To opt in, explicitly apply the DING-only CSS. For a normal Ubuntu
system-managed DING install, writing to `/usr/share` typically needs root:

```bash
sudo python3 tools/ding_wallpaper_menu.py apply \
  --ding-dir /usr/share/gnome-shell/extensions/ding@rastersoft.com
```

Only use that path **if it matches** the `Path:` shown by
`gnome-extensions info`. For a user-writable install, omit `sudo` and
supply the actual DING install path. The script refuses unsupported layouts,
creates `app/stylesheet.css.velora-original`, and inserts a visibly marked
CSS block exactly once.

DING may keep its old in-memory CSS until its app restarts. You can toggle
**Desktop Icons NG** off and on in the Extensions app to refresh DING
(the desktop icons will briefly disappear). There is no need to log out of
the GNOME session or reinstall/hot-swap Velora.

## Restore

Use the same DING path and permissions:

```bash
sudo python3 tools/ding_wallpaper_menu.py restore \
  --ding-dir /usr/share/gnome-shell/extensions/ding@rastersoft.com
```

The tool removes *only* its marked CSS block and preserves other rules,
including changes added after install. It keeps the original backup for
manual recovery. If file ownership or permissions are different, run with
the appropriate user instead of `sudo`.

## Verification and limitations

Inspect the **wallpaper** context menu itself on GNOME 50. Confirm text
contrast in light/dark themes, hover/focus, menu actions, placement at
screen edges, no opaque white rectangle, and that DING desktop icons still
work. No screenshot/physical GNOME test can be performed by repository CI.

GNOME Shell's `PopupGlassManager` does not own these GTK popovers.
The native app-menu PRs #66/#67 were not fixes for wallpaper right-click.
True wallpaper-refraction would need a separate supported GTK/compositor
integration, beyond what GTK CSS can express.

The underlying DING project is a separate GPL-licensed extension. This
optional local user customization does not include or distribute any
patched DING code in Velora's GNOME Store ZIP.
