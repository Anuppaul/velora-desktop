import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    VELORA_GLASS_ADAPTERS,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

const CARD_CLASS = 'velora-liquid-shell-card';
const WINDOW_CLOSE_CLASS = 'window-close';
const OPTICAL_MARGIN = 104;
const WINDOW_CLOSE_OPTICAL_MARGIN = 20;
const TARGET_CLASSES = new Set([
    'modal-dialog',
    'switcher-list',
    'workspace-switcher',
    'screenshot-ui-panel',
    'app-folder-dialog',
    'resize-popup',
    'search-entry',
    'window-close',
    'workspace-thumbnails',
    'dash-background',
]);

const OVERVIEW_ONLY_CLASSES = new Set([
    'search-entry',
    'window-close',
    'workspace-thumbnails',
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
        this._wallpaperMirror = null;
        this._wallpaperOnly = false;
        this._isWindowClose =
            classesOf(target).includes(WINDOW_CLOSE_CLASS);
        this._previewSource = null;
        this._previewClone = null;

        if (this._isWindowClose && this._parent) {
            // GNOME 50 WindowPreview children are:
            //   windowContainer, caption, app icon, close button.
            // Capture ONLY windowContainer so the lens refracts the preview
            // beneath it without recursively cloning the close button itself.
            this._previewSource =
                (this._parent.get_children?.() ?? []).find(child => {
                    if (child === target)
                        return false;
                    const classes = classesOf(child);
                    return (
                        !classes.includes('window-caption') &&
                        !classes.includes('window-icon')
                    );
                }) ?? null;
        }

        this._opticalMargin =
            this._isWindowClose
                ? WINDOW_CLOSE_OPTICAL_MARGIN
                : OPTICAL_MARGIN;
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

        let previewClone = null;
        if (this._isWindowClose && this._previewSource) {
            previewClone = new Clutter.Clone({
                source: this._previewSource,
                reactive: false,
            });
            previewClone.set_name?.(
                'velora-window-close-preview-clone'
            );
            previewClone.set_no_layout?.(true);
            sceneRoot.add_child(previewClone);
        }

        let wallpaperMirror = null;

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
            owner:
                classesOf(this._target).includes(WINDOW_CLOSE_CLASS)
                    ? 'velora-window-close'
                    : (
                        this._wallpaperOnly
                            ? 'velora-app-grid-wallpaper'
                            : 'velora-shell-card'
                    ),
        });
        effect.setPadding?.(20);
        effect.setShadowMaxRadius?.(
            this._opticalMargin - 8
        );
        effect.setIsDock?.(false);
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
        this._wallpaperMirror = wallpaperMirror;
        this._previewClone = previewClone;
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

        const isWindowClose =
            classesOf(this._target).includes(WINDOW_CLOSE_CLASS);
        const role = isWindowClose
            ? VELORA_GLASS_ROLES.windowClose
            : VELORA_GLASS_ROLES.shellCard;
        const adapter =
            VELORA_GLASS_ADAPTERS.shellCard;
        const [targetW, targetH] =
            this._target.get_size?.() ?? [64, 64];
        const radius = isWindowClose
            ? Math.max(
                12,
                Math.min(
                    targetW > 1 ? targetW : 64,
                    targetH > 1 ? targetH : 64
                ) / 2
            )
            : Math.max(0, radiusOf(this._target));

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
            // Shared material defaults remain valid.
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
                    isWindowClose
                        ? (
                            (state.opacity ?? 0) <= 0
                                ? 0
                                : Math.min(
                                    0.11,
                                    Math.max(
                                        role.tintStrength,
                                        (state.opacity ?? 0) * 3.2
                                    )
                                )
                        )
                        : (
                            adapter.inheritGlobalTint
                                ? (state.opacity ?? role.tintStrength)
                                : role.tintStrength
                        ),
                baseBlur:
                    adapter.inheritGlobalBlur
                        ? (state.blur ?? 7)
                        : 7,
                blurRadius:
                    isWindowClose
                        ? (
                            (state.blur ?? 0) <= 0
                                ? 0
                                : Math.min(
                                    role.blurMax,
                                    Math.max(
                                        role.blurMin,
                                        (state.blur ?? 7) + 2
                                    )
                                )
                        )
                        : null,
                cornerRadius: radius,
                brightness:
                    isWindowClose
                        ? Math.max(1.04, brightness ?? 1.0)
                        : brightness,
                contrast:
                    isWindowClose
                        ? Math.max(1.08, contrast ?? 1.0)
                        : contrast,
                saturation:
                    isWindowClose
                        ? Math.max(1.06, saturation ?? 1.0)
                        : saturation,
                multiRegion:
                    isWindowClose
                        ? false
                        : adapter.multiRegion,
            }
        );

        this._material?.queue_redraw?.();
    }

    _ensureSceneManager() {
        if (this._isWindowClose)
            return null;

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
            localX - this._opticalMargin,
            localY - this._opticalMargin
        );
        this._vendor.setSizeIfChanged(
            this._material,
            w + this._opticalMargin * 2,
            h + this._opticalMargin * 2
        );
        const scaleX = this._target.scale_x ?? 1;
        const scaleY = this._target.scale_y ?? 1;
        const [pivotX, pivotY] =
            this._target.get_pivot_point?.() ?? [0.5, 0.5];
        const materialW =
            w + this._opticalMargin * 2;
        const materialH =
            h + this._opticalMargin * 2;

        this._material.set_pivot_point(
            (this._opticalMargin + pivotX * w) / materialW,
            (this._opticalMargin + pivotY * h) / materialH
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
            !material.mapped
        ) {
            return;
        }

        if (
            !this._isWindowClose &&
            !sceneManager
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

        if (this._isWindowClose) {
            const source = this._previewSource;
            const clone = this._previewClone;
            if (!source || !clone)
                return;

            const rect =
                this._vendor.getTransformedRect?.(source);
            if (
                !Array.isArray(rect) ||
                rect.length < 4 ||
                !rect.every(Number.isFinite) ||
                rect[2] <= 1 ||
                rect[3] <= 1
            ) {
                return;
            }

            // sceneRoot is counter-transformed into stage coordinates above,
            // so stage-space source bounds map 1:1 into the capture.
            this._vendor.setPositionIfChanged(
                clone,
                rect[0],
                rect[1]
            );
            this._vendor.setSizeIfChanged(
                clone,
                rect[2],
                rect[3]
            );

            if (
                clone.scale_x !== 1 ||
                clone.scale_y !== 1
            ) {
                clone.set_scale(1, 1);
            }

            this._lastCaptureX = rect[0];
            this._lastCaptureY = rect[1];
            this._lastCaptureW = rect[2];
            this._lastCaptureH = rect[3];
            return;
        }

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
        const glassW = Math.max(
            1,
            w - this._opticalMargin * 2
        );
        const glassH = Math.max(
            1,
            h - this._opticalMargin * 2
        );
        effect.setResolution?.(w, h);
        effect.setGlassGeometry?.(
            this._opticalMargin,
            this._opticalMargin,
            glassW,
            glassH
        );

        if (this._isWindowClose) {
            effect.setCornerRadius?.(
                Math.max(
                    1,
                    Math.min(glassW, glassH) / 2
                )
            );
        }
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
        this._wallpaperMirror = null;
        this._previewClone = null;
        this._previewSource = null;
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
