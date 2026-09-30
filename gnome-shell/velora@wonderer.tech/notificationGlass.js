import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    VELORA_GLASS_ADAPTERS,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

const DEFAULT_RADIUS = 24;
const SAMPLE_MARGIN_MIN = 48;
const SAMPLE_MARGIN_MAX = 180;

function finiteRect(values) {
    return values.every(Number.isFinite) &&
        values[2] > 1 &&
        values[3] > 1;
}

export class NotificationGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;
        this._enabled = false;
        this._bannerBin = null;
        this._signals = [];
        this._settingsSignals = [];
        this._materials = new Map();
        this._appearance = null;
        this._stageSyncId = 0;
    }

    setup() {
        if (this._enabled)
            return;

        const tray = Main.messageTray;
        const bannerBin = tray?._bannerBin;
        if (!bannerBin)
            throw new Error('GNOME MessageTray banner container is unavailable');

        this._enabled = true;
        this._bannerBin = bannerBin;
        this._appearance = this._readAppearance();

        this._signals.push({
            obj: bannerBin,
            id: bannerBin.connect('child-added', (_container, actor) => {
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    if (
                        this._enabled &&
                        actor?.get_parent?.() === this._bannerBin
                    ) {
                        this._attach(actor);
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }),
        });

        this._signals.push({
            obj: bannerBin,
            id: bannerBin.connect('child-removed', (_container, actor) => {
                this._detach(actor);
            }),
        });

        for (const actor of bannerBin.get_children?.() ?? [])
            this._attach(actor);

        if (tray?._banner)
            this._attach(tray._banner);

        for (const key of [
            'notification-brightness',
            'notification-contrast',
            'notification-saturation',
            'notification-corner-radius',
            'blur-method',
            'glass-blur-downscale',
        ]) {
            try {
                this._settingsSignals.push(
                    this._settings.connect(
                        'changed::' + key,
                        () => this._refreshMaterialSettings()
                    )
                );
            } catch {
                // The pilot must not fail because an optional setting is absent.
            }
        }

        this._stageSyncId = global.stage.connect(
            'before-update',
            () => {
                if (!this._enabled)
                    return;

                for (const [actor, material] of [...this._materials]) {
                    if (
                        !actor?.mapped ||
                        !actor?.visible
                    ) {
                        continue;
                    }

                    try {
                        this._sync(material, false);
                    } catch (error) {
                        console.error(
                            '[Velora][NotificationGlass] frame sync failed; restoring native banner: ' +
                            error +
                            '\n' +
                            (error?.stack ?? '')
                        );
                        this._detach(actor);
                    }
                }
            }
        );

        console.log(
            '[Velora][NotificationGlass] live refractive material active'
        );
    }

    updateAppearance(state = this._readAppearance()) {
        this._appearance = state;
        for (const material of this._materials.values()) {
            this._applyAppearance(material, state);
            this._queueSync(material);
        }
    }

    _readCornerRadius(actor) {
        try {
            actor?.ensure_style?.();
            const radius = actor
                ?.get_theme_node?.()
                ?.get_border_radius?.(St.Corner.TOPLEFT);
            if (Number.isFinite(radius) && radius > 0)
                return radius;
        } catch {
            // Fall through to the renderer setting.
        }

        try {
            const radius = this._settings.get_double(
                'notification-corner-radius'
            );
            if (Number.isFinite(radius) && radius > 0)
                return radius;
        } catch {
            // Use the conservative fallback below.
        }

        return DEFAULT_RADIUS;
    }

    _attach(actor) {
        if (
            !this._enabled ||
            !actor ||
            actor === this._bannerBin ||
            this._materials.has(actor)
        ) {
            return;
        }

        const radius = this._readCornerRadius(actor);

        actor.add_style_class_name?.(
            'velora-native-notification-glass'
        );

        const bannerRoot = this._resolveBannerRoot(actor);

        const root = new this._vendor.UnpickableActor();
        root.set_name('velora-notification-material-root');
        root.set_size(1, 1);
        root.hide();

        const liquidBox = new this._vendor.UnpickableActor();
        liquidBox.set_name('velora-notification-liquid-box');
        liquidBox.set_clip_to_allocation(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(1, 1);
        root.add_child(liquidBox);

        // Live compositor-native scene source: wallpaper + Meta.WindowActor
        // clones. This stays on the GPU; no screenshot or CPU readback.
        const sceneManager =
            new this._vendor.WindowCloneManager(
                liquidBox,
                null,
                'velora-notification-scene'
            );

        // Matches the proven LiquidEffect container pattern used by the
        // vendored managers. It paints nothing; it only avoids a Clutter
        // offscreen-cache optimization edge case that can produce black frames.
        const breaker = new this._vendor.UnpickableActor();
        breaker.set_name('velora-notification-optimization-breaker');
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-notification-lite',
        });

        // The notification's GNOME bounds are the visible material bounds.
        // Sampling headroom comes from the root clip, not from a larger card.
        effect.setPadding?.(20);
        effect.setIsDock?.(false);
        liquidBox.add_effect(effect);

        const filterLayer = new St.Widget({
            name: 'velora-notification-white-filter',
            style_class: 'velora-glass-white-filter',
            reactive: false,
        });
        root.add_child(filterLayer);

        try {
            if (
                bannerRoot?.get_parent?.() ===
                Main.layoutManager.uiGroup
            ) {
                Main.layoutManager.uiGroup.insert_child_below(
                    root,
                    bannerRoot
                );
            } else {
                Main.layoutManager.uiGroup.add_child(root);
            }
        } catch (error) {
            try {
                root.destroy?.();
            } catch {
                // Best-effort partial construction cleanup.
            }
            actor.remove_style_class_name?.(
                'velora-native-notification-glass'
            );
            console.error(
                '[Velora][NotificationGlass] attach failed: ' + error
            );
            return;
        }

        const material = {
            actor,
            bannerRoot,
            root,
            liquidBox,
            sceneManager,
            filterLayer,
            effect,
            radius,
            signals: [],
            laterId: 0,
            lastShaderX: null,
            lastShaderY: null,
            lastShaderW: null,
            lastShaderH: null,
            lastSceneSyncUs: 0,
        };

        this._materials.set(actor, material);
        this._connectGeometrySignals(material);
        this._applyAppearance(
            material,
            this._appearance ?? this._readAppearance()
        );

        effect.setLiveGeometryHook?.(() => {
            if (
                this._enabled &&
                this._materials.get(actor) === material
            ) {
                this._sync(material, true);
            }
        });

        this._queueSync(material);
    }

    _resolveBannerRoot(actor) {
        let root = this._bannerBin ?? actor;
        while (
            root?.get_parent?.() &&
            root.get_parent() !== Main.layoutManager.uiGroup
        ) {
            const parent = root.get_parent();
            if (!parent)
                break;
            root = parent;
        }
        return root;
    }

    _connectGeometrySignals(material) {
        const watched = new Set();
        let cursor = material.actor;

        while (
            cursor &&
            cursor !== Main.layoutManager.uiGroup
        ) {
            watched.add(cursor);
            cursor = cursor.get_parent?.() ?? null;
        }

        if (this._bannerBin)
            watched.add(this._bannerBin);

        const queue = () => this._queueSync(material);

        for (const target of watched) {
            for (const signal of [
                'notify::allocation',
                'notify::x',
                'notify::y',
                'notify::translation-x',
                'notify::translation-y',
                'notify::scale-x',
                'notify::scale-y',
                'notify::opacity',
                'notify::visible',
                'notify::mapped',
            ]) {
                try {
                    material.signals.push({
                        obj: target,
                        id: target.connect(signal, queue),
                    });
                } catch {
                    // Not every Shell actor exposes every property notification.
                }
            }
        }

        try {
            material.signals.push({
                obj: material.actor,
                id: material.actor.connect(
                    'destroy',
                    () => this._detach(material.actor)
                ),
            });
        } catch {
            // child-removed remains the fallback cleanup path.
        }
    }

    _applyAppearance(material, state) {
        if (!material?.effect || !state)
            return;

        const role =
            VELORA_GLASS_ROLES.notificationCard;
        const adapter =
            VELORA_GLASS_ADAPTERS.notificationBanner;

        let brightness = null;
        let contrast = null;
        let saturation = null;

        try {
            brightness = this._settings.get_double(
                'notification-brightness'
            );
            contrast = this._settings.get_double(
                'notification-contrast'
            );
            saturation = this._settings.get_double(
                'notification-saturation'
            );
        } catch {
            // Shared material defaults remain valid.
        }

        applyVeloraGlassRole(
            material.effect,
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
                cornerRadius: material.radius,
                brightness,
                contrast,
                saturation,
                multiRegion: adapter.multiRegion,
            }
        );

        // The shader now owns rim/specular depth. Keep the native filter as a
        // very light body veil only; no second border/shadow layer.
        const filterOpacity = Math.max(
            0,
            Math.min(
                adapter.filterOpacityMax,
                (state.filterOpacity ?? 0.05) *
                    adapter.filterOpacityScale
            )
        );
        material.filterLayer?.set_style?.(
            'background-color: rgba(255,255,255,' +
            filterOpacity.toFixed(3) +
            '); border-radius: ' +
            Math.round(material.radius) +
            'px; border: none; box-shadow: none;'
        );
    }

    _refreshMaterialSettings() {
        for (const material of this._materials.values()) {
            this._applyAppearance(
                material,
                this._appearance ?? this._readAppearance()
            );
            this._queueSync(material);
        }
    }

    _queueSync(material) {
        if (
            !this._enabled ||
            !material ||
            material.laterId
        ) {
            return;
        }

        material.laterId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                material.laterId = 0;

                if (
                    this._enabled &&
                    this._materials.get(material.actor) === material
                ) {
                    this._sync(material, false);
                }

                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _ensureSceneManager(material) {
        if (!material)
            return null;

        if (material.sceneManager)
            return material.sceneManager;

        material.sceneManager =
            new this._vendor.WindowCloneManager(
                material.liquidBox,
                null,
                'velora-notification-scene'
            );
        material.lastSceneSyncUs = 0;
        return material.sceneManager;
    }

    _releaseSceneManager(material) {
        if (!material?.sceneManager)
            return;

        try {
            material.sceneManager.destroy?.();
        } catch {
            // Scene may already be tearing down.
        }
        material.sceneManager = null;
        material.lastSceneSyncUs = 0;
    }

    _sync(material, shaderOnly) {
        const actor = material?.actor;
        if (
            !actor ||
            this._materials.get(actor) !== material
        ) {
            return;
        }

        const rect = this._vendor.getTransformedRect(actor);
        if (!finiteRect(rect)) {
            if (!shaderOnly)
                material.root.hide?.();
            return;
        }

        const [absX, absY, width, height] = rect;
        const opacity =
            actor.get_paint_opacity?.() ??
            actor.opacity ??
            255;

        if (
            !actor.mapped ||
            !actor.visible ||
            opacity <= 0
        ) {
            if (!shaderOnly) {
                material.root.hide?.();
                this._releaseSceneManager(material);
            }
            return;
        }

        const monitor =
            this._vendor.resolveMonitorGeometry([
                actor,
                this._bannerBin,
            ]) ??
            Main.layoutManager.primaryMonitor ??
            {
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
            };

        const monitorX = monitor.x ?? 0;
        const monitorY = monitor.y ?? 0;
        const screenW = Math.max(
            1,
            monitor.width ?? global.stage.width
        );
        const screenH = Math.max(
            1,
            monitor.height ?? global.stage.height
        );

        const glassX = absX - monitorX;
        const glassY = absY - monitorY;

        const geometryChanged =
            material.lastShaderX !== glassX ||
            material.lastShaderY !== glassY ||
            material.lastShaderW !== width ||
            material.lastShaderH !== height;

        if (geometryChanged) {
            material.lastShaderX = glassX;
            material.lastShaderY = glassY;
            material.lastShaderW = width;
            material.lastShaderH = height;

            material.effect.setGlassGeometry?.(
                glassX,
                glassY,
                width,
                height
            );
        }

        if (shaderOnly)
            return;

        this._vendor.setPositionIfChanged(
            material.root,
            monitorX,
            monitorY
        );
        this._vendor.setSizeIfChanged(
            material.root,
            screenW,
            screenH
        );
        this._vendor.setPositionIfChanged(
            material.liquidBox,
            0,
            0
        );
        this._vendor.setSizeIfChanged(
            material.liquidBox,
            screenW,
            screenH
        );
        this._vendor.setPositionIfChanged(
            material.filterLayer,
            glassX,
            glassY
        );
        this._vendor.setSizeIfChanged(
            material.filterLayer,
            width,
            height
        );

        const sceneManager = this._ensureSceneManager(material);
        sceneManager?.setOffset?.(
            -monitorX,
            -monitorY
        );

        const blur = Math.max(
            0,
            this._appearance?.blur ?? 0
        );
        const margin = Math.max(
            SAMPLE_MARGIN_MIN,
            Math.min(
                SAMPLE_MARGIN_MAX,
                Math.round(blur * 3 + 36)
            )
        );

        this._vendor.setClipIfChanged(
            material.root,
            glassX - margin,
            glassY - margin,
            width + margin * 2,
            height + margin * 2
        );

        const captureRect = [
            absX - margin,
            absY - margin,
            width + margin * 2,
            height + margin * 2,
        ];
        const sceneFps = Math.max(
            15,
            Math.min(
                60,
                this._appearance?.sceneFps ?? 30
            )
        );
        const nowUs = GLib.get_monotonic_time();
        const intervalUs = 1000000 / sceneFps;
        const sceneDue =
            geometryChanged ||
            material.lastSceneSyncUs === 0 ||
            nowUs - material.lastSceneSyncUs >= intervalUs;

        if (sceneDue) {
            sceneManager?.setCullRect?.(captureRect);
            sceneManager?.applyBgCloneClip?.(captureRect);
            sceneManager?.sync?.();
            material.lastSceneSyncUs = nowUs;
        }

        material.effect.setResolution?.(
            screenW,
            screenH
        );
        material.effect.setShadowMaxRadius?.(
            Math.max(0, margin - 12)
        );

        if (material.root.opacity !== opacity)
            material.root.opacity = opacity;

        if (!material.root.visible)
            material.root.show?.();
    }

    _detach(actor) {
        const material = this._materials.get(actor);
        if (!material)
            return;

        this._materials.delete(actor);

        if (material.laterId) {
            try {
                global.compositor.get_laters().remove(
                    material.laterId
                );
            } catch {
                // Later may already have fired.
            }
            material.laterId = 0;
        }

        for (const signal of material.signals ?? []) {
            try {
                signal.obj.disconnect(signal.id);
            } catch {
                // Actor may already be tearing down.
            }
        }
        material.signals = [];

        try {
            material.effect?.setLiveGeometryHook?.(null);
        } catch {
            // Effect may already be detached.
        }

        this._releaseSceneManager(material);

        try {
            material.root?.destroy?.();
        } catch {
            // Root may already have been destroyed with Shell teardown.
        }

        try {
            actor?.remove_style_class_name?.(
                'velora-native-notification-glass'
            );
        } catch {
            // Notification may already be destroyed.
        }
    }

    cleanup() {
        this._enabled = false;

        if (this._stageSyncId) {
            try {
                global.stage.disconnect(this._stageSyncId);
            } catch {
                // Stage may already be tearing down.
            }
            this._stageSyncId = 0;
        }

        for (const signal of this._signals) {
            try {
                signal.obj.disconnect(signal.id);
            } catch {
                // MessageTray may already be tearing down.
            }
        }
        this._signals = [];

        for (const id of this._settingsSignals) {
            try {
                this._settings.disconnect(id);
            } catch {
                // Settings may already be tearing down.
            }
        }
        this._settingsSignals = [];

        for (const actor of [...this._materials.keys()])
            this._detach(actor);

        this._materials.clear();
        this._bannerBin = null;
    }
}
