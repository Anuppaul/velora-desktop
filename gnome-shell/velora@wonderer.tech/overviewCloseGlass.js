import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

const CLOSE_TARGET_CLASS = 'window-close';
const ICON_TARGET_CLASS = 'window-icon';
const CLOSE_ACTIVE_CLASS = 'velora-window-close-shared-glass';
const ICON_ACTIVE_CLASS = 'velora-window-icon-shared-glass';
const PAD = 20;
const MAX_REGIONS = 16;
const SHARED_RADIUS = 24;
const ICON_BADGE_INSET = 4;
const SCAN_INTERVAL_US = 180000;

function classesOf(actor) {
    return String(
        actor?.get_style_class_name?.() ??
        actor?.style_class ??
        ''
    ).split(/\s+/).filter(Boolean);
}

function finiteRect(rect) {
    return (
        Array.isArray(rect) &&
        rect.length >= 4 &&
        rect.every(Number.isFinite) &&
        rect[2] > 1 &&
        rect[3] > 1
    );
}

export class OverviewCloseGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;

        this._overview = null;
        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._iconLayer = null;
        this._wallpaper = null;
        this._effect = null;

        this._appearance = null;
        this._targets = new Map();
        this._stageId = 0;
        this._lastScanUs = 0;
        this._lastRegionKey = '';
        this._enabled = false;
    }

    setup() {
        if (this._enabled)
            return;

        const overview =
            Main.layoutManager.overviewGroup;
        if (!overview)
            throw new Error('GNOME overviewGroup unavailable');

        this._enabled = true;
        this._overview = overview;
        this._appearance = this._readAppearance();

        this._createLayer();
        this._scan(true);

        this._stageId = global.stage.connect(
            'before-update',
            () => this._tick()
        );

        console.log(
            '[Velora][OverviewCloseGlass] shared window chrome glass active'
        );
    }

    _createLayer() {
        const root = new this._vendor.UnpickableActor({
            name: 'velora-window-close-glass-root',
            reactive: false,
        });
        root.set_no_layout?.(true);
        root.set_position(0, 0);
        root.set_size(1, 1);
        root.hide();

        const liquidBox = new this._vendor.UnpickableActor({
            name: 'velora-window-close-liquid-box',
            reactive: false,
        });
        liquidBox.set_no_layout?.(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(1, 1);
        liquidBox.set_clip_to_allocation(true);
        root.add_child(liquidBox);

        const sceneRoot = new this._vendor.UnpickableActor({
            name: 'velora-window-close-scene',
            reactive: false,
        });
        sceneRoot.set_no_layout?.(true);
        sceneRoot.set_position(0, 0);
        sceneRoot.set_size(1, 1);
        liquidBox.add_child(sceneRoot);

        const wallpaper =
            this._vendor.createBackgroundMirror?.(
                'velora-window-close-wallpaper'
            ) ?? null;
        if (wallpaper) {
            wallpaper.set_no_layout?.(true);
            wallpaper.set_position?.(0, 0);
            sceneRoot.add_child(wallpaper);
        }

        const breaker = new this._vendor.UnpickableActor({
            name: 'velora-window-close-breaker',
            reactive: false,
        });
        breaker.set_no_layout?.(true);
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-overview-window-close',
        });
        effect.setPadding?.(PAD);
        effect.setIsDock?.(false);
        effect.setMultiRegionMode?.(true);
        effect.setShadowMaxRadius?.(0);
        liquidBox.add_effect(effect);

        const iconLayer = new this._vendor.UnpickableActor({
            name: 'velora-window-close-icon-layer',
            reactive: false,
        });
        iconLayer.set_no_layout?.(true);
        iconLayer.set_position(0, 0);
        iconLayer.set_size(1, 1);
        root.add_child(iconLayer);

        // The layer must sit ABOVE WindowPreview's own offscreen-composited
        // subtree; otherwise the glass gets flattened into the preview and is
        // visually lost. UnpickableActor keeps all native click/hover input on
        // the original .window-close buttons below.
        this._overview.add_child(root);

        this._root = root;
        this._liquidBox = liquidBox;
        this._sceneRoot = sceneRoot;
        this._iconLayer = iconLayer;
        this._wallpaper = wallpaper;
        this._effect = effect;

        this._applyAppearance();
    }

    _applyAppearance(
        state = this._appearance ?? this._readAppearance()
    ) {
        if (!this._effect || !state)
            return;

        this._appearance = state;
        const role = VELORA_GLASS_ROLES.shellCard;

        let brightness = null;
        let contrast = null;
        let saturation = null;

        try {
            brightness =
                this._settings.get_double('menu-brightness');
            contrast =
                this._settings.get_double('menu-contrast');
            saturation =
                this._settings.get_double('menu-saturation');
        } catch {
            // Shared material defaults are valid.
        }

        applyVeloraGlassRole(
            this._effect,
            role,
            {
                tintColor: [
                    (state.r ?? 255) / 255,
                    (state.g ?? 255) / 255,
                    (state.b ?? 255) / 255,
                ],
                tintStrength:
                    state.opacity ?? role.tintStrength,
                baseBlur: state.blur ?? 7,
                cornerRadius: 24,
                brightness,
                contrast,
                saturation,
                multiRegion: true,
            }
        );

        this._root?.queue_redraw?.();
    }

    updateAppearance(
        state = this._readAppearance()
    ) {
        this._appearance = state;
        this._applyAppearance(state);
        this._lastRegionKey = '';
    }

    _scan(force = false) {
        if (!this._overview)
            return;

        const nowUs = GLib.get_monotonic_time();
        if (
            !force &&
            nowUs - this._lastScanUs < SCAN_INTERVAL_US
        ) {
            return;
        }
        this._lastScanUs = nowUs;

        const found = new Set();
        const walk = actor => {
            if (!actor || actor === this._root)
                return;

            const actorClasses = classesOf(actor);
            if (
                actorClasses.includes(CLOSE_TARGET_CLASS) ||
                actorClasses.includes(ICON_TARGET_CLASS)
            ) {
                found.add(actor);
                return;
            }

            for (const child of actor.get_children?.() ?? [])
                walk(child);
        };
        walk(this._overview);

        for (const [actor, entry] of this._targets) {
            if (found.has(actor))
                continue;

            try {
                actor.remove_style_class_name?.(
                    entry.kind === 'icon'
                        ? ICON_ACTIVE_CLASS
                        : CLOSE_ACTIVE_CLASS
                );
            } catch {}
            try {
                entry.clone?.destroy?.();
            } catch {}
            this._targets.delete(actor);
        }

        for (const actor of found) {
            if (this._targets.has(actor))
                continue;

            const kind =
                classesOf(actor).includes(ICON_TARGET_CLASS)
                    ? 'icon'
                    : 'close';

            let clone = null;
            try {
                clone = new Clutter.Clone({
                    source: actor,
                    reactive: false,
                });
                clone.set_name?.(
                    kind === 'icon'
                        ? 'velora-window-app-icon-clone'
                        : 'velora-window-close-icon-clone'
                );
                clone.set_no_layout?.(true);
                this._iconLayer.add_child(clone);
            } catch {
                clone = null;
            }

            try {
                actor.add_style_class_name?.(
                    kind === 'icon'
                        ? ICON_ACTIVE_CLASS
                        : CLOSE_ACTIVE_CLASS
                );
            } catch {}

            this._targets.set(actor, {clone, kind});
        }
    }

    _tick() {
        if (
            !this._enabled ||
            !this._overview ||
            !this._root ||
            !this._effect
        ) {
            return;
        }

        if (
            !this._overview.visible ||
            !this._overview.mapped ||
            !Main.overview?.visible
        ) {
            if (this._root.visible)
                this._root.hide?.();
            return;
        }

        this._scan(false);

        const groupRect =
            this._vendor.getTransformedRect(
                this._overview
            );
        if (!finiteRect(groupRect))
            return;

        const [groupX, groupY, groupTW, groupTH] =
            groupRect;
        const rootW = Math.max(
            1,
            this._overview.width ?? groupTW
        );
        const rootH = Math.max(
            1,
            this._overview.height ?? groupTH
        );
        const scaleX = Math.max(groupTW / rootW, 0.001);
        const scaleY = Math.max(groupTH / rootH, 0.001);

        this._vendor.setSizeIfChanged(
            this._root,
            rootW,
            rootH
        );
        this._vendor.setSizeIfChanged(
            this._liquidBox,
            rootW,
            rootH
        );
        this._vendor.setSizeIfChanged(
            this._iconLayer,
            rootW,
            rootH
        );

        this._vendor.setSizeIfChanged(
            this._sceneRoot,
            global.stage.width,
            global.stage.height
        );
        const invX = 1 / scaleX;
        const invY = 1 / scaleY;
        if (
            this._sceneRoot.scale_x !== invX ||
            this._sceneRoot.scale_y !== invY
        ) {
            this._sceneRoot.set_scale(invX, invY);
        }
        this._vendor.setTranslationIfChanged(
            this._sceneRoot,
            -groupX / scaleX,
            -groupY / scaleY
        );

        if (this._wallpaper) {
            this._vendor.setPositionIfChanged?.(
                this._wallpaper,
                0,
                0
            );
            this._vendor.setSizeIfChanged?.(
                this._wallpaper,
                global.stage.width,
                global.stage.height
            );
        }

        const regions = [];

        for (const [actor, entry] of this._targets) {
            const visible = Boolean(
                actor?.visible &&
                actor?.mapped &&
                (actor.get_paint_opacity?.() ??
                    actor.opacity ??
                    255) > 0
            );

            if (!visible) {
                entry.clone?.hide?.();
                continue;
            }

            const rect =
                this._vendor.getTransformedRect(actor);
            if (!finiteRect(rect)) {
                entry.clone?.hide?.();
                continue;
            }

            const [absX, absY, width, height] = rect;
            const localX = (absX - groupX) / scaleX;
            const localY = (absY - groupY) / scaleY;
            const localW = width / scaleX;
            const localH = height / scaleY;

            const inset =
                entry.kind === 'icon'
                    ? Math.min(
                        ICON_BADGE_INSET,
                        Math.max(
                            0,
                            (Math.min(localW, localH) - 2) / 2
                        )
                    )
                    : 0;

            const glassX = localX + inset;
            const glassY = localY + inset;
            const glassW = Math.max(2, localW - inset * 2);
            const glassH = Math.max(2, localH - inset * 2);

            regions.push({
                x: glassX - PAD,
                y: glassY - PAD,
                w: glassW + PAD * 2,
                h: glassH + PAD * 2,
                tintR: 1.0,
                tintG: 1.0,
                tintB: 1.0,
                baseStrength:
                    entry.kind === 'icon'
                        ? 0.026
                        : 0.0,
                response: 0.0,
            });

            if (entry.clone) {
                entry.clone.set_position(
                    localX,
                    localY
                );
                entry.clone.set_size(
                    localW,
                    localH
                );
                entry.clone.opacity =
                    actor.get_paint_opacity?.() ??
                    actor.opacity ??
                    255;
                entry.clone.show?.();
            }

            if (regions.length >= MAX_REGIONS)
                break;
        }

        if (!regions.length) {
            this._effect.setGlassRegions?.([]);
            if (this._root.visible)
                this._root.hide?.();
            return;
        }

        const key = JSON.stringify(
            regions.map(region => [
                Math.round(region.x),
                Math.round(region.y),
                Math.round(region.w),
                Math.round(region.h),
            ])
        );

        if (key !== this._lastRegionKey) {
            this._lastRegionKey = key;
            this._effect.setCornerRadius?.(SHARED_RADIUS);
            this._effect.setResolution?.(
                rootW,
                rootH
            );
            this._effect.setGlassRegions?.(
                regions
            );
        }

        if (!this._root.visible)
            this._root.show?.();
    }

    cleanup() {
        if (!this._enabled)
            return;
        this._enabled = false;

        if (this._stageId) {
            try {
                global.stage.disconnect(this._stageId);
            } catch {}
            this._stageId = 0;
        }

        for (const [actor, entry] of this._targets) {
            try {
                actor.remove_style_class_name?.(
                    entry.kind === 'icon'
                        ? ICON_ACTIVE_CLASS
                        : CLOSE_ACTIVE_CLASS
                );
            } catch {}
            try {
                entry.clone?.destroy?.();
            } catch {}
        }
        this._targets.clear();

        try {
            this._root?.destroy?.();
        } catch {}

        this._overview = null;
        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._iconLayer = null;
        this._wallpaper = null;
        this._effect = null;
        this._appearance = null;
        this._lastRegionKey = '';

        console.log(
            '[Velora][OverviewCloseGlass] stopped'
        );
    }
}
