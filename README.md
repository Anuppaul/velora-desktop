# Velora

Velora is a GNOME Shell 50 Liquid Glass theme/material extension for Ubuntu.

The old custom launcher, radial app rings and floating dock have been retired. The **Velora Orb remains** as a small desktop control; clicking it opens GNOME's native Applications view.

Everything else follows one rule:

> Keep GNOME/Ubuntu's existing design, layout, controls, content and animation. Replace only the supported Shell surface material with Velora Liquid Glass.

## Current architecture

Velora keeps the production renderer under:

    gnome-shell/velora@wonderer.tech/vendor/liquid-glass/

The renderer provides shared wallpaper mirroring, Gaussian/Dual-Kawase blur, downscaled blur, cache/reuse, refraction, chromatic fringe, tint/saturation and rim/specular terms.

The active runtime is intentionally small:

    runtime.js
      -> orbThemeRuntime.js
      -> liquidGlassDock.js
           -> popupGlass.js
           -> notificationGlass.js
           -> vendored panel / OSD / native-dock renderer

### Popup surfaces

GNOME Shell 50 popup geometry is owned by BoxPointer:

    BoxPointer
      -> BoxPointer.bin
           -> menu.box (.popup-menu-content)

Velora's generic PopupGlassManager patches PopupMenu.open() and replaces the St.Bin child with an in-tree overlay:

    BoxPointer.bin
      -> Velora overlay
           -> Liquid Glass material
           -> original menu.box

The original menu content remains the top layer. GNOME continues to own positioning, scale, opacity and open/close animation. Velora only makes the original card paint transparent.

This single adapter covers Date/Calendar, Quick Settings outer surfaces, panel dropdowns and other GNOME PopupMenu instances.

### Notifications

Notifications keep the already-proven wallpaper-only Liquid Glass pilot. Their native icon, text, actions, spacing and animation are unchanged.

### Orb

The Orb is the only retained launcher-era Velora surface. It remains draggable and supports idle hide/fade. It no longer opens a custom radial launcher; it opens GNOME Applications.

## Scope

Velora directly themes GNOME Shell/compositor-owned UI. GTK/libadwaita application interiors are a separate theming domain and require a separate GTK/libadwaita theme layer for true whole-desktop consistency.

## Install

    git pull --ff-only origin main
    bash gnome-shell/install.sh

The installer targets GNOME Shell 50 and uses Velora's stable-bootstrap/runtime hot-swap mechanism.

See:

    docs/ARCHITECTURE.md
    gnome-shell/README.md
