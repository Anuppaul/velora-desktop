import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DEFAULT_RADIUS = 18;
const SAMPLE_MARGIN_MIN = 56;
const SAMPLE_MARGIN_MAX = 200;

function finiteRect(values) {
    return values.every(Number.isFinite) &&
        values[2] > 1 &&
        values[3] > 1;
}

export class DateMenuGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;
        this._enabled = false;
        this._menu = null;
        this._actor = null;
        this._box = null;
        this._boxPointer = null;
        this._material = null;
        this._signals = [];
        this._appearance = null;
        this._cornerRadius = DEFAULT_RADIUS;
    }

    setup() {
        if (this._enabled)
            return;

        const dateMenu = Main.panel?.statusArea?.dateMenu;
        const menu = dateMenu?.menu;
        const actor = menu?.actor;
        const box = menu?.box;
        const boxPointer = menu?._boxPointer ?? actor ?? null;

        if (!menu || !actor || !box)
            throw new Error('GNOME Date Menu actors are unavailable');

        this._enabled = true;
        this._menu = menu;
        this._actor = actor;
        this._box = box;
        this._boxPointer = boxPointer;
        this._appearance = this._readAppearance();

        // Read the native shape before adding transparency classes.
        this._cornerRadius = this._readCornerRadius(box);

        actor.add_style_class_name?.(
            'velora-native-date-menu-shell'
        );
        box.add_style_class_name?.(
            'velora-native-date-menu-glass'
        );
        if (boxPointer && boxPointer !== actor) {
            boxPointer.add_style_class_name?.(
                'velora-native-date-menu-shell'
            );
        }

        this._signals.push({
            obj: menu,
            id: menu.connect(
                'open-state-changed',
                (_menu, isOpen) => {
                    if (!this._enabled)
                        return;

                    if (!isOpen) {
                        this._material?.root?.hide?.();
                        return;
                    }

                    GLib.idle_add(
                        GLib.PRIORITY_DEFAULT_IDLE,
                        () => {
                            if (
                                this._enabled &&
                                this._menu?.isOpen
                            ) {
                                const material = this._ensureMaterial();
                                this._applyAppearance(
                                    material,
                                    this._appearance ?? this._readAppearance()
                                );
                                this._queueSync(material);
                            }
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                }
            ),
        });

        // Shell/theme changes can alter the native radius without changing
        // menu structure. Re-read it on style changes and keep one silhouette.
        try {
            this._signals.push({
                obj: box,
                id: box.connect('style-changed', () => {
                    if (!this._enabled)
                        return;
                    const radius = this._readCornerRadius(box);
                    if (radius !== this._cornerRadius) {
                        this._cornerRadius = radius;
                        if (this._material) {
                            this._material.radius = radius;
                            this._material.effect?.setCornerRadius?.(radius);
                            this._queueSync(this._material);
                        }
                    }
                }),
            });
        } catch {
            // Theme-radius fallback remains valid.
        }

        if (menu.isOpen) {
            const material = this._ensureMaterial();
            this._applyAppearance(material, this._appearance);
            this._queueSync(material);
        }

        console.log(
            '[Velora][DateMenuGlass] wallpaper-only material active'
        );
    }

    updateAppearance(state = this._readAppearance()) {
        this._appearance = state;
        if (!this._material)
            return;

        this._applyAppearance(this._material, state);
        if (this._menu?.isOpen)
            this._queueSync(this._material);
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
            // Use the conservative fallback below.
        }

        return DEFAULT_RADIUS;
    }

    _ensureMaterial() {
        if (this._material)
            return this._material;

        const actor = this._actor;
        const box = this._box;
        if (!actor || !box)
            return null;

        const menuRoot = this._resolveMenuRoot(actor);

        const root = new this._vendor.UnpickableActor();
        root.set_name('velora-date-menu-material-root');
        root.set_size(1, 1);
        root.hide();

        const liquidBox = new this._vendor.UnpickableActor();
        liquidBox.set_name('velora-date-menu-liquid-box');
        liquidBox.set_clip_to_allocation(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(1, 1);
        root.add_child(liquidBox);

        const wallpaper = this._vendor.createBackgroundMirror(
            'velora-date-menu-wallpaper'
        );
        wallpaper.set_position?.(0, 0);
        liquidBox.insert_child_at_index(wallpaper, 0);

        // Same invisible compositor guard used by the proven notification
        // pilot and the vendored LiquidEffect managers.
        const breaker = new this._vendor.UnpickableActor();
        breaker.set_name('velora-date-menu-optimization-breaker');
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-date-menu-lite',
        });

        // Native menu bounds are the visible material bounds. Sampling
        // headroom is provided by the root clip, not by a second larger card.
        effect.setPadding?.(0);
        effect.setIsDock?.(false);
        effect.setCornerRadius?.(this._cornerRadius);
        effect.setBlurMethod?.(1);
        liquidBox.add_effect(effect);

        try {
            if (
                menuRoot?.get_parent?.() ===
                Main.layoutManager.uiGroup
            ) {
                Main.layoutManager.uiGroup.insert_child_below(
                    root,
                    menuRoot
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
            console.error(
                '[Velora][DateMenuGlass] attach failed: ' + error
            );
            return null;
        }

        const material = {
            root,
            liquidBox,
            wallpaper,
            effect,
            menuRoot,
            radius: this._cornerRadius,
            signals: [],
            laterId: 0,
            lastShaderX: null,
            lastShaderY: null,
            lastShaderW: null,
            lastShaderH: null,
        };

        this._material = material;
        this._connectGeometrySignals(material);

        effect.setLiveGeometryHook?.(() => {
            if (
                this._enabled &&
                this._material === material &&
                this._menu?.isOpen
            ) {
                this._sync(material, true);
            }
        });

        return material;
    }

    _resolveMenuRoot(actor) {
        let root = actor;
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
        let cursor = this._box;

        while (
            cursor &&
            cursor !== Main.layoutManager.uiGroup
        ) {
            watched.add(cursor);
            cursor = cursor.get_parent?.() ?? null;
        }

        if (this._actor)
            watched.add(this._actor);
        if (this._boxPointer)
            watched.add(this._boxPointer);

        const queue = () => {
            if (this._menu?.isOpen)
                this._queueSync(material);
        };

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
    }

    _applyAppearance(material, state) {
        if (!material?.effect || !state)
            return;

        material.effect.setTintColor?.(
            (state.r ?? 0) / 255,
            (state.g ?? 0) / 255,
            (state.b ?? 0) / 255
        );
        material.effect.setTintStrength?.(state.opacity ?? 0);
        material.effect.setBlurRadius?.(state.blur ?? 0);
        material.effect.setCornerRadius?.(material.radius);

        try {
            material.effect.setBrightness?.(
                this._settings.get_double('menu-brightness')
            );
            material.effect.setContrast?.(
                this._settings.get_double('menu-contrast')
            );
            material.effect.setSaturation?.(
                this._settings.get_double('menu-saturation')
            );

            // Keep the low-load material path independent of the global
            // quality toggle while we validate this surface.
            material.effect.setBlurMethod?.(1);
        } catch {
            // Existing effect values remain valid if optional settings fail.
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
                    this._material === material &&
                    this._menu?.isOpen
                ) {
                    this._sync(material, false);
                }

                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _sync(material, shaderOnly) {
        const box = this._box;
        if (
            !box ||
            this._material !== material ||
            !this._menu?.isOpen
        ) {
            if (!shaderOnly)
                material?.root?.hide?.();
            return;
        }

        const rect = this._vendor.getTransformedRect(box);
        if (!finiteRect(rect)) {
            if (!shaderOnly)
                material.root.hide?.();
            return;
        }

        const [absX, absY, width, height] = rect;
        const opacity =
            box.get_paint_opacity?.() ??
            this._actor?.get_paint_opacity?.() ??
            255;

        if (
            !box.mapped ||
            !box.visible ||
            opacity <= 0
        ) {
            if (!shaderOnly)
                material.root.hide?.();
            return;
        }

        const monitor =
            this._vendor.resolveMonitorGeometry([
                box,
                this._actor,
                Main.panel,
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

        this._vendor.setSizeIfChanged(
            material.wallpaper,
            global.stage.width,
            global.stage.height
        );
        this._vendor.setTranslationIfChanged(
            material.wallpaper,
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
                Math.round(blur * 3 + 40)
            )
        );

        this._vendor.setClipIfChanged(
            material.root,
            glassX - margin,
            glassY - margin,
            width + margin * 2,
            height + margin * 2
        );

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

    _destroyMaterial() {
        const material = this._material;
        this._material = null;

        if (!material)
            return;

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

        try {
            material.root?.destroy?.();
        } catch {
            // Root may already have been destroyed with Shell teardown.
        }
    }

    cleanup() {
        this._enabled = false;

        for (const signal of this._signals) {
            try {
                signal.obj.disconnect(signal.id);
            } catch {
                // Date Menu may already be tearing down.
            }
        }
        this._signals = [];

        this._destroyMaterial();

        try {
            this._box?.remove_style_class_name?.(
                'velora-native-date-menu-glass'
            );
            this._actor?.remove_style_class_name?.(
                'velora-native-date-menu-shell'
            );
            if (
                this._boxPointer &&
                this._boxPointer !== this._actor
            ) {
                this._boxPointer.remove_style_class_name?.(
                    'velora-native-date-menu-shell'
                );
            }
        } catch {
            // Shell actors may already be destroyed.
        }

        this._menu = null;
        this._actor = null;
        this._box = null;
        this._boxPointer = null;
    }
}
