# Velora Desktop

**Velora** is an open-source Liquid Glass material layer for **GNOME Shell 50** on Ubuntu.

It keeps the desktop's native interaction model, layout, controls, menus, content, and animations intact while progressively replacing supported GNOME Shell surface backgrounds with a GPU-rendered refractive glass material.

> Native GNOME/Ubuntu behavior first. Velora changes the material underneath it.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-50-4A86CF.svg)
![Open Source](https://img.shields.io/badge/Open%20Source-Yes-brightgreen.svg)

## Highlights

- **Native GNOME Shell preserved** — Velora does not replace the desktop shell with a custom desktop UI.
- **Liquid Glass surfaces** — blur, refraction, chromatic dispersion, tint, saturation, rim/specular lighting, and optical depth.
- **Velora Orb** — draggable, multi-monitor aware radial launcher with app previews, tooltips, running indicators, and idle hide/fade behavior.
- **Native Ubuntu Dock integration** — the existing Ubuntu Dock/Dash-to-Dock interaction model and icon behavior stay intact while supported material is themed.
- **Popup integration** — Date/Calendar, Quick Settings, panel/status menus, and standard GNOME PopupMenu surfaces use the shared glass system.
- **Notifications and Shell cards** — supported Shell-owned cards receive the same visual language without replacing their native content or controls.
- **Performance-conscious renderer** — shared wallpaper sources, GPU-native actors/effects, downscaled blur, caching/reuse, and no permanent JS polling loop for popup surfaces.
- **Open source** — released under the MIT License.

## Design contract

Velora follows a strict rule:

1. GNOME owns layout, geometry, content, controls, hit targets, accessibility, and animation.
2. Velora owns the supported surface material underneath that content.
3. Existing desktop behavior should remain familiar and native.

This makes Velora a **Shell material extension**, not a replacement desktop environment.

## Supported environment

- **GNOME Shell 50**
- Ubuntu / GNOME installations running GNOME Shell 50
- Extension UUID: `velora@wonderer.tech`

Velora directly targets **GNOME Shell/compositor-owned UI**. GTK/libadwaita application interiors are a separate theming domain and are not transparently restyled by a Shell extension.

## Install

Clone the repository:

```bash
git clone https://github.com/Anuppaul/velora-launcher.git
cd velora-launcher
```

Install Velora:

```bash
bash gnome-shell/install.sh
```

The installer uses Velora's stable-bootstrap/runtime hot-swap path. On a fresh bootstrap or schema installation, follow any unsafe-mode prompt shown by the installer.

## Update

From the repository root:

```bash
git pull --ff-only origin main
bash gnome-shell/install.sh
```

## Preferences

Open the extension preferences with:

```bash
gnome-extensions prefs velora@wonderer.tech
```

The main Velora preferences page exposes the shared system-glass profile and Orb controls. Advanced renderer controls are provided by the vendored Liquid Glass preference pages.

## Architecture

The production renderer lives under:

```text
gnome-shell/velora@wonderer.tech/vendor/liquid-glass/
```

The active integration layer is intentionally small:

```text
runtime.js
├── orbThemeRuntime.js
└── liquidGlassDock.js
    ├── popupGlass.js
    ├── notificationGlass.js
    └── vendored panel / OSD / native-dock renderer
```

### Popup surfaces

GNOME Shell 50 owns popup geometry through `BoxPointer`.

Velora's `PopupGlassManager` inserts its material inside the native popup hierarchy, below the original menu content. GNOME therefore continues to control positioning, scale, opacity, accessibility, and open/close animation.

This shared adapter covers standard GNOME `PopupMenu` surfaces, including:

- Date / Calendar
- Quick Settings
- panel and status menus
- supported context/background menus
- future standard PopupMenu instances created while Velora is active

### Refractive glass renderer

Velora does not use CPU screenshots to fake transparency.

The renderer composes compositor-native GPU actors using the shared wallpaper source and, where required, live `Meta.WindowActor` clones. The Liquid Effect pipeline provides:

- Gaussian and Dual-Kawase blur
- downscaled blur and cache/reuse
- edge displacement / refraction
- chromatic dispersion
- tint, brightness, contrast, and saturation
- rim and specular lighting
- sheen and ambient-occlusion terms
- optical sampling headroom around native card bounds

The visible GNOME card remains the original actor; Velora replaces only its supported material paint.

## Performance principles

Velora is designed to keep the visual effect practical on a live desktop:

- no permanent JavaScript polling loop for PopupMenu surfaces
- shared wallpaper source instead of CPU framebuffer readback
- GPU-native Clutter/Mutter rendering paths
- downscaled/cached blur where appropriate
- property writes avoided when values have not changed
- popup material created only when required
- native GNOME animation remains responsible for transforms

## Repository structure

```text
velora-launcher/
├── docs/
│   └── ARCHITECTURE.md
├── gnome-shell/
│   ├── install.sh
│   ├── README.md
│   └── velora@wonderer.tech/
├── README.md
└── LICENSE
```

For implementation details, see:

- [Architecture documentation](docs/ARCHITECTURE.md)
- [GNOME Shell integration notes](gnome-shell/README.md)

## Development

Useful GNOME Shell logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E 'velora|liquid glass|liquidglass'
```

Expected popup adapter startup output includes:

```text
[Velora][PopupGlass] global PopupMenu adapter active
```

When a popup is converted, Velora logs an attached surface entry.

## Contributing

Contributions are welcome.

If you are changing Shell integration behavior, keep the core contract intact:

- preserve native GNOME/Ubuntu interaction and layout
- avoid replacing native controls when material-only integration is possible
- keep cleanup/disable paths safe
- avoid unnecessary polling or expensive CPU capture paths
- document architectural changes that affect surface ownership or rendering

For substantial changes, open an issue or pull request with the GNOME Shell version, reproduction steps, and relevant Shell logs.

## License

Velora is free and open-source software released under the **MIT License**.

See [LICENSE](LICENSE) for the full license text.

---

**Velora Desktop** — native GNOME behavior, refracted.
