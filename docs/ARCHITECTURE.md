# Velora Architecture

## Product contract

Velora is a GNOME Shell material replacement, not a replacement desktop UI.

The Velora Orb remains. The old radial launcher, custom launcher geometry, custom floating dock and app-preview system are retired.

For every supported Shell surface Velora preserves:

- native geometry and content;
- native controls and hit targets;
- native GNOME animation and interaction;
- accessibility semantics.

Velora changes the painted material underneath that content.

## Renderer

The vendored production renderer provides:

- shared wallpaper source through BackgroundMirror;
- Gaussian and Dual-Kawase blur;
- half/quarter-resolution blur and cache/reuse;
- LiquidEffect refraction and chromatic fringe;
- tint, brightness, contrast and saturation;
- rim/specular/shadow terms;
- clipping/culling and GNOME-native actors/effects.

Normal Shell cards prefer the wallpaper-oriented path. Live window/UI cloning is reserved for renderer components that genuinely require dynamic scene capture.

## Generic PopupMenu adapter

GNOME Shell 50 creates a PopupMenu as:

    menu.actor = BoxPointer
      -> BoxPointer.bin = St.Bin
           -> menu.box = St.BoxLayout(.popup-menu-content)

Ubuntu/Yaru paints the normal popup card on .popup-menu-content. Date Menu adds .datemenu-popover primarily for its radius.

Velora therefore does not place a second card in Main.uiGroup and chase popup geometry.

PopupGlassManager patches PopupMenu.PopupMenu.prototype.open. On first open it safely transforms:

    BoxPointer.bin
      -> original menu.box

into:

    BoxPointer.bin
      -> overlay (Clutter.BinLayout)
           -> wallpaper-backed LiquidEffect material
           -> original menu.box

The original box gets only the velora-liquid-popup-content class, which removes background/border/shadow paint but does not alter radius, padding or content.

Because the material is inside BoxPointer, GNOME automatically carries native position, scale, translation, opacity and open/close animation.

The wallpaper clone is counter-transformed during paint so the sampled wallpaper remains fixed in stage space while the glass surface itself follows BoxPointer animation.

Disable/cleanup first reparents menu.box back into BoxPointer.bin, then destroys the Velora overlay. This prevents native Shell content from being destroyed with the extension actor.

## Coverage

The generic PopupMenu adapter covers:

- Date / Calendar menu;
- Quick Settings outer menu;
- panel/status menus;
- application/context/background menus implemented as PopupMenu;
- future standard PopupMenu instances created while Velora is enabled.

Nested PopupSubMenu content sits inside the parent glass and receives a light translucent material treatment instead of another expensive blur layer.

Notifications use the proven notificationGlass manager.

Top panel, OSD and native Ubuntu Dock/Dash-to-Dock continue to use the vendored production renderer while their dedicated low-load adapters are refined.

## Performance rules

- no permanent JS polling loop for PopupMenu surfaces;
- shared wallpaper source instead of CPU readback;
- Dual-Kawase for popup material;
- renderer downscale/cache settings remain available;
- property writes are avoided when values have not changed;
- popup material exists only after a PopupMenu is actually opened;
- native GNOME animation owns transforms.

## Orb

orbThemeRuntime.js owns only the Orb and the Liquid Glass integration.

The Orb is draggable, supports idle hide/fade and opens Main.overview.showApps().

There is no custom app ring, launcher geometry, floating dock or app preview in the active runtime.

## GTK/libadwaita boundary

A GNOME Shell extension cannot transparently replace the internal rendering of arbitrary GTK/libadwaita applications. Velora's Shell material layer covers Shell-owned surfaces. A separate GTK/libadwaita theme layer is required for matching application interiors.
