import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const GLASS_CLASS = 'velora-liquid-popup-content';
const SHELL_CLASS = 'velora-liquid-popup-shell';
const DATE_SHELL_CLASS = 'velora-liquid-date-menu-shell';
const DEFAULT_RADIUS = 18;
const GLASS_EDGE_PAD = 20;
const SAMPLE_MARGIN_MIN = 64;
const SAMPLE_MARGIN_MAX = 200;

function finiteRect(values) {
    return values.every(Number.isFinite) &&
        values[2] > 1 &&
        values[3] > 1;
}

function readRadius(actor) {
    try {
        actor.ensure_style?.();
        const node = actor.get_theme_node?.();
        const values = [
            St.Corner.TOPLEFT,
            St.Corner.TOPRIGHT,
            St.Corner.BOTTOMRIGHT,
            St.Corner.BOTTOMLEFT,
        ].map(corner => node?.get_border_radius?.(corner) ?? 0);
        const radius = Math.max(...values);
        if (Number.isFinite(radius) && radius > 0)
            return radius;
    } catch {
        // Theme-derived fallback below.
    }
    return DEFAULT_RADIUS;
}

/**
 * Standard GNOME PopupMenu Liquid Glass.
 *
 * Native hierarchy stays untouched:
 *
 *   Main.uiGroup
 *     └─ menu.actor = BoxPointer
 *          └─ BoxPointer.bin
 *               └─ menu.box (.popup-menu-content)
 *
 * Velora adds a separate, unpickable, full-monitor paint layer directly below
 * menu.actor in Main.uiGroup. Its shader mask follows menu.box's transformed
 * stage rect. This avoids participating in BoxPointer layout/allocation at all.
 */
class PopupGlassSurface {
    constructor(manager, menu) {
        this._manager = manager;
        this._vendor = manager._vendor;
        this._settings = manager._settings;
        this._menu = menu;
        this._box = menu?.box ?? null;
        this._boxPointer = menu?._boxPointer ?? menu?.actor ?? null;
        this._bin = menu?._boxPointer?.bin ?? null;

        this._root = null;
        this._liquidBox = null;
        this._sceneManager = null;
        this._filterLayer = null;
        this._effect = null;
        this._radius = DEFAULT_RADIUS;
        this._destroyed = false;
        this._openStateId = 0;
        this._isDateMenu =
            String(
                this._box?.get_style_class_name?.() ??
                this._box?.style_class ??
                ''
            ).split(/\s+/).includes('datemenu-popover');
        this._lastSceneSyncUs = 0;

        this._lastShaderX = NaN;
        this._lastShaderY = NaN;
        this._lastShaderW = NaN;
        this._lastShaderH = NaN;
        this._lastMonitorX = NaN;
        this._lastMonitorY = NaN;
        this._lastScreenW = 0;
        this._lastScreenH = 0;
    }

    attach() {
        if (
            this._destroyed ||
            !this._box ||
            !this._bin ||
            !this._boxPointer ||
            this._root
        ) {
            return Boolean(this._root);
        }

        // Recover stale wrapper/direct-material remnants from older Velora
        // revisions before installing the stage-level material.
        const currentChild = this._bin.get_child?.() ?? null;
        if (
            currentChild !== this._box &&
            currentChild?.get_name?.() === 'velora-popup-glass-stack' &&
            this._box.get_parent?.() === currentChild
        ) {
            try {
                currentChild.remove_child(this._box);
                this._bin.set_child(this._box);
                currentChild.destroy?.();
            } catch (error) {
                console.error(
                    '[Velora][PopupGlass] stale wrapper recovery failed: ' +
                    error
                );
                return false;
            }
        }

        for (const child of this._boxPointer.get_children?.() ?? []) {
            if (
                child !== this._bin &&
                child.get_name?.() === 'velora-popup-glass-material'
            ) {
                try {
                    child.destroy?.();
                } catch {
                    // Best-effort recovery from an older runtime.
                }
            }
        }

        if (this._bin.get_child?.() !== this._box)
            return false;

        this._radius = readRadius(this._box);

        const root = new this._vendor.UnpickableActor({
            name: 'velora-popup-material-root',
            reactive: false,
        });
        root.set_size(1, 1);
        root.hide();

        const liquidBox = new this._vendor.UnpickableActor({
            name: 'velora-popup-liquid-box',
            reactive: false,
        });
        liquidBox.set_clip_to_allocation(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(1, 1);
        root.add_child(liquidBox);

        // GPU-native scene source: shared wallpaper + live Meta.WindowActor
        // clones. No CPU screenshot/readback.
        const sceneManager =
            new this._vendor.WindowCloneManager(
                liquidBox,
                null,
                'velora-popup-scene'
            );

        const breaker = new this._vendor.UnpickableActor({
            name: 'velora-popup-optimization-breaker',
            reactive: false,
        });
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-popup',
        });
        effect.setPadding?.(20);
        effect.setIsDock?.(false);
        effect.setSurfaceLightEnabled?.(true);
        effect.setCornerRadius?.(this._radius);
        effect.setBlurMethod?.(1);
        liquidBox.add_effect(effect);

        const filterLayer = new St.Widget({
            name: 'velora-popup-white-filter',
            style_class: 'velora-glass-white-filter',
            reactive: false,
        });
        root.add_child(filterLayer);

        try {
            if (
                this._boxPointer.get_parent?.() ===
                Main.layoutManager.uiGroup
            ) {
                Main.layoutManager.uiGroup.insert_child_below(
                    root,
                    this._boxPointer
                );
            } else {
                Main.layoutManager.uiGroup.add_child(root);
            }
        } catch (error) {
            try {
                sceneManager.destroy?.();
            } catch {}
            try {
                root.destroy?.();
            } catch {}

            console.error(
                '[Velora][PopupGlass] stage material attach failed: ' +
                error
            );
            return false;
        }

        this._box.add_style_class_name?.(GLASS_CLASS);
        this._boxPointer.add_style_class_name?.(SHELL_CLASS);
        if (this._isDateMenu)
            this._boxPointer.add_style_class_name?.(DATE_SHELL_CLASS);

        this._root = root;
        this._liquidBox = liquidBox;
        this._sceneManager = sceneManager;
        this._filterLayer = filterLayer;
        this._effect = effect;

        try {
            this._openStateId = this._menu.connect(
                'open-state-changed',
                (_menu, isOpen) => {
                    if (!isOpen) {
                        this._root?.hide?.();
                        return;
                    }

                    this._sceneManager?.rebuildClones?.();
                    this._lastSceneSyncUs = GLib.get_monotonic_time();
                    this._invalidateGeometry();
                    this._root?.queue_redraw?.();
                }
            );
        } catch {
            this._openStateId = 0;
        }

        effect.setLiveGeometryHook?.(() => {
            // Paint-time path is uniforms only; actor tree writes remain in
            // the stage before-update sync.
            this._syncShaderGeometry();
        });

        this.updateAppearance(this._manager._appearance);
        this._sync(false);

        console.log(
            '[Velora][PopupGlass] attached ' +
            this._manager.describeMenu(this._menu)
        );
        return true;
    }

    _invalidateGeometry() {
        this._lastShaderX = NaN;
        this._lastShaderY = NaN;
        this._lastShaderW = NaN;
        this._lastShaderH = NaN;
        this._lastMonitorX = NaN;
        this._lastMonitorY = NaN;
        this._lastScreenW = 0;
        this._lastScreenH = 0;
    }

    updateAppearance(state) {
        if (!this._effect || !state)
            return;

        this._radius = readRadius(this._box);

        const profile =
            this._isDateMenu && state.dateMenu
                ? {
                    ...state,
                    ...state.dateMenu,
                }
                : state;

        this._effect.setTintColor?.(
            (profile.r ?? 255) / 255,
            (profile.g ?? 255) / 255,
            (profile.b ?? 255) / 255
        );
        this._effect.setTintStrength?.(profile.opacity ?? 0.02);
        this._effect.setBlurRadius?.(profile.blur ?? 7);
        this._effect.setCornerRadius?.(this._radius);
        this._effect.setBlurMethod?.(1);

        const filterOpacity = Math.max(
            0,
            Math.min(0.20, profile.filterOpacity ?? 0.04)
        );
        const filterBorder = this._isDateMenu
            ? 'border: none;'
            : (
                'border: 1px solid rgba(255,255,255,' +
                Math.min(0.12, filterOpacity + 0.025).toFixed(3) +
                ');'
            );

        this._filterLayer?.set_style?.(
            'background-color: rgba(255,255,255,' +
            filterOpacity.toFixed(3) +
            '); border-radius: ' +
            Math.round(this._radius) +
            'px; ' +
            filterBorder +
            ' box-shadow: none;'
        );

        try {
            this._effect.setBrightness?.(
                this._settings.get_double('menu-brightness')
            );
            this._effect.setContrast?.(
                this._settings.get_double('menu-contrast')
            );
            this._effect.setSaturation?.(
                this._settings.get_double('menu-saturation')
            );
        } catch {
            // Renderer defaults remain valid.
        }

        this._root?.queue_redraw?.();
    }

    syncFrame() {
        if (this._destroyed)
            return;

        this._sync(false);
    }

    _measure() {
        const box = this._box;
        const actor = this._boxPointer;
        if (!box || !actor)
            return null;

        const rect = this._vendor.getTransformedRect(box);
        if (!finiteRect(rect))
            return null;

        const opacity =
            actor.get_paint_opacity?.() ??
            actor.opacity ??
            255;

        if (
            !actor.mapped ||
            !actor.visible ||
            opacity <= 0
        ) {
            return null;
        }

        const monitor =
            this._vendor.resolveMonitorGeometry([
                box,
                actor,
                this._menu?.sourceActor,
            ]) ??
            Main.layoutManager.primaryMonitor ??
            {
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
            };

        return {
            rect,
            opacity,
            monitor,
        };
    }

    _sync(shaderOnly) {
        const measured = this._measure();
        if (!measured) {
            if (!shaderOnly && this._root?.visible)
                this._root.hide?.();
            return;
        }

        const {
            rect: [absX, absY, width, height],
            opacity,
            monitor,
        } = measured;

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

        // GNOME's menu children (notably message cards) intentionally paint
        // shadows slightly outside menu.box. The vendored UIManager reserves
        // shader padding for this exact reason. Expand only the material mask;
        // native layout/position remains untouched.
        const glassAbsX = absX - GLASS_EDGE_PAD;
        const glassAbsY = absY - GLASS_EDGE_PAD;
        const glassW = width + GLASS_EDGE_PAD * 2;
        const glassH = height + GLASS_EDGE_PAD * 2;

        const glassX = glassAbsX - monitorX;
        const glassY = glassAbsY - monitorY;

        const geometryChanged =
            this._lastShaderX !== glassX ||
            this._lastShaderY !== glassY ||
            this._lastShaderW !== glassW ||
            this._lastShaderH !== glassH;

        if (geometryChanged) {
            this._lastShaderX = glassX;
            this._lastShaderY = glassY;
            this._lastShaderW = glassW;
            this._lastShaderH = glassH;

            this._effect?.setGlassGeometry?.(
                glassX,
                glassY,
                glassW,
                glassH
            );
        }

        this._effect?.setResolution?.(
            screenW,
            screenH
        );

        if (shaderOnly)
            return;

        const rootChanged =
            this._lastMonitorX !== monitorX ||
            this._lastMonitorY !== monitorY ||
            this._lastScreenW !== screenW ||
            this._lastScreenH !== screenH;

        if (rootChanged) {
            this._vendor.setPositionIfChanged(
                this._root,
                monitorX,
                monitorY
            );
            this._vendor.setSizeIfChanged(
                this._root,
                screenW,
                screenH
            );
            this._vendor.setPositionIfChanged(
                this._liquidBox,
                0,
                0
            );
            this._vendor.setSizeIfChanged(
                this._liquidBox,
                screenW,
                screenH
            );

            this._lastMonitorX = monitorX;
            this._lastMonitorY = monitorY;
            this._lastScreenW = screenW;
            this._lastScreenH = screenH;
        }

        const filterX =
            this._isDateMenu
                ? absX - monitorX
                : glassX;
        const filterY =
            this._isDateMenu
                ? absY - monitorY
                : glassY;
        const filterW =
            this._isDateMenu
                ? width
                : glassW;
        const filterH =
            this._isDateMenu
                ? height
                : glassH;

        this._vendor.setPositionIfChanged(
            this._filterLayer,
            filterX,
            filterY
        );
        this._vendor.setSizeIfChanged(
            this._filterLayer,
            filterW,
            filterH
        );

        const surfaceAppearance =
            this._isDateMenu
                ? {
                    ...this._manager._appearance,
                    ...(this._manager._appearance?.dateMenu ?? {}),
                }
                : this._manager._appearance;

        const blur = Math.max(
            0,
            surfaceAppearance?.blur ?? 0
        );
        const margin = Math.max(
            SAMPLE_MARGIN_MIN,
            Math.min(
                SAMPLE_MARGIN_MAX,
                Math.round(blur * 3 + 48)
            )
        );

        this._vendor.setClipIfChanged(
            this._root,
            glassX - margin,
            glassY - margin,
            glassW + margin * 2,
            glassH + margin * 2
        );

        this._effect?.setShadowMaxRadius?.(
            Math.max(0, margin - 16)
        );

        const captureRect = [
            glassAbsX - margin,
            glassAbsY - margin,
            glassW + margin * 2,
            glassH + margin * 2,
        ];

        const sceneFps = Math.max(
            15,
            Math.min(
                60,
                this._manager._appearance?.sceneFps ?? 30
            )
        );
        const nowUs = GLib.get_monotonic_time();
        const intervalUs = 1000000 / sceneFps;
        const sceneDue =
            geometryChanged ||
            rootChanged ||
            this._lastSceneSyncUs === 0 ||
            nowUs - this._lastSceneSyncUs >= intervalUs;

        if (sceneDue) {
            this._sceneManager?.setOffset?.(
                -monitorX,
                -monitorY
            );
            this._sceneManager?.setCullRect?.(captureRect);
            this._sceneManager?.applyBgCloneClip?.(captureRect);
            this._sceneManager?.sync?.();
            this._lastSceneSyncUs = nowUs;
        }

        if (this._root.opacity !== opacity)
            this._root.opacity = opacity;

        if (!this._root.visible)
            this._root.show?.();
    }

    _syncShaderGeometry() {
        if (
            this._destroyed ||
            !this._effect ||
            !this._root?.mapped
        ) {
            return;
        }

        this._sync(true);
    }

    detach() {
        if (this._destroyed)
            return;
        this._destroyed = true;

        try {
            this._effect?.setLiveGeometryHook?.(null);
        } catch {}

        if (this._openStateId && this._menu) {
            try {
                this._menu.disconnect(this._openStateId);
            } catch {}
        }
        this._openStateId = 0;

        try {
            this._box?.remove_style_class_name?.(GLASS_CLASS);
            this._boxPointer?.remove_style_class_name?.(SHELL_CLASS);
            this._boxPointer?.remove_style_class_name?.(DATE_SHELL_CLASS);
        } catch {}

        try {
            this._sceneManager?.destroy?.();
        } catch {}

        try {
            this._root?.destroy?.();
        } catch {}

        this._root = null;
        this._liquidBox = null;
        this._sceneManager = null;
        this._filterLayer = null;
        this._effect = null;
        this._menu = null;
        this._box = null;
        this._boxPointer = null;
        this._bin = null;
    }
}

export class PopupGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;
        this._surfaces = new Map();
        this._enabled = false;
        this._originalOpen = null;
        this._originalDestroy = null;
        this._patchedOpen = null;
        this._patchedDestroy = null;
        this._appearance = null;
        this._stageSyncId = 0;
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._appearance = this._readAppearance();

        const prototype = PopupMenu.PopupMenu.prototype;

        this._originalOpen =
            prototype.open?._veloraOriginalOpen ??
            prototype.open;
        this._originalDestroy =
            prototype.destroy?._veloraOriginalDestroy ??
            prototype.destroy;

        const manager = this;

        this._patchedOpen = function (...args) {
            if (manager._enabled)
                manager.attach(this);
            return manager._originalOpen.apply(this, args);
        };

        this._patchedDestroy = function (...args) {
            manager.detach(this);
            return manager._originalDestroy.apply(this, args);
        };

        this._patchedOpen._veloraOriginalOpen =
            this._originalOpen;
        this._patchedDestroy._veloraOriginalDestroy =
            this._originalDestroy;

        prototype.open = this._patchedOpen;
        prototype.destroy = this._patchedDestroy;

        this._stageSyncId = global.stage.connect(
            'before-update',
            () => {
                if (!this._enabled)
                    return;

                for (const [menu, surface] of [...this._surfaces]) {
                    if (menu?.isOpen === false)
                        continue;

                    try {
                        surface.syncFrame();
                    } catch (error) {
                        console.error(
                            '[Velora][PopupGlass] frame sync failed; restoring native popup: ' +
                            error +
                            '\n' +
                            (error?.stack ?? '')
                        );
                        this.detach(menu);
                    }
                }
            }
        );

        console.log(
            '[Velora][PopupGlass] global PopupMenu adapter active'
        );
    }

    describeMenu(menu) {
        if (!menu)
            return 'unknown-menu';

        const boxClasses =
            menu.box?.get_style_class_name?.() ??
            menu.box?.style_class ??
            '';
        const sourceName =
            menu.sourceActor?.get_name?.() ??
            menu.sourceActor?.constructor?.name ??
            '';

        return (
            (sourceName ? sourceName + ' ' : '') +
            '[' + boxClasses + ']'
        ).trim();
    }

    attach(menu) {
        if (!this._enabled || !menu)
            return null;

        const existing = this._surfaces.get(menu);
        if (existing)
            return existing;

        const surface = new PopupGlassSurface(this, menu);
        if (!surface.attach())
            return null;

        this._surfaces.set(menu, surface);
        return surface;
    }

    detach(menu) {
        const surface = this._surfaces.get(menu);
        if (!surface)
            return;

        this._surfaces.delete(menu);
        surface.detach();
    }

    updateAppearance(state = this._readAppearance()) {
        this._appearance = state;
        for (const surface of this._surfaces.values())
            surface.updateAppearance(state);
    }

    cleanup() {
        if (!this._enabled)
            return;

        this._enabled = false;

        if (this._stageSyncId) {
            try {
                global.stage.disconnect(this._stageSyncId);
            } catch {}
            this._stageSyncId = 0;
        }

        const prototype = PopupMenu.PopupMenu.prototype;
        if (prototype.open === this._patchedOpen)
            prototype.open = this._originalOpen;
        if (prototype.destroy === this._patchedDestroy)
            prototype.destroy = this._originalDestroy;

        for (const [menu, surface] of [...this._surfaces]) {
            this._surfaces.delete(menu);
            surface.detach();
        }

        this._originalOpen = null;
        this._originalDestroy = null;
        this._patchedOpen = null;
        this._patchedDestroy = null;
        this._appearance = null;

        console.log(
            '[Velora][PopupGlass] global PopupMenu adapter stopped'
        );
    }
}
