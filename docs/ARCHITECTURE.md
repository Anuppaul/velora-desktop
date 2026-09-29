# Velora Architecture

## Product contract

Velora does not redesign Ubuntu/GNOME Shell surfaces.

A supported target keeps its existing:

- position and size;
- content hierarchy;
- controls and hit targets;
- native transitions and interaction;
- accessibility semantics.

Velora changes the visual material underneath that content.

The desired result is one Liquid Glass silhouette occupying the same geometry as the original surface.

## Material pipeline

For Shell surfaces that do not require live scene capture, the preferred path is:

    GNOME target geometry
            |
    shared wallpaper source
            |
    downscaled blur
      - Gaussian, or
      - Dual Kawase
            |
      LiquidEffect
      - refraction
      - chromatic fringe
      - tint
      - saturation
      - rim/specular
      - restrained shadow
            |
    original GNOME content

Internal actors are implementation details. They must not appear as a second visible card, border or offset background.

## Performance rules

Velora should be damage-driven.

- Do not redraw continuously when the source and geometry are unchanged.
- Reuse the shared wallpaper source.
- Reuse blur output across frames when the input is unchanged.
- Prefer half-resolution blur by default and quarter-resolution for low-power mode.
- Use live window clones only for surfaces that genuinely need dynamic scene content.
- Coalesce geometry changes to the compositor redraw phase.
- Avoid CPU readback for routine appearance decisions.
- Keep adaptive sampling infrequent and event-driven.

## Existing renderer

The vendored renderer already provides:

- `BackgroundMirror`: shared wallpaper source;
- `BlurRenderer`: Gaussian and Dual Kawase blur;
- configurable blur downscale;
- cross-frame blur caching;
- `LiquidEffect`: refraction/material composite;
- window/UI clone infrastructure for targets that need live scene capture;
- clipping/culling helpers;
- notification, menu, Quick Settings, OSD and application managers.

New Shell theming work should reuse these primitives rather than introducing independent blur stacks.

## Surface rollout

The rollout is incremental so a working Shell surface is never replaced globally before the material is proven stable.

Current order:

1. Notification banner
2. Date / Calendar menu
3. Quick Settings
4. Other panel menus
5. OSD
6. Top panel and dock
7. Additional Shell-owned surfaces

A stage is considered successful only when:

- native layout is unchanged;
- native interaction still works;
- no duplicate visible background exists;
- blur/refraction are visually aligned with the target;
- idle cost is low;
- cleanup/disable restores the original Shell state.

## Notification pilot

The notification banner is the first production target.

The notification pilot must:

- leave the notification message, buttons, icon, spacing and animation untouched;
- remove only the native banner background material;
- attach the Velora Liquid Glass material to the same banner geometry;
- use the low-load wallpaper-oriented path by default;
- avoid changing notification center/message-list layout;
- restore native styling cleanly on disable.

## Scope boundary

GNOME Shell extension code can directly transform Shell/compositor-owned UI.

GTK and libadwaita application content is outside this renderer and requires a separate application-theme layer if Velora later chooses to cover it.
