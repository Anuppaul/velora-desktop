import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const GLASS_CLASS = 'velora-liquid-popup-content';
const SHELL_CLASS = 'velora-liquid-popup-shell';
const DEFAULT_RADIUS = 18;
// glass.frag's edge lens can reach ~96px beyond the visible rim. Keep source
// pixels around the native popup without enlarging the visible card itself.
const OPTICAL_MARGIN = 104;

function finitePositive(value) {
    return Number.isFinite(value) && value > 0;
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
        if (finitePositive(radius))
            return radius;
    } catch {
        // Theme-derived fallback below.
    }
    return DEFAULT_RADIUS;
}

/**
 * A single native PopupMenu material host.
 *
 * GNOME Shell 50 owns popup geometry/animation in this hierarchy:
 *
 *   BoxPointer -> BoxPointer.bin -> menu.box (.popup-menu-content)
 *
 * We keep BoxPointer.bin -> menu.box completely untouched. The glass material
 * is an extra no-layout paint child of BoxPointer, positioned underneath the
 * native bin. That preserves GNOME's preferred-size and anchor calculations
 * while still inheriting BoxPointer position/scale/opacity animation.
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

        this._material = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;
        this._radius = DEFAULT_RADIUS;
        this._destroyed = false;
        this._lastStageW = 0;
        this._lastStageH = 0;
        this._lastSceneX = NaN;
        this._lastSceneY = NaN;
        this._lastSceneScaleX = NaN;
        this._lastSceneScaleY = NaN;
        this._openStateId = 0;
        this._mappedStateId = 0;
        this._lastHostW = 0;
        this._lastHostH = 0;
        this._lastHostX = NaN;
        this._lastHostY = NaN;
    }

    attach() {
        if (
            this._destroyed ||
            !this._box ||
            !this._bin ||
            !this._boxPointer ||
            this._material
        ) {
            return Boolean(this._material);
        }

        // Recover a stale wrapper left by older Velora revisions before attaching
        // the new no-layout paint child.
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
                    '[Velora][PopupGlass] stale stack recovery failed: ' +
                    error
                );
                return false;
            }
        }

        // Only touch the canonical GNOME hierarchy. If another extension has
        // replaced the St.Bin child, fail closed instead of reparenting an
        // unknown tree.
        if (this._bin.get_child?.() !== this._box)
            return false;

        this._radius = readRadius(this._box);

        const material = new this._vendor.UnpickableActor({
            name: 'velora-popup-glass-material',
            reactive: false,
        });
        // The material is manually allocated larger than the visible popup.
        // It is paint input only and must never influence GNOME's layout.
        material.set_no_layout?.(true);
        material.set_clip_to_allocation(true);

        // Build the optical source entirely from compositor-native GPU actors:
        // a shared wallpaper mirror plus live Meta.WindowActor clones. There is
        // no CPU screenshot/readback path here.
        const sceneRoot = new this._vendor.UnpickableActor({
            name: 'velora-popup-live-scene',
            reactive: false,
        });
        sceneRoot.set_no_layout?.(true);
        material.add_child(sceneRoot);

        const sceneManager =
            new this._vendor.WindowCloneManager(
                sceneRoot,
                null,
                'velora-popup-scene'
            );

        // Prevent the offscreen-cache black-frame edge case already handled by
        // the proven notification path and vendored managers.
        const breaker = new this._vendor.UnpickableActor({
            name: 'velora-popup-optimization-breaker',
            reactive: false,
        });
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        breaker.set_no_layout?.(true);
        material.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-popup',
        });
        effect.setPadding?.(20);
        effect.setShadowMaxRadius?.(OPTICAL_MARGIN - 8);
        effect.setIsDock?.(false);
        effect.setSurfaceLightEnabled?.(true);
        effect.setCornerRadius?.(this._radius);
        effect.setBlurMethod?.(1);
        material.add_effect(effect);

        // Keep GNOME's native hierarchy unchanged:
        // BoxPointer.bin -> menu.box remains exactly as GNOME created it.
        // The material is paint-only and excluded from layout, so it cannot
        // change BoxPointer preferred size or anchor positioning.
        this._boxPointer.add_child(material);
        this._boxPointer.set_child_below_sibling?.(
            material,
            this._bin
        );

        this._box.add_style_class_name?.(GLASS_CLASS);
        this._boxPointer.add_style_class_name?.(SHELL_CLASS);

        this._material = material;
        this._sceneRoot = sceneRoot;
        this._sceneManager = sceneManager;
        this._effect = effect;

        try {
            this._openStateId = this._menu.connect(
                'open-state-changed',
                (_menu, isOpen) => {
                    if (!isOpen)
                        return;

                    // BoxPointer is hidden/unmapped on close. Because our
                    // material is a no-layout child, its previous allocation is
                    // no longer trustworthy when the same menu opens again even
                    // when width/height are identical. Force the next frame to
                    // allocate it again instead of accepting stale cache values.
                    this._invalidateHostGeometry();

                    const sceneManager =
                        this._ensureSceneManager();

                    // Match the vendored UIManager lifecycle: keep the same
                    // manager/effect across close/open cycles, but rebuild the
                    // source actors on every open.
                    sceneManager?.rebuildClones?.();

                    // Scene transforms are derived from the newly allocated
                    // material; invalidate those caches too.
                    this._lastSceneX = NaN;
                    this._lastSceneY = NaN;
                    this._lastSceneScaleX = NaN;
                    this._lastSceneScaleY = NaN;
                    this._lastStageW = 0;
                    this._lastStageH = 0;

                    this._material?.queue_redraw?.();
                }
            );
        } catch {
            this._openStateId = 0;
        }

        try {
            this._mappedStateId = this._boxPointer.connect(
                'notify::mapped',
                () => {
                    if (!this._boxPointer?.mapped)
                        this._invalidateHostGeometry();
                }
            );
        } catch {
            this._mappedStateId = 0;
        }

        effect.setLiveGeometryHook?.(() => this._syncPaintGeometry());
        this.updateAppearance(this._manager._appearance);

        console.log(
            '[Velora][PopupGlass] attached ' +
            this._manager.describeMenu(this._menu)
        );
        return true;
    }

    updateAppearance(state) {
        if (!this._effect || !state)
            return;

        // Our class does not override border-radius, so this remains the
        // current Yaru/Adwaita/custom-theme radius even after glass is active.
        this._radius = readRadius(this._box);

        this._effect.setTintColor?.(
            (state.r ?? 255) / 255,
            (state.g ?? 255) / 255,
            (state.b ?? 255) / 255
        );
        this._effect.setTintStrength?.(state.opacity ?? 0.12);
        this._effect.setBlurRadius?.(state.blur ?? 20);
        this._effect.setCornerRadius?.(this._radius);
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

    _invalidateHostGeometry() {
        this._lastHostW = 0;
        this._lastHostH = 0;
        this._lastHostX = NaN;
        this._lastHostY = NaN;
    }

    _syncHostGeometry() {
        const material = this._material;
        const bin = this._bin;
        const box = this._box;
        if (!material || !bin || !box)
            return;

        const binAllocation = bin.get_allocation_box?.();
        const boxAllocation = box.get_allocation_box?.();

        const w =
            boxAllocation?.get_width?.() ??
            box.width ??
            0;
        const h =
            boxAllocation?.get_height?.() ??
            box.height ??
            0;

        if (!finitePositive(w) || !finitePositive(h))
            return;

        const x =
            (binAllocation?.x1 ?? bin.x ?? 0) +
            (boxAllocation?.x1 ?? box.x ?? 0);
        const y =
            (binAllocation?.y1 ?? bin.y ?? 0) +
            (boxAllocation?.y1 ?? box.y ?? 0);

        if (
            this._lastHostW === w &&
            this._lastHostH === h &&
            this._lastHostX === x &&
            this._lastHostY === y
        ) {
            return;
        }

        this._lastHostW = w;
        this._lastHostH = h;
        this._lastHostX = x;
        this._lastHostY = y;

        // BoxPointer has a custom vfunc_allocate() that only allocates its
        // native border and bin. Our no-layout paint child therefore needs an
        // explicit allocation in BoxPointer-local coordinates.
        const materialBox = new Clutter.ActorBox();
        materialBox.x1 = x - OPTICAL_MARGIN;
        materialBox.y1 = y - OPTICAL_MARGIN;
        materialBox.x2 = x + w + OPTICAL_MARGIN;
        materialBox.y2 = y + h + OPTICAL_MARGIN;
        material.allocate(materialBox);
        material.queue_redraw?.();
    }

    _ensureSceneManager() {
        if (this._sceneManager || !this._sceneRoot)
            return this._sceneManager;

        this._sceneManager =
            new this._vendor.WindowCloneManager(
                this._sceneRoot,
                null,
                'velora-popup-scene'
            );
        return this._sceneManager;
    }

    _releaseSceneManager() {
        if (!this._sceneManager)
            return;

        try {
            this._sceneManager.destroy?.();
        } catch {
            // Scene clones may already be tearing down.
        }
        this._sceneManager = null;
    }

    syncFrame() {
        if (
            this._destroyed ||
            !this._menu?.isOpen
        ) {
            return;
        }

        // Allocate first. A no-layout BoxPointer child cannot become mapped
        // until we give it a valid allocation ourselves.
        this._syncHostGeometry();

        if (!this._material?.mapped)
            return;

        this._ensureSceneManager();
        this._syncSceneLayers();
    }

    _syncSceneLayers() {
        const material = this._material;
        const sceneRoot = this._sceneRoot;
        const sceneManager = this._ensureSceneManager();
        if (!material || !sceneRoot || !sceneManager)
            return;

        const [w, h] = material.get_size?.() ?? [0, 0];
        if (!finitePositive(w) || !finitePositive(h))
            return;

        const [absX, absY] =
            material.get_transformed_position?.() ?? [0, 0];
        const [transformedW, transformedH] =
            material.get_transformed_size?.() ?? [w, h];

        const scaleX =
            finitePositive(transformedW) ? transformedW / w : 1;
        const scaleY =
            finitePositive(transformedH) ? transformedH / h : 1;

        const sceneScaleX = 1 / Math.max(scaleX, 0.001);
        const sceneScaleY = 1 / Math.max(scaleY, 0.001);
        const sceneX = -absX / Math.max(scaleX, 0.001);
        const sceneY = -absY / Math.max(scaleY, 0.001);

        if (
            this._lastStageW !== global.stage.width ||
            this._lastStageH !== global.stage.height
        ) {
            sceneRoot.set_size(
                global.stage.width,
                global.stage.height
            );
            this._lastStageW = global.stage.width;
            this._lastStageH = global.stage.height;
        }

        if (
            this._lastSceneScaleX !== sceneScaleX ||
            this._lastSceneScaleY !== sceneScaleY
        ) {
            sceneRoot.set_scale(sceneScaleX, sceneScaleY);
            this._lastSceneScaleX = sceneScaleX;
            this._lastSceneScaleY = sceneScaleY;
        }

        if (
            this._lastSceneX !== sceneX ||
            this._lastSceneY !== sceneY
        ) {
            if (sceneRoot.x !== 0 || sceneRoot.y !== 0)
                sceneRoot.set_position(0, 0);
            this._vendor.setTranslationIfChanged(
                sceneRoot,
                sceneX,
                sceneY
            );
            this._lastSceneX = sceneX;
            this._lastSceneY = sceneY;
        }

        const captureRect = [
            absX,
            absY,
            transformedW,
            transformedH,
        ];
        sceneManager.setCullRect?.(captureRect);
        sceneManager.applyBgCloneClip?.(captureRect);
        sceneManager.sync?.();
    }

    _syncPaintGeometry() {
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
        if (!finitePositive(w) || !finitePositive(h))
            return;

        // Paint-time hook is uniforms-only. Actor/clone mutations happen in
        // PopupGlassManager's stage before-update loop.
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

    detach({restore = true} = {}) {
        if (this._destroyed)
            return;
        this._destroyed = true;

        try {
            this._effect?.setLiveGeometryHook?.(null);
        } catch {
            // Effect may already be tearing down.
        }

        if (this._openStateId && this._menu) {
            try {
                this._menu.disconnect(this._openStateId);
            } catch {
                // Menu may already be tearing down.
            }
        }
        this._openStateId = 0;

        if (this._mappedStateId && this._boxPointer) {
            try {
                this._boxPointer.disconnect(this._mappedStateId);
            } catch {
                // BoxPointer may already be tearing down.
            }
        }
        this._mappedStateId = 0;

        this._releaseSceneManager();

        try {
            this._box?.remove_style_class_name?.(GLASS_CLASS);
            this._boxPointer?.remove_style_class_name?.(SHELL_CLASS);
        } catch {
            // Popup actors may already be destroyed.
        }

        // Native BoxPointer.bin -> menu.box was never changed, so cleanup
        // only removes our paint child. There is no native content to reparent.
        try {
            this._material?.destroy?.();
        } catch {
            // Material may already have been destroyed with BoxPointer.
        }

        this._material = null;
        this._sceneRoot = null;
        this._sceneManager = null;
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
            manager.detach(this, {restore: true});
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
                    try {
                        surface.syncFrame();
                    } catch (error) {
                        console.error(
                            '[Velora][PopupGlass] frame sync failed; restoring native popup: ' +
                            error +
                            '\n' +
                            (error?.stack ?? '')
                        );
                        this.detach(menu, {restore: true});
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

    detach(menu, options = {}) {
        const surface = this._surfaces.get(menu);
        if (!surface)
            return;

        this._surfaces.delete(menu);
        surface.detach(options);
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

        const prototype = PopupMenu.PopupMenu.prototype;
        if (prototype.open === this._patchedOpen)
            prototype.open = this._originalOpen;
        if (prototype.destroy === this._patchedDestroy)
            prototype.destroy = this._originalDestroy;

        for (const [menu, surface] of [...this._surfaces]) {
            this._surfaces.delete(menu);
            surface.detach({restore: true});
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
