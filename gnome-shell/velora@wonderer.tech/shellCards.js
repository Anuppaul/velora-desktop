import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CARD_CLASS = 'velora-liquid-shell-card';
const OPTICAL_MARGIN = 104;
const TARGET_CLASSES = new Set([
    'modal-dialog',
    'switcher-list',
    'workspace-switcher',
    'screenshot-ui-panel',
    'app-folder-dialog',
    'resize-popup',
    'search-entry',
    'dash-background',
]);

const OVERVIEW_ONLY_CLASSES = new Set([
    'search-entry',
    'dash-background',
]);

function classesOf(actor) {
    const value =
        actor?.get_style_class_name?.() ??
        actor?.style_class ??
        '';
    return String(value).split(/\s+/).filter(Boolean);
}

function radiusOf(actor) {
    try {
        actor.ensure_style?.();
        const node = actor.get_theme_node?.();
        return Math.max(
            node?.get_border_radius?.(St.Corner.TOPLEFT) ?? 0,
            node?.get_border_radius?.(St.Corner.TOPRIGHT) ?? 0,
            node?.get_border_radius?.(St.Corner.BOTTOMRIGHT) ?? 0,
            node?.get_border_radius?.(St.Corner.BOTTOMLEFT) ?? 0
        );
    } catch {
        return 18;
    }
}

class ShellCardSurface {
    constructor(manager, target) {
        this._manager = manager;
        this._vendor = manager._vendor;
        this._settings = manager._settings;
        this._target = target;
        this._parent = target.get_parent?.() ?? null;
        this._overlay = null;
        this._wrappedBinParent = null;
        this._material = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;
        this._signals = [];
        this._destroyed = false;
        this._lastSceneSyncUs = 0;
        this._lastCaptureX = NaN;
        this._lastCaptureY = NaN;
        this._lastCaptureW = NaN;
        this._lastCaptureH = NaN;
    }

    attach() {
        if (!this._parent || !this._target || this._material)
            return false;

        const material = new this._vendor.UnpickableActor({
            name: 'velora-shell-card-material',
            reactive: false,
        });
        material.set_no_layout?.(true);
        material.set_clip_to_allocation(true);

        const sceneRoot = new this._vendor.UnpickableActor({
            name: 'velora-shell-card-live-scene',
            reactive: false,
        });
        sceneRoot.set_no_layout?.(true);
        material.add_child(sceneRoot);

        const breaker = new this._vendor.UnpickableActor({
            name: 'velora-shell-card-breaker',
            reactive: false,
        });
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        breaker.set_no_layout?.(true);
        material.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-shell-card',
        });
        effect.setPadding?.(20);
        effect.setShadowMaxRadius?.(OPTICAL_MARGIN - 8);
        effect.setIsDock?.(false);
        effect.setSurfaceLightEnabled?.(true);
        effect.setBlurMethod?.(1);
        material.add_effect(effect);

        try {
            if (
                this._parent instanceof St.Bin &&
                this._parent.get_child?.() === this._target
            ) {
                const overlay = new St.Widget({
                    name: 'velora-shell-card-stack',
                    layout_manager: new Clutter.BinLayout(),
                    x_expand: true,
                    y_expand: true,
                    reactive: false,
                });

                this._parent.set_child(overlay);
                overlay.add_child(material);
                overlay.add_child(this._target);

                this._overlay = overlay;
                this._wrappedBinParent = this._parent;
            } else {
                this._parent.insert_child_below(
                    material,
                    this._target
                );
            }
        } catch {
            try {
                if (!material.get_parent?.())
                    this._parent.add_child(material);
                this._parent.set_child_below_sibling?.(
                    material,
                    this._target
                );
            } catch (error) {
                material.destroy?.();
                console.error(
                    '[Velora][ShellCards] attach failed: ' + error
                );
                return false;
            }
        }

        this._material = material;
        this._sceneRoot = sceneRoot;
        this._sceneManager = null;
        this._effect = effect;
        this._target.add_style_class_name?.(CARD_CLASS);

        // Do not call ensure_style()/get_theme_node() recursively from
        // style-changed. GNOME emits style-changed while resolving the style
        // itself, so re-entering radiusOf() here can recurse until GJS aborts.
        // Radius/material settings are refreshed by the normal appearance
        // update path and on surface creation instead.

        try {
            this._signals.push({
                obj: this._target,
                id: this._target.connect(
                    'destroy',
                    () => this.destroy(false)
                ),
            });
        } catch {}

        effect.setLiveGeometryHook?.(() => this._syncPaint());
        this.updateAppearance(this._manager._appearance);
        this._sync();

        console.log(
            '[Velora][ShellCards] attached [' +
            classesOf(this._target).join(' ') +
            ']'
        );
        return true;
    }

    updateAppearance(state) {
        if (!this._effect || !state)
            return;
        const radius = Math.max(0, radiusOf(this._target));
        this._effect.setTintColor?.(
            (state.r ?? 255) / 255,
            (state.g ?? 255) / 255,
            (state.b ?? 255) / 255
        );
        this._effect.setTintStrength?.(state.opacity ?? .12);
        this._effect.setBlurRadius?.(state.blur ?? 20);
        this._effect.setCornerRadius?.(radius);
        this._effect.setBlurMethod?.(1);
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
        this._material?.queue_redraw?.();
    }

    _ensureSceneManager() {
        if (this._sceneManager || !this._sceneRoot)
            return this._sceneManager;

        this._sceneManager =
            new this._vendor.WindowCloneManager(
                this._sceneRoot,
                null,
                'velora-shell-card-scene'
            );
        this._lastSceneSyncUs = 0;
        this._lastCaptureX = NaN;
        this._lastCaptureY = NaN;
        this._lastCaptureW = NaN;
        this._lastCaptureH = NaN;
        return this._sceneManager;
    }

    _releaseSceneManager() {
        if (!this._sceneManager)
            return;

        try {
            this._sceneManager.destroy?.();
        } catch {
            // Scene may already be tearing down.
        }
        this._sceneManager = null;
        this._lastSceneSyncUs = 0;
        this._lastCaptureX = NaN;
        this._lastCaptureY = NaN;
        this._lastCaptureW = NaN;
        this._lastCaptureH = NaN;
    }

    _sync() {
        if (
            this._destroyed ||
            !this._target ||
            !this._material
        ) {
            return;
        }

        const box = this._target.get_allocation_box?.();
        const w = box?.get_width?.() ?? this._target.width ?? 0;
        const h = box?.get_height?.() ?? this._target.height ?? 0;
        const x = box?.x1 ?? this._target.x ?? 0;
        const y = box?.y1 ?? this._target.y ?? 0;
        const opacity =
            this._target.get_paint_opacity?.() ??
            this._target.opacity ??
            255;

        if (
            !this._target.mapped ||
            !this._target.visible ||
            w <= 1 ||
            h <= 1 ||
            opacity <= 0
        ) {
            this._material.hide?.();
            this._releaseSceneManager();
            return;
        }

        const localX = this._overlay ? 0 : x;
        const localY = this._overlay ? 0 : y;

        this._vendor.setPositionIfChanged(
            this._material,
            localX - OPTICAL_MARGIN,
            localY - OPTICAL_MARGIN
        );
        this._vendor.setSizeIfChanged(
            this._material,
            w + OPTICAL_MARGIN * 2,
            h + OPTICAL_MARGIN * 2
        );
        const scaleX = this._target.scale_x ?? 1;
        const scaleY = this._target.scale_y ?? 1;
        const [pivotX, pivotY] =
            this._target.get_pivot_point?.() ?? [0.5, 0.5];
        const materialW = w + OPTICAL_MARGIN * 2;
        const materialH = h + OPTICAL_MARGIN * 2;

        this._material.set_pivot_point(
            (OPTICAL_MARGIN + pivotX * w) / materialW,
            (OPTICAL_MARGIN + pivotY * h) / materialH
        );
        if (
            this._material.scale_x !== scaleX ||
            this._material.scale_y !== scaleY
        ) {
            this._material.set_scale(scaleX, scaleY);
        }
        this._vendor.setTranslationIfChanged(
            this._material,
            this._target.translation_x ?? 0,
            this._target.translation_y ?? 0
        );
        if (this._material.opacity !== opacity)
            this._material.opacity = opacity;
        if (!this._material.visible)
            this._material.show?.();

        this._ensureSceneManager();
        this._syncSceneLayers();
    }

    syncFrame() {
        if (
            this._destroyed ||
            !this._target?.mapped ||
            !this._target?.visible
        ) {
            this._releaseSceneManager();
            return;
        }

        this._sync();
    }

    _syncSceneLayers() {
        const material = this._material;
        const sceneRoot = this._sceneRoot;
        const sceneManager = this._ensureSceneManager();
        if (
            this._destroyed ||
            !material ||
            !sceneRoot ||
            !sceneManager ||
            !material.mapped
        ) {
            return;
        }

        const [w, h] = material.get_size?.() ?? [0, 0];
        if (w <= 1 || h <= 1)
            return;

        const [absX, absY] =
            material.get_transformed_position?.() ?? [0, 0];
        const [tw, th] =
            material.get_transformed_size?.() ?? [w, h];
        const sx = Math.max(tw / w, .001);
        const sy = Math.max(th / h, .001);

        this._vendor.setSizeIfChanged(
            sceneRoot,
            global.stage.width,
            global.stage.height
        );
        const invScaleX = 1 / sx;
        const invScaleY = 1 / sy;
        if (
            sceneRoot.scale_x !== invScaleX ||
            sceneRoot.scale_y !== invScaleY
        ) {
            sceneRoot.set_scale(invScaleX, invScaleY);
        }
        if (sceneRoot.x !== 0 || sceneRoot.y !== 0)
            sceneRoot.set_position(0, 0);
        this._vendor.setTranslationIfChanged(
            sceneRoot,
            -absX / sx,
            -absY / sy
        );

        const captureRect = [
            absX,
            absY,
            tw,
            th,
        ];

        const captureChanged =
            this._lastCaptureX !== absX ||
            this._lastCaptureY !== absY ||
            this._lastCaptureW !== tw ||
            this._lastCaptureH !== th;

        const sceneFps = Math.max(
            15,
            Math.min(
                60,
                this._manager?._appearance?.sceneFps ?? 30
            )
        );
        const nowUs = GLib.get_monotonic_time();
        const intervalUs = 1000000 / sceneFps;
        const sceneDue =
            captureChanged ||
            this._lastSceneSyncUs === 0 ||
            nowUs - this._lastSceneSyncUs >= intervalUs;

        if (!sceneDue)
            return;

        sceneManager.setCullRect?.(captureRect);
        sceneManager.applyBgCloneClip?.(captureRect);
        sceneManager.sync?.();

        this._lastCaptureX = absX;
        this._lastCaptureY = absY;
        this._lastCaptureW = tw;
        this._lastCaptureH = th;
        this._lastSceneSyncUs = nowUs;
    }

    _syncPaint() {
        const material = this._material;
        const effect = this._effect;
        if (
            this._destroyed ||
            !material ||
            !effect ||
            !material.mapped
        ) {
            return;
        }

        const [w, h] = material.get_size?.() ?? [0, 0];
        if (w <= 1 || h <= 1)
            return;

        // Paint hook is uniforms-only; live scene actor writes happen before
        // update in ShellCardGlassManager.
        const glassW = Math.max(1, w - OPTICAL_MARGIN * 2);
        const glassH = Math.max(1, h - OPTICAL_MARGIN * 2);
        effect.setResolution?.(w, h);
        effect.setGlassGeometry?.(
            OPTICAL_MARGIN,
            OPTICAL_MARGIN,
            glassW,
            glassH
        );
    }

    destroy(removeClass = true) {
        if (this._destroyed)
            return;
        this._destroyed = true;

        try {
            this._effect?.setLiveGeometryHook?.(null);
        } catch {}

        for (const signal of this._signals) {
            try {
                signal.obj.disconnect(signal.id);
            } catch {}
        }
        this._signals = [];

        if (removeClass) {
            try {
                this._target?.remove_style_class_name?.(
                    CARD_CLASS
                );
            } catch {}
        }

        this._releaseSceneManager();

        let safeToDestroyOverlay = true;

        if (
            this._overlay &&
            this._wrappedBinParent &&
            this._target
        ) {
            if (removeClass) {
                try {
                    if (this._target.get_parent?.() === this._overlay)
                        this._overlay.remove_child(this._target);

                    if (!this._target.get_parent?.())
                        this._wrappedBinParent.set_child(this._target);
                } catch (error) {
                    console.error(
                        '[Velora][ShellCards] native Bin restore failed: ' +
                        error
                    );
                }

                safeToDestroyOverlay =
                    this._target.get_parent?.() !== this._overlay;
            } else {
                // Target is itself being destroyed. Detach it from our wrapper
                // so destroying the wrapper cannot recursively own/destroy it.
                try {
                    if (this._target.get_parent?.() === this._overlay)
                        this._overlay.remove_child(this._target);
                } catch {}
            }
        }

        if (safeToDestroyOverlay) {
            try {
                this._overlay?.destroy?.();
            } catch {}
        } else {
            try {
                this._material?.destroy?.();
            } catch {}
            console.warn(
                '[Velora][ShellCards] kept neutral wrapper to protect native card content'
            );
        }

        if (!this._overlay) {
            try {
                this._material?.destroy?.();
            } catch {}
        }

        this._manager?._surfaceDestroyed(this._target, this);
        this._overlay = null;
        this._wrappedBinParent = null;
        this._material = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;
        this._target = null;
        this._parent = null;
        this._manager = null;
    }
}

export class ShellCardGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;
        this._appearance = null;
        this._surfaces = new Map();
        this._watched = new Map();
        this._enabled = false;
        this._stageSyncId = 0;
    }

    setup() {
        if (this._enabled)
            return;
        this._enabled = true;
        this._appearance = this._readAppearance();
        this._watchTree(Main.uiGroup);

        this._stageSyncId = global.stage.connect(
            'before-update',
            () => {
                if (!this._enabled)
                    return;

                for (const [actor, surface] of [...this._surfaces]) {
                    try {
                        surface.syncFrame();
                    } catch (error) {
                        console.error(
                            '[Velora][ShellCards] frame sync failed; restoring native card: ' +
                            error +
                            '\n' +
                            (error?.stack ?? '')
                        );
                        this._surfaces.delete(actor);
                        surface.destroy(true);
                    }
                }
            }
        );

        console.log(
            '[Velora][ShellCards] event-driven Shell card registry active'
        );
    }

    _watchTree(actor) {
        if (
            !this._enabled ||
            !actor ||
            actor === global.window_group ||
            this._watched.has(actor)
        ) {
            return;
        }

        const name = actor.get_name?.() ?? '';
        if (
            name.startsWith('velora-') ||
            name.startsWith('lg-')
        ) {
            return;
        }

        this._maybeAttach(actor);

        const entry = {childId: 0, destroyId: 0};
        try {
            entry.childId = actor.connect(
                'child-added',
                (_parent, child) => this._watchTree(child)
            );
        } catch {}

        try {
            entry.destroyId = actor.connect('destroy', () => {
                this._watched.delete(actor);
                const surface = this._surfaces.get(actor);
                surface?.destroy(false);
            });
        } catch {}

        this._watched.set(actor, entry);

        for (const child of actor.get_children?.() ?? [])
            this._watchTree(child);
    }

    _maybeAttach(actor) {
        if (
            this._surfaces.has(actor) ||
            !actor?.add_style_class_name
        ) {
            return;
        }

        const classes = classesOf(actor);
        const targetClass =
            classes.find(name => TARGET_CLASSES.has(name)) ?? null;
        if (!targetClass)
            return;

        // search-entry and dash-background are reused/related classes in other
        // Shell surfaces. Only glassify these when they belong to GNOME's
        // overviewGroup, so Ubuntu Dock and unrelated St actors are untouched.
        if (OVERVIEW_ONLY_CLASSES.has(targetClass)) {
            const overview = Main.layoutManager.overviewGroup;
            if (!overview?.contains?.(actor))
                return;
        }

        const surface = new ShellCardSurface(this, actor);
        if (surface.attach())
            this._surfaces.set(actor, surface);
    }

    _surfaceDestroyed(actor, surface) {
        if (this._surfaces.get(actor) === surface)
            this._surfaces.delete(actor);
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
            } catch {
                // Stage may already be tearing down.
            }
            this._stageSyncId = 0;
        }

        for (const surface of [...this._surfaces.values()])
            surface.destroy(true);
        this._surfaces.clear();

        for (const [actor, entry] of this._watched) {
            try {
                if (entry.childId)
                    actor.disconnect(entry.childId);
            } catch {}
            try {
                if (entry.destroyId)
                    actor.disconnect(entry.destroyId);
            } catch {}
        }
        this._watched.clear();

        console.log('[Velora][ShellCards] registry stopped');
    }
}
