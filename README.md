# Velora

Velora is a GNOME Shell 50 Liquid Glass theme/material extension for Ubuntu.

The floating dock and unrelated launcher-era desktop replacements are retired. The **Velora Orb keeps its full functionality**: click toggles GNOME Applications; hover opens the radial app launcher with tooltips, running indicators and live app previews.

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

The Orb remains draggable, multi-monitor aware, auto-hide/auto-fade capable, and retains its radial hover launcher. Click still toggles GNOME Applications.

## Scope

Velora directly themes GNOME Shell/compositor-owned UI. GTK/libadwaita application interiors are a separate theming domain and require a separate GTK/libadwaita theme layer for true whole-desktop consistency.

## Install

    git pull --ff-only origin main
    bash gnome-shell/install.sh

The installer targets GNOME Shell 50 and uses Velora's stable-bootstrap/runtime hot-swap mechanism.

See:

    docs/ARCHITECTURE.md
    gnome-shell/README.md


## Full refractive glass

Velora does not use CPU screenshots to fake glass. Standard popup, notification and Shell-card materials compose compositor-native GPU actors: the shared wallpaper source plus live Meta.WindowActor clones. LiquidEffect then performs blur, edge displacement/refraction, chromatic dispersion, rim/specular light, sheen, AO and tint.

The visible GNOME card remains the original actor; only its material paint is replaced. Optical source headroom extends beyond the visible card so edge lensing can bend real scene pixels instead of collapsing to a flat translucent background.
