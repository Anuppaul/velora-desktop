import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CARD_CLASS = 'velora-liquid-shell-card';
const TARGET_CLASSES = new Set([
    'modal-dialog',
    'switcher-list',
    'workspace-switcher',
    'screenshot-ui-panel',
    'app-folder-dialog',
    'resize-popup',
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
        this._material = null;
        this._wallpaper = null;
        this._effect = null;
        this._signals = [];
        this._destroyed = false;
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

        const wallpaper = this._vendor.createBackgroundMirror(
            'velora-shell-card-wallpaper'
        );
        wallpaper.set_no_layout?.(true);
        material.add_child(wallpaper);

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
        effect.setPadding?.(0);
        effect.setIsDock?.(false);
        effect.setBlurMethod?.(1);
        material.add_effect(effect);

        try {
            this._parent.insert_child_below(
                material,
                this._target
            );
        } catch {
            try {
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
        this._wallpaper = wallpaper;
        this._effect = effect;
        this._target.add_style_class_name?.(CARD_CLASS);

        const sync = () => this._sync();
        for (const signal of [
            'notify::allocation',
            'notify::x',
            'notify::y',
            'notify::opacity',
            'notify::visible',
            'notify::mapped',
            'style-changed',
        ]) {
            try {
                this._signals.push({
                    obj: this._target,
                    id: this._target.connect(signal, sync),
                });
            } catch {
                // Optional actor signal.
            }
        }

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
        this._material?.queue_redraw?.();
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
            return;
        }

        this._material.set_position(x, y);
        this._material.set_size(w, h);
        this._material.opacity = opacity;
        this._material.show?.();
        this._syncPaint();
    }

    _syncPaint() {
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
        if (w <= 1 || h <= 1)
            return;

        const [absX, absY] =
            material.get_transformed_position?.() ?? [0, 0];
        const [tw, th] =
            material.get_transformed_size?.() ?? [w, h];
        const sx = Math.max(tw / w, .001);
        const sy = Math.max(th / h, .001);

        wallpaper.set_size(global.stage.width, global.stage.height);
        wallpaper.set_scale(1 / sx, 1 / sy);
        wallpaper.set_position(-absX / sx, -absY / sy);

        effect.setResolution?.(w, h);
        effect.setGlassGeometry?.(0, 0, w, h);
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

        try {
            this._material?.destroy?.();
        } catch {}

        this._manager?._surfaceDestroyed(this._target, this);
        this._material = null;
        this._wallpaper = null;
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
    }

    setup() {
        if (this._enabled)
            return;
        this._enabled = true;
        this._appearance = this._readAppearance();
        this._watchTree(Main.uiGroup);
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
        if (!classes.some(name => TARGET_CLASSES.has(name)))
            return;

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
