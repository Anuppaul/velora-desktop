# Velora

Velora is a GNOME Shell visual-material project for Ubuntu/GNOME 50.

Its goal is simple: keep the desktop's existing interaction model, layout, controls, menus and content exactly where they already are, and progressively replace supported Shell surface backgrounds with a low-load Liquid Glass material.

Velora is not an Android launcher port and it is no longer defined by the earlier Orb/launcher concept documents.

## Current direction

Velora applies Liquid Glass one Shell surface at a time without redesigning that surface.

The current rollout order is intentionally incremental:

1. notification banners;
2. Date / Calendar menu;
3. Quick Settings;
4. other top-panel menus;
5. OSD surfaces;
6. panel and dock surfaces;
7. additional Shell-owned surfaces after each earlier stage is stable.

For each target:

- preserve native GNOME geometry, content, input and animation;
- remove only the original opaque/background material;
- render one glass silhouette matching the target's existing shape;
- prefer the shared wallpaper source instead of live full-screen/window capture where possible;
- use low-resolution blur and cached rendering;
- add restrained refraction, tint, saturation, rim light and specular response;
- avoid continuous repaint work while the source and geometry are unchanged;
- keep a cheap fallback path.

## Rendering engine

Velora vendors and extends the Liquid Glass renderer under:

    gnome-shell/velora@wonderer.tech/vendor/liquid-glass/

The renderer already contains the main production primitives needed for the theme:

- shared wallpaper mirroring;
- Gaussian and Dual Kawase blur;
- half- and quarter-resolution blur;
- cross-frame blur reuse;
- refraction and chromatic fringe;
- tint, saturation, rim/specular and shadow terms;
- capture clipping and culling;
- GNOME/Clutter-native actors and effects.

The implementation target is not an extra visible card behind a GNOME card. Rendering actors may exist internally, but the user should see a single material surface matching the original GNOME shape.

## Repository

Active GNOME implementation:

    gnome-shell/

Current architecture:

    docs/ARCHITECTURE.md

Installation and development workflow:

    gnome-shell/README.md

## Scope

Velora can directly theme GNOME Shell/compositor-owned surfaces such as notifications, panel menus, Quick Settings, OSDs, panel/dock surfaces and other Shell UI.

GTK/libadwaita application content is a separate theming domain and is not automatically transformed by a GNOME Shell extension.
