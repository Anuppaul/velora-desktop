import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {collectDockApps} from './apps.js';

const DOCK_PADDING = 10;
const DOCK_HOVER_PADDING = 13;
const DOCK_REVEAL_PX = 7;
const DOCK_HOVER_SCALE = 0.95;
const DEFAULT_TINT = [245, 247, 252];

export class FloatingDockController {
    constructor(params) {
        this._settings = params.settings;
        this._appSystem = params.appSystem;
        this._shellSettings = params.shellSettings;
        this._layer = params.layer;
        this._showPreview = params.showPreview;
        this._hidePreview = params.hidePreview;
        this._cancelPreviewHide = params.cancelPreviewHide;
        this._schedulePreviewHide = params.schedulePreviewHide;
        this._isPreviewVisible = params.isPreviewVisible;
        this._showTooltip = params.showTooltip;
        this._hideTooltip = params.hideTooltip;

        this._root = null;
        this._glassTint = null;
        this._glassShine = null;
        this._box = null;
        this._buttons = [];
        this._hideTimeoutId = 0;
        this._hidden = false;
        this._blurEffect = null;
        this._wallpaperColorCache = null;

        this._backgroundSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.background',
        });
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        this._wallpaperChangedIds = [
            this._backgroundSettings.connect(
                'changed::picture-uri',
                () => this._invalidateWallpaperTint()
            ),
            this._backgroundSettings.connect(
                'changed::picture-uri-dark',
                () => this._invalidateWallpaperTint()
            ),
            this._interfaceSettings.connect(
                'changed::color-scheme',
                () => this._invalidateWallpaperTint()
            ),
        ];
    }

    setEnabled(enabled) {
        if (enabled)
            this.enable();
        else
            this.disable();
    }

    enable() {
        if (this._root)
            return;

        this._root = new St.Widget({
            name: 'velora-floating-liquid-dock',
            style_class: 'velora-liquidGlass-wrapper',
            reactive: true,
            track_hover: true,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._root.set_pivot_point(0.5, 0.5);

        this._glassTint = new St.Widget({
            style_class: 'velora-liquidGlass-tint',
            reactive: false,
        });
        this._glassShine = new St.Widget({
            style_class: 'velora-liquidGlass-shine',
            reactive: false,
        });
        this._box = new St.BoxLayout({
            style_class: 'velora-liquidGlass-text velora-dock-content',
        });

        this._root.add_child(this._glassTint);
        this._root.add_child(this._glassShine);
        this._root.add_child(this._box);
        this._layer.add_child(this._root);

        this._root.connect('notify::hover', () => {
            if (this._root.get_hover()) {
                this._cancelHide();
                this._reveal(true);
                this._setWrapperHover(true);
            } else {
                this._setWrapperHover(false);
                this._scheduleHide();
            }
        });

        this.refresh();
        this.syncSettings();

        this._root.opacity = 0;
        this._root.scale_x = 0.96;
        this._root.scale_y = 0.96;
        this._root.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    disable() {
        this._cancelHide();
        this._hideTooltip?.();
        this._hidePreview?.(true);

        this._root?.destroy();
        this._root = null;
        this._glassTint = null;
        this._glassShine = null;
        this._box = null;
        this._buttons = [];
        this._blurEffect = null;
        this._hidden = false;
    }

    destroy() {
        this.disable();

        for (const id of this._wallpaperChangedIds)
            this._backgroundSettings.disconnect(id);

        this._wallpaperChangedIds = [];
        this._backgroundSettings = null;
        this._interfaceSettings = null;
        this._wallpaperColorCache = null;
        this._isPreviewVisible = null;
        this._settings = null;
        this._appSystem = null;
        this._shellSettings = null;
        this._layer = null;
    }

    refresh() {
        if (!this._root || !this._box)
            return;

        this._hideTooltip?.();
        this._hidePreview?.(true);

        for (const child of this._box.get_children())
            child.destroy();

        this._buttons = [];

        const apps = collectDockApps(
            this._appSystem,
            this._shellSettings
        );

        if (apps.length === 0) {
            this._root.hide();
            return;
        }

        this._root.show();

        const position = this._settings.get_string(
            'floating-dock-position'
        );
        const vertical =
            position === 'left' || position === 'right';
        const iconSize = this._settings.get_int(
            'floating-dock-icon-size'
        );
        const gap = this._settings.get_int(
            'floating-dock-gap'
        );

        this._box.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        this._box.set_style('spacing: ' + gap + 'px;');

        this._root.remove_style_class_name(
            'velora-floating-dock-horizontal'
        );
        this._root.remove_style_class_name(
            'velora-floating-dock-vertical'
        );
        this._root.add_style_class_name(
            vertical
                ? 'velora-floating-dock-vertical'
                : 'velora-floating-dock-horizontal'
        );

        apps.forEach((app, index) => {
            const button = this._createAppButton(
                app,
                iconSize,
                position,
                index
            );
            this._box.add_child(button);
            this._buttons.push(button);
        });

        const count = this._buttons.length;
        const contentWidth = vertical
            ? iconSize
            : count * iconSize + Math.max(0, count - 1) * gap;
        const contentHeight = vertical
            ? count * iconSize + Math.max(0, count - 1) * gap
            : iconSize;

        const width = contentWidth + DOCK_PADDING * 2;
        const height = contentHeight + DOCK_PADDING * 2;

        this._box.set_position(DOCK_PADDING, DOCK_PADDING);
        this._box.set_size(contentWidth, contentHeight);
        this._root.set_size(width, height);
        this._layoutGlassLayers(width, height);

        this._syncTint();
        this._syncBlur();
        this.reposition(false);
    }

    _layoutGlassLayers(width, height) {
        if (
            !this._glassTint ||
            !this._glassShine
        ) {
            return;
        }

        for (const actor of [
            this._glassTint,
            this._glassShine,
        ]) {
            actor.set_position(0, 0);
            actor.set_size(width, height);
        }
    }

    _setWrapperHover(hovered) {
        if (!this._root || !this._box)
            return;

        const padding = hovered
            ? DOCK_HOVER_PADDING
            : DOCK_PADDING;

        const iconSize = this._settings.get_int(
            'floating-dock-icon-size'
        );
        const gap = this._settings.get_int(
            'floating-dock-gap'
        );
        const position = this._settings.get_string(
            'floating-dock-position'
        );
        const vertical =
            position === 'left' || position === 'right';
        const count = this._buttons.length;

        const contentWidth = vertical
            ? iconSize
            : count * iconSize +
              Math.max(0, count - 1) * gap;
        const contentHeight = vertical
            ? count * iconSize +
              Math.max(0, count - 1) * gap
            : iconSize;

        const width = contentWidth + padding * 2;
        const height = contentHeight + padding * 2;

        this._box.set_position(padding, padding);
        this._box.set_size(
            contentWidth,
            contentHeight
        );
        this._root.set_size(width, height);
        this._layoutGlassLayers(width, height);

        if (hovered)
            this._root.add_style_pseudo_class('hover');
        else
            this._root.remove_style_pseudo_class('hover');

        this.reposition(true);
    }

    syncSettings() {
        if (!this._root)
            return;

        this.refresh();

        if (this._settings.get_boolean('floating-dock-auto-hide'))
            this._scheduleHide();
        else
            this._reveal(false);
    }

    reposition(animate = false) {
        if (!this._root)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const position = this._settings.get_string(
            'floating-dock-position'
        );
        const offset = this._settings.get_int(
            'floating-dock-edge-offset'
        );
        const width = this._root.width;
        const height = this._root.height;

        let x;
        let y;

        switch (position) {
        case 'top':
            x = monitor.x + (monitor.width - width) / 2;
            y = monitor.y + offset;
            break;
        case 'left':
            x = monitor.x + offset;
            y = monitor.y + (monitor.height - height) / 2;
            break;
        case 'right':
            x = monitor.x + monitor.width - width - offset;
            y = monitor.y + (monitor.height - height) / 2;
            break;
        case 'bottom':
        default:
            x = monitor.x + (monitor.width - width) / 2;
            y = monitor.y + monitor.height - height - offset;
            break;
        }

        if (this._hidden) {
            const hidden = this._hiddenPosition(
                position,
                monitor,
                x,
                y,
                width,
                height
            );
            x = hidden.x;
            y = hidden.y;
        }

        this._root.remove_all_transitions();

        if (animate) {
            this._root.ease({
                x: Math.round(x),
                y: Math.round(y),
                duration: 160,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._root.set_position(
                Math.round(x),
                Math.round(y)
            );
        }
    }

    _createAppButton(app, iconSize, dockPosition, _index) {
        const running =
            app.get_state() !== Shell.AppState.STOPPED;
        const textureSize = Math.max(
            12,
            Math.round(iconSize * 0.82)
        );

        const content = new St.Widget({
            style_class: 'velora-floating-dock-icon-content',
            layout_manager: new Clutter.FixedLayout(),
        });
        content.set_size(iconSize, iconSize);

        const icon = app.create_icon_texture(textureSize);
        icon.set_position(
            Math.round((iconSize - textureSize) / 2),
            Math.round((iconSize - textureSize) / 2) - 1
        );
        content.add_child(icon);

        if (
            running &&
            this._settings.get_boolean('show-running-indicator')
        ) {
            const dotSize = Math.max(
                3,
                Math.round(iconSize * 0.08)
            );
            const dot = new St.Widget({
                style_class: 'velora-floating-dock-running-dot',
                reactive: false,
            });
            dot.set_size(dotSize, dotSize);
            dot.set_position(
                Math.round((iconSize - dotSize) / 2),
                iconSize - dotSize - 2
            );
            content.add_child(dot);
        }

        const button = new St.Button({
            style_class: 'velora-floating-dock-icon',
            accessible_name: app.get_name(),
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: content,
        });

        button.set_size(iconSize, iconSize);
        button.set_pivot_point(0.5, 0.5);

        const previewSide = this._previewSideForDock(
            dockPosition
        );

        button.connect('notify::hover', () => {
            if (button.get_hover()) {
                this._cancelHide();
                this._cancelPreviewHide?.();

                button.ease({
                    scale_x: DOCK_HOVER_SCALE,
                    scale_y: DOCK_HOVER_SCALE,
                    duration: 400,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                });

                const previewShown =
                    this._showPreview?.(
                        app,
                        button,
                        previewSide
                    ) ?? false;

                if (previewShown) {
                    this._hideTooltip?.();
                } else if (
                    this._settings.get_boolean('show-tooltips')
                ) {
                    this._showTooltip?.(
                        app.get_name(),
                        button
                    );
                }
            } else {
                this._hideTooltip?.();
                this._schedulePreviewHide?.();

                button.ease({
                    scale_x: 1,
                    scale_y: 1,
                    duration: 400,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                });

                this._scheduleHide();
            }
        });

        button.connect('clicked', () => {
            this._hideTooltip?.();
            this._cancelPreviewHide?.();
            this._hidePreview?.(true);
            Main.overview.hide();
            app.activate();
        });

        return button;
    }

    _previewSideForDock(position) {
        switch (position) {
        case 'top':
            return 'bottom';
        case 'left':
            return 'right';
        case 'right':
            return 'left';
        case 'bottom':
        default:
            return 'top';
        }
    }

    _scheduleHide() {
        this._cancelHide();

        if (
            !this._root ||
            !this._settings.get_boolean(
                'floating-dock-auto-hide'
            ) ||
            this._root.get_hover() ||
            this._buttons.some(button => button.get_hover()) ||
            this._isPreviewVisible?.()
        ) {
            return;
        }

        const delay = this._settings.get_int(
            'floating-dock-hide-delay'
        );

        if (delay <= 0) {
            this._hideToEdge();
            return;
        }

        this._hideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._hideTimeoutId = 0;

                if (!this._root)
                    return GLib.SOURCE_REMOVE;

                if (
                    this._root.get_hover() ||
                    this._buttons.some(
                        button => button.get_hover()
                    ) ||
                    this._isPreviewVisible?.()
                ) {
                    this._scheduleHide();
                    return GLib.SOURCE_REMOVE;
                }

                this._hideToEdge();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelHide() {
        if (!this._hideTimeoutId)
            return;

        GLib.source_remove(this._hideTimeoutId);
        this._hideTimeoutId = 0;
    }

    _hideToEdge() {
        if (!this._root || this._hidden)
            return;

        this._hidden = true;
        this.reposition(true);
    }

    _reveal(animate = true) {
        if (!this._root)
            return;

        if (!this._hidden) {
            this.reposition(animate);
            return;
        }

        this._hidden = false;
        this.reposition(animate);
    }

    _hiddenPosition(
        position,
        monitor,
        x,
        y,
        width,
        height
    ) {
        switch (position) {
        case 'top':
            return {
                x,
                y: monitor.y - height + DOCK_REVEAL_PX,
            };
        case 'left':
            return {
                x: monitor.x - width + DOCK_REVEAL_PX,
                y,
            };
        case 'right':
            return {
                x:
                    monitor.x +
                    monitor.width -
                    DOCK_REVEAL_PX,
                y,
            };
        case 'bottom':
        default:
            return {
                x,
                y:
                    monitor.y +
                    monitor.height -
                    DOCK_REVEAL_PX,
            };
        }
    }

    _syncBlur() {
        // Intentionally disabled for now: the separate background-blur actor
        // produced a second rectangular surface behind the glass capsule.
        this._blurEffect = null;
    }

    _invalidateWallpaperTint() {
        this._wallpaperColorCache = null;
        this._syncTint();
    }

    _syncTint() {
        if (!this._glassTint)
            return;

        let tint = [255, 255, 255];

        if (
            this._settings.get_boolean(
                'floating-dock-wallpaper-tint'
            )
        ) {
            if (!this._wallpaperColorCache) {
                this._wallpaperColorCache =
                    this._sampleWallpaperColor() ??
                    DEFAULT_TINT;
            }

            const sampled = this._wallpaperColorCache;
            const strength = 0.08;
            tint = sampled.map((value, index) =>
                Math.round(
                    tint[index] * (1 - strength) +
                    value * strength
                )
            );
        }

        const opacity =
            this._settings.get_int(
                'floating-dock-opacity'
            ) / 100;
        const tintAlpha = Math.max(
            0.20,
            Math.min(0.60, 0.20 + opacity * 0.40)
        );

        this._glassTint.set_style(
            'background-color: rgba(' +
            tint.join(',') + ',' +
            tintAlpha.toFixed(2) +
            ');'
        );
    }

    _sampleWallpaperColor() {
        try {
            const scheme =
                this._interfaceSettings.get_string(
                    'color-scheme'
                );
            const darkUri =
                this._backgroundSettings.get_string(
                    'picture-uri-dark'
                );
            const lightUri =
                this._backgroundSettings.get_string(
                    'picture-uri'
                );
            const uri =
                scheme.includes('dark') && darkUri
                    ? darkUri
                    : lightUri || darkUri;

            if (!uri)
                return null;

            const file = uri.includes('://')
                ? Gio.File.new_for_uri(uri)
                : Gio.File.new_for_path(uri);
            const path = file.get_path();

            if (!path)
                return null;

            const pixbuf =
                GdkPixbuf.Pixbuf.new_from_file_at_scale(
                    path,
                    32,
                    32,
                    true
                );
            const pixels = pixbuf.get_pixels();
            const width = pixbuf.get_width();
            const height = pixbuf.get_height();
            const channels = pixbuf.get_n_channels();
            const rowstride = pixbuf.get_rowstride();
            const hasAlpha = pixbuf.get_has_alpha();

            const buckets = new Map();

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset =
                        y * rowstride + x * channels;
                    const red = pixels[offset];
                    const green = pixels[offset + 1];
                    const blue = pixels[offset + 2];

                    if (
                        hasAlpha &&
                        pixels[offset + 3] < 96
                    ) {
                        continue;
                    }

                    const max = Math.max(red, green, blue);
                    const min = Math.min(red, green, blue);
                    const saturation = max - min;
                    const luminance =
                        red * 0.2126 +
                        green * 0.7152 +
                        blue * 0.0722;

                    let weight =
                        1 + saturation / 72;

                    if (
                        luminance < 24 ||
                        luminance > 238
                    ) {
                        weight *= 0.45;
                    }

                    const key =
                        (red >> 5) << 6 |
                        (green >> 5) << 3 |
                        (blue >> 5);

                    const bucket = buckets.get(key) ?? {
                        weight: 0,
                        red: 0,
                        green: 0,
                        blue: 0,
                        count: 0,
                    };

                    bucket.weight += weight;
                    bucket.red += red;
                    bucket.green += green;
                    bucket.blue += blue;
                    bucket.count++;
                    buckets.set(key, bucket);
                }
            }

            let dominant = null;
            for (const bucket of buckets.values()) {
                if (
                    !dominant ||
                    bucket.weight > dominant.weight
                ) {
                    dominant = bucket;
                }
            }

            if (!dominant || dominant.count === 0)
                return null;

            const dominantColor = [
                dominant.red / dominant.count,
                dominant.green / dominant.count,
                dominant.blue / dominant.count,
            ];

            return dominantColor.map(value =>
                Math.round(value)
            );
        } catch (error) {
            logError(
                error,
                'Velora Desktop: wallpaper tint sampling failed'
            );
            return null;
        }
    }

}
