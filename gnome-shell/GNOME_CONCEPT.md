# Velora GNOME Concept

## Principle

Velora on GNOME is a desktop interaction layer, not an Android launcher stretched onto a monitor.

Velora has two independent desktop launcher surfaces: the movable Orb and an optional floating Liquid Glass Dock. The user may run either surface alone or keep both active together. GNOME's native Overview, Applications, Workspaces, Quick Settings and Notifications remain canonical.

## Primary interaction

1. Ubuntu Dock can be hidden without leaving its fixed workspace gap.
2. Orb and Liquid Dock have independent on/off controls.
3. The Orb defaults to the top-left but can be dragged anywhere.
4. Hover the Orb -> Favorites + currently running apps expand around it.
5. Click the Orb -> native GNOME Applications view toggles open/closed.
6. The Liquid Glass Dock independently shows Favorites + currently running apps.
7. Running-app hover on either surface can show Velora's native live window preview.
8. Liquid Dock supports wallpaper-adaptive tint, small-surface background blur, edge positioning and auto-hide.
9. Hover icons use adaptive radial layers with screen-safe geometry.

## Desktop adaptation matrix

| Mobile Velora idea | GNOME decision | Desktop implementation |
| --- | --- | --- |
| Freeform Home placement | Keep concept | Draggable Orb |
| Aurora / Liquid Glass | Keep visual language | Premium app surfaces; main Orb stays compact pure black with a white icon |
| App drawer | Adapt | Click Orb toggles the native GNOME Applications view without replacing its UI |
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

- Orb on/off.
- Liquid Glass Dock on/off; both launcher surfaces may coexist.
- Liquid Dock position, icon size, icon gap and edge distance.
- Liquid Dock glass opacity, wallpaper tint, blur and auto-hide.
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
