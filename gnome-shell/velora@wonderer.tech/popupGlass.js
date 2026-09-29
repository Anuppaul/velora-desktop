import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const GLASS_CLASS = 'velora-liquid-popup-content';
const DEFAULT_RADIUS = 18;

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
 * We replace the St.Bin child with an overlay whose top child is the exact
 * original menu.box and whose bottom child is the glass material. Because the
 * overlay lives INSIDE BoxPointer, GNOME itself carries position, scale,
 * translation, opacity, monitor placement and open/close animation.
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

        this._overlay = null;
        this._material = null;
        this._wallpaper = null;
        this._effect = null;
        this._radius = DEFAULT_RADIUS;
        this._destroyed = false;
        this._lastW = 0;
        this._lastH = 0;
        this._lastWallpaperX = NaN;
        this._lastWallpaperY = NaN;
        this._lastWallpaperScaleX = NaN;
        this._lastWallpaperScaleY = NaN;
    }

    attach() {
        if (
            this._destroyed ||
            !this._box ||
            !this._bin ||
            this._overlay
        ) {
            return Boolean(this._overlay);
        }

        // Only touch the canonical GNOME hierarchy. If another extension has
        // already replaced the St.Bin child, fail closed instead of reparenting
        // an unknown tree.
        if (this._bin.get_child?.() !== this._box)
            return false;

        this._radius = readRadius(this._box);

        const overlay = new St.Widget({
            name: 'velora-popup-glass-stack',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            reactive: false,
        });

        const material = new this._vendor.UnpickableActor({
            name: 'velora-popup-glass-material',
            x_expand: true,
            y_expand: true,
            reactive: false,
        });
        material.set_clip_to_allocation(true);

        const wallpaper = this._vendor.createBackgroundMirror(
            'velora-popup-wallpaper'
        );
        // Wallpaper is paint input, never layout input. Its stage-sized source
        // must not change the popup's preferred size.
        wallpaper.set_no_layout?.(true);
        material.add_child(wallpaper);

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
        effect.setPadding?.(0);
        effect.setIsDock?.(false);
        effect.setCornerRadius?.(this._radius);
        effect.setBlurMethod?.(1);
        material.add_effect(effect);

        // St.Bin.set_child() removes the old child without destroying it.
        // Reparent only after that removal; St.Bin explicitly rejects an
        // already-parented replacement child.
        this._bin.set_child(overlay);
        overlay.add_child(material);
        overlay.add_child(this._box);

        this._box.add_style_class_name?.(GLASS_CLASS);

        this._overlay = overlay;
        this._material = material;
        this._wallpaper = wallpaper;
        this._effect = effect;

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

    _syncPaintGeometry() {
        const material = this._material;
        const wallpaper = this._wallpaper;
        const effect = this._effect;
        if (
            this._destroyed ||
            !material ||
            !wallpaper ||
            !effect ||
            !material.mapped
        ) {
            return;
        }

        const [w, h] = material.get_size?.() ?? [0, 0];
        if (!finitePositive(w) || !finitePositive(h))
            return;

        // The material lives inside BoxPointer and therefore inherits GNOME's
        // native popup scale/translation animation. Counter-transform only the
        // wallpaper sample so the scene behind the moving glass stays fixed in
        // stage space instead of zooming with the popup.
        const [absX, absY] =
            material.get_transformed_position?.() ?? [0, 0];
        const [transformedW, transformedH] =
            material.get_transformed_size?.() ?? [w, h];

        const scaleX =
            finitePositive(transformedW) ? transformedW / w : 1;
        const scaleY =
            finitePositive(transformedH) ? transformedH / h : 1;

        const wallpaperScaleX = 1 / Math.max(scaleX, 0.001);
        const wallpaperScaleY = 1 / Math.max(scaleY, 0.001);
        const wallpaperX = -absX / Math.max(scaleX, 0.001);
        const wallpaperY = -absY / Math.max(scaleY, 0.001);

        if (this._lastW !== global.stage.width ||
            this._lastH !== global.stage.height) {
            wallpaper.set_size(global.stage.width, global.stage.height);
            this._lastW = global.stage.width;
            this._lastH = global.stage.height;
        }

        if (
            this._lastWallpaperScaleX !== wallpaperScaleX ||
            this._lastWallpaperScaleY !== wallpaperScaleY
        ) {
            wallpaper.set_scale(wallpaperScaleX, wallpaperScaleY);
            this._lastWallpaperScaleX = wallpaperScaleX;
            this._lastWallpaperScaleY = wallpaperScaleY;
        }

        if (
            this._lastWallpaperX !== wallpaperX ||
            this._lastWallpaperY !== wallpaperY
        ) {
            wallpaper.set_position(wallpaperX, wallpaperY);
            this._lastWallpaperX = wallpaperX;
            this._lastWallpaperY = wallpaperY;
        }

        // The effect's FBO is local to the popup. No stage geometry chasing:
        // one glass region exactly equals the native menu content allocation.
        effect.setResolution?.(w, h);
        effect.setGlassGeometry?.(0, 0, w, h);
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

        try {
            this._box?.remove_style_class_name?.(GLASS_CLASS);
        } catch {
            // Box may already be destroyed.
        }

        // Restore GNOME's canonical hierarchy before destroying our overlay.
        // Destroying overlay while it still owns menu.box would destroy native
        // Shell content with it.
        if (restore && this._bin && this._box) {
            try {
                if (this._box.get_parent?.() === this._overlay)
                    this._overlay.remove_child(this._box);

                if (!this._box.get_parent?.())
                    this._bin.set_child(this._box);
            } catch (error) {
                console.error(
                    '[Velora][PopupGlass] native hierarchy restore failed: ' +
                    error
                );
            }
        }

        try {
            this._overlay?.destroy?.();
        } catch {
            // Popup may already have destroyed the entire subtree.
        }

        this._overlay = null;
        this._material = null;
        this._wallpaper = null;
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
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._appearance = this._readAppearance();

        const prototype = PopupMenu.PopupMenu.prototype;
        this._originalOpen = prototype.open;
        this._originalDestroy = prototype.destroy;
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

        prototype.open = this._patchedOpen;
        prototype.destroy = this._patchedDestroy;

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
