# Velora GNOME Concept

## Principle

Velora on GNOME is a desktop interaction layer, not an Android launcher stretched onto a monitor.

The central object is a movable Velora Orb with a compact pure-black circular background and a white symbolic icon. It replaces the persistent desktop role of the dock while preserving GNOME's native Overview, Applications, Workspaces, Quick Settings and Notifications.

## Primary interaction

1. Ubuntu Dock is hidden without leaving its fixed workspace gap.
2. The Orb defaults to the top-left but can be dragged anywhere.
3. Hover the Orb -> Favorites + currently running apps expand around it.
4. Click the Orb -> GNOME Applications view toggles open/closed.
6. Hover icons use adaptive 2, 3 or 4 radial layers.
7. Edge/corner geometry uses only fully visible non-overlapping positions.
8. Moving away collapses hover icons back into the Orb.

## Desktop adaptation matrix

| Mobile Velora idea | GNOME decision | Desktop implementation |
| --- | --- | --- |
| Freeform Home placement | Keep concept | Draggable Orb |
| Aurora / Liquid Glass | Keep visual language | Premium app surfaces; main Orb stays compact pure black with a white icon |
| App drawer | Adapt | Click Orb toggles a native GNOME Applications view with optional Velora minimal styling |
| Fast pinned apps | Adapt | Hover Orb shows Favorites + running apps |
| Per-item sizing | Keep | Icon size, icon distance and layer distance |
| Dynamic icons | Adapt | Native desktop icons + running dot |
| Mobile Control Center | Remove | GNOME Quick Settings owns this |
| Mobile Notifications | Remove | GNOME Notification Center owns this |
| Brightness / volume controls | Remove | Native GNOME controls remain canonical |
| Android widgets | Remove | Not a native GNOME Shell equivalent |
| Back / Home / Recents | Remove | GNOME Overview, app switching and Workspaces replace them |
| Phone edge swipes | Remove | Mouse hover, click and drag |
| Three phone Home pages | Remove | GNOME Workspaces are the desktop-native model |
| Backup JSON | Remove | GSettings persists Velora preferences |

## Customization contract

User-controlled settings include:

- Orb position.
- Orb size and opacity.
- Orb icon (themed icon name or absolute SVG/PNG path).
- Optional Orb auto-hide with delay and edge reveal.
- App icon size.
- Same-layer icon distance.
- Radial layer distance.
- Automatic or forced 2/3/4-layer hover layout.
- Hover/open/close timing.
- Running-app indicator.
- Tooltip visibility.
- Dock replacement on/off.
