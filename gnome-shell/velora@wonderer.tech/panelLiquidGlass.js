// Panel-sized Velora Liquid Glass; no full-monitor DashManager capture.
// Uses the same bounded material + screen-space WindowCloneManager as ShellCards.
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {applyVeloraGlassRole, VELORA_GLASS_ROLES, VELORA_GLASS_ADAPTERS} from './glassMaterialSystem.js';

const MAX_THICKNESS = 240;
const SCENE_FPS = 24;

export class PanelLiquidGlassSurface {
    constructor({vendor, settings, source, dockContainer, readAppearance, onReady}) {
        Object.assign(this, {_vendor: vendor, _settings: settings, _source: source,
            _dockContainer: dockContainer, _readAppearance: readAppearance,
            _onReady: onReady});
        this._material = null;
        this._sceneRoot = null;
        this._scene = null;
        this._effect = null;
        this._frameId = 0;
        this._ready = false;
        this._destroyed = false;
        this._lastSceneUs = 0;
        this._capture = null;
        this._paintW = NaN;
        this._paintH = NaN;
    }

    attach() {
        const group = Main.layoutManager.uiGroup;
        let root = this._dockContainer;
        while (root && root.get_parent?.() !== group)
            root = root.get_parent?.() ?? null;
        if (!root || !group || this._material || this._destroyed)
            return false;

        try {
            const material = new this._vendor.UnpickableActor({
                name: 'velora-panel-local-liquid', reactive: false,
            });
            this._material = material;
            material.set_no_layout?.(true);
            material.set_clip_to_allocation(true);
            material.set_size(1, 1);
            material.opacity = 0;

            const sceneRoot = new this._vendor.UnpickableActor({
                name: 'velora-panel-local-scene', reactive: false,
            });
            sceneRoot.set_no_layout?.(true);
            material.add_child(sceneRoot);
            this._sceneRoot = sceneRoot;

            const effect = new this._vendor.LiquidEffect({
                extensionPath: this._vendor.root,
                settings: this._settings,
                owner: 'velora-panel-local',
            });
            effect.setPadding?.(0);
            effect.setShadowMaxRadius?.(0);
            effect.setIsDock?.(false);
            effect.setCornerRadius?.(0);
            material.add_effect(effect);
            this._effect = effect;

            this._scene = new this._vendor.WindowCloneManager(
                sceneRoot, null, 'velora-panel-local'
            );
            group.insert_child_below(material, root);
            this.updateAppearance(this._readAppearance?.());
            effect.setLiveGeometryHook?.(() => this._syncPaint());

            this._frameId = global.stage.connect('before-update', () => {
                try {
                    this.sync();
                } catch (error) {
                    console.error('[Velora][PanelGlass] frame failed: ' + error);
                    this.destroy();
                }
            });
            this.sync();
            return true;
        } catch (error) {
            console.error('[Velora][PanelGlass] attach failed: ' + error);
            this.destroy();
            return false;
        }
    }

    updateAppearance(state) {
        if (!this._effect || !state || this._destroyed)
            return;
        const role = VELORA_GLASS_ROLES.dock;
        const adapter = VELORA_GLASS_ADAPTERS.dock;
        let brightness = null, contrast = null, saturation = null;
        try {
            brightness = this._settings.get_double('dock-brightness');
            contrast = this._settings.get_double('dock-contrast');
            saturation = this._settings.get_double('dock-saturation');
        } catch {}
        applyVeloraGlassRole(this._effect, role, {
            tintColor: [(state.r ?? 255) / 255, (state.g ?? 255) / 255, (state.b ?? 255) / 255],
            tintStrength: adapter.inheritGlobalTint
                ? (state.opacity ?? role.tintStrength) : role.tintStrength,
            baseBlur: adapter.inheritGlobalBlur ? (state.blur ?? 7) : 7,
            cornerRadius: 0,
            brightness, contrast, saturation, multiRegion: false,
        });
    }

    _bounds() {
        const source = this._source;
        if (!source || source.get_stage?.() !== global.stage ||
            source.mapped === false || source.visible === false)
            return null;

        const [x, y] = source.get_transformed_position();
        const [w, h] = source.get_transformed_size();
        const lm = Main.layoutManager;
        const ix = lm.findIndexForActor(source);
        const mon = lm.monitors[ix >= 0 ? ix : lm.primaryIndex] ?? lm.primaryMonitor;
        if (!mon || ![x, y, w, h].every(Number.isFinite) || w <= 1 || h <= 1)
            return null;
        // A corrupted native allocation MUST NOT turn into fullscreen glass.
        const maxThickness = Math.min(
            MAX_THICKNESS, (w >= h ? mon.height : mon.width) * 0.35
        );
        if (Math.min(w, h) > maxThickness)
            return null;
        const left = Math.max(x, mon.x);
        const top = Math.max(y, mon.y);
        const right = Math.min(x + w, mon.x + mon.width);
        const bottom = Math.min(y + h, mon.y + mon.height);
        if (right - left <= 1 || bottom - top <= 1)
            return null;
        return [left, top, right - left, bottom - top];
    }

    sync() {
        if (this._destroyed || !this._material)
            return;

        const rect = this._bounds();
        if (!rect) {
            if (this._material.opacity !== 0)
                this._material.opacity = 0;
            this._setReady(false);
            return;
        }

        const [x, y, w, h] = rect;
        const group = Main.layoutManager.uiGroup;
        const [uiX, uiY] = group.get_transformed_position?.() ?? [0, 0];
        this._vendor.setPositionIfChanged(this._material, x - uiX, y - uiY);
        this._vendor.setSizeIfChanged(this._material, w, h);

        // Wallpaper/window clones use stage coordinates, but the MATERIAL
        // and its offscreen output are restricted to w x h.
        this._vendor.setSizeIfChanged(this._sceneRoot, global.stage.width, global.stage.height);
        this._vendor.setTranslationIfChanged(this._sceneRoot, -x, -y);
        this._syncPaint();

        const changed = !this._capture ||
            rect.some((v, i) => v !== this._capture[i]);
        const nowUs = GLib.get_monotonic_time();
        if (changed || !this._lastSceneUs ||
            nowUs - this._lastSceneUs >= 1000000 / SCENE_FPS) {
            if (changed) {
                this._scene?.setCullRect?.(rect);
                this._scene?.applyBgCloneClip?.(rect);
            }
            this._scene?.sync?.();
            this._capture = rect;
            this._lastSceneUs = nowUs;
        }

        const opacity = this._source.get_paint_opacity?.() ??
            this._source.opacity ?? 255;
        if (this._material.opacity !== opacity)
            this._material.opacity = opacity;
        const effect = this._effect;
        this._setReady(Boolean(
            effect?._shadersLoaded &&
            (effect?._diagCompositedPaintCount ?? 0) > 0
        ));
    }

    _syncPaint() {
        const [w, h] = this._material?.get_size?.() ?? [0, 0];
        if (!this._effect || w <= 1 || h <= 1 ||
            (w === this._paintW && h === this._paintH))
            return;
        this._paintW = w;
        this._paintH = h;
        this._effect.setResolution?.(w, h);
        this._effect.setGlassGeometry?.(0, 0, w, h);
    }

    _setReady(ready) {
        if (ready === this._ready)
            return;
        this._ready = ready;
        try { this._onReady?.(ready); } catch {}
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._frameId) {
            try { global.stage.disconnect(this._frameId); } catch {}
        }
        this._frameId = 0;
        this._setReady(false);
        try { this._effect?.setLiveGeometryHook?.(null); } catch {}
        try { this._scene?.destroy?.(); } catch {}
        try { this._material?.destroy?.(); } catch {}
        this._scene = null;
        this._sceneRoot = null;
        this._effect = null;
        this._material = null;
        this._source = null;
        this._dockContainer = null;
        this._onReady = null;
    }
}
