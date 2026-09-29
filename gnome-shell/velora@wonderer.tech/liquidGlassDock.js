import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {LiquidEffect} from './vendor/liquid-glass/dist/liquidEffect.js';
import {UnpickableActor} from './vendor/liquid-glass/dist/actors/unpickable.js';
import {UILayerSampler} from './vendor/liquid-glass/dist/capture/uiLayerSampler.js';
import {WindowCloneManager} from './vendor/liquid-glass/dist/capture/windowClones.js';
import {syncGlassCaptureClip} from './vendor/liquid-glass/dist/capture/clip.js';
import {setClipIfChanged} from './vendor/liquid-glass/dist/actors/writes.js';

const SHADER_PADDING = 20;
const CLIP_PADDING = 200;
const SHADOW_MAX_RADIUS = CLIP_PADDING - SHADER_PADDING;
const UPSTREAM_DOCK_BLUR_RADIUS = 2;
const UPSTREAM_DOCK_TINT_STRENGTH = 0.12;
const UPSTREAM_DOCK_SATURATION = 1.5;
const VELORA_REFERENCE_CORNER_RADIUS = 16;
const VELORA_REFERENCE_OPACITY = 0.76;

function moduleDirectory() {
    const file = Gio.File.new_for_uri(import.meta.url);
    return file.get_parent()?.get_path() ?? null;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class LiquidGlassDockRenderer {
    constructor(params) {
        this._settings = params.settings;
        this._layer = params.layer;
        this._target = params.target;

        this._bgActor = null;
        this._liquidBox = null;
        this._cloneContainer = null;
        this._effect = null;
        this._uiSampler = null;
        this._windowCloneManager = null;
        this._targetSignals = [];
        this._monitorSignal = 0;
        this._idleId = 0;
        this._lastGeometry = null;

        const baseDir = moduleDirectory();
        this._extensionPath = baseDir
            ? GLib.build_filenamev([
                baseDir,
                'vendor',
                'liquid-glass',
            ])
            : null;
    }

    enable() {
        if (this._bgActor || !this._target || !this._layer)
            return;

        if (!this._extensionPath) {
            log('Velora Desktop: unable to resolve vendored Liquid Glass path');
            return;
        }

        this._bgActor = new UnpickableActor();
        this._bgActor.set_name('velora-liquid-glass-bg-actor');
        this._bgActor.set_size(1, 1);

        this._liquidBox = new UnpickableActor();
        this._liquidBox.set_name('velora-liquid-glass-box');
        this._liquidBox.set_clip_to_allocation(true);
        this._bgActor.add_child(this._liquidBox);

        const dummyBreaker = new UnpickableActor();
        dummyBreaker.set_name('velora-liquid-glass-optimization-breaker');
        dummyBreaker.set_size(1, 1);
        dummyBreaker.set_opacity(0);
        this._liquidBox.add_child(dummyBreaker);

        this._cloneContainer = new UnpickableActor();
        this._cloneContainer.set_name('velora-liquid-glass-clone-container');
        this._liquidBox.add_child(this._cloneContainer);

        try {
            this._layer.insert_child_below(
                this._bgActor,
                this._target
            );
        } catch {
            this._layer.add_child(this._bgActor);
            this._layer.set_child_below_sibling?.(
                this._bgActor,
                this._target
            );
        }

        this._effect = new LiquidEffect({
            extensionPath: this._extensionPath,
            owner: 'dock',
        });
        this._effect.setPadding(SHADER_PADDING);
        this._effect.setShadowMaxRadius(SHADOW_MAX_RADIUS);
        this._effect.setTintColor(1.0, 1.0, 1.0);
        this._effect.setTintStrength(UPSTREAM_DOCK_TINT_STRENGTH);
        this._effect.setCornerRadius(VELORA_REFERENCE_CORNER_RADIUS);
        this._effect.setBrightness(1.0);
        this._effect.setContrast(1.0);
        this._effect.setSaturation(UPSTREAM_DOCK_SATURATION);
        this._effect.setBlurMethod(1);
        this._effect.setBlurRadius(UPSTREAM_DOCK_BLUR_RADIUS);
        this._effect.setIsDock(true);
        this._effect.setLiveGeometryHook(
            () => this._syncLiveGeometry()
        );
        this._liquidBox.add_effect(this._effect);

        this._windowCloneManager = new WindowCloneManager(
            this._liquidBox,
            this._cloneContainer,
            'velora-dock'
        );

        this._uiSampler = new UILayerSampler(
            this._bgActor,
            this._liquidBox,
            [
                this._target,
                global.windowGroup,
                global.window_group,
            ],
            this._cloneContainer,
            'dock',
            [this._target]
        );

        this._connectTargetSignals();
        this._monitorSignal = Main.layoutManager.connect(
            'monitors-changed',
            () => this.sync()
        );

        this.syncSettings();
        this.sync();
        this._idleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._idleId = 0;
                this.sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _connectTargetSignals() {
        if (!this._target)
            return;

        for (const signal of [
            'notify::x',
            'notify::y',
            'notify::width',
            'notify::height',
            'notify::opacity',
            'notify::visible',
            'notify::mapped',
        ]) {
            try {
                const id = this._target.connect(
                    signal,
                    () => this.sync()
                );
                this._targetSignals.push(id);
            } catch {
                // Some Clutter builds may not expose every notify signal.
            }
        }
    }

    syncSettings() {
        if (!this._effect || !this._settings)
            return;

        const blurEnabled = this._settings.get_boolean(
            'floating-dock-blur'
        );
        const opacity = clamp(
            this._settings.get_int('floating-dock-opacity') / 100,
            0,
            1
        );
        const tintStrength = clamp(
            UPSTREAM_DOCK_TINT_STRENGTH *
                (opacity / VELORA_REFERENCE_OPACITY),
            0,
            0.30
        );

        this._effect.setBlurRadius(
            blurEnabled ? UPSTREAM_DOCK_BLUR_RADIUS : 0
        );
        this._effect.setTintStrength(tintStrength);
        this._effect.setCornerRadius(
            VELORA_REFERENCE_CORNER_RADIUS
        );
        this._effect.setSaturation(UPSTREAM_DOCK_SATURATION);
        this._effect.setBrightness(1.0);
        this._effect.setContrast(1.0);
        this._effect.setTintColor(1.0, 1.0, 1.0);
        this._effect.setIsDock(true);
        this.sync();
    }

    sync() {
        if (
            !this._bgActor ||
            !this._liquidBox ||
            !this._effect ||
            !this._target
        ) {
            return;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            this._bgActor.hide();
            return;
        }

        if (!this._target.visible || !this._target.mapped) {
            this._bgActor.hide();
            return;
        }

        const [absX, absY] = this._target.get_transformed_position();
        const [targetW, targetH] = this._target.get_size();
        if (
            !Number.isFinite(absX) ||
            !Number.isFinite(absY) ||
            !Number.isFinite(targetW) ||
            !Number.isFinite(targetH) ||
            targetW <= 1 ||
            targetH <= 1
        ) {
            this._bgActor.hide();
            return;
        }

        const bgW = targetW + SHADER_PADDING * 2;
        const bgH = targetH + SHADER_PADDING * 2;
        const bgX = absX - SHADER_PADDING;
        const bgY = absY - SHADER_PADDING;
        const localBgX = bgX - monitor.x;
        const localBgY = bgY - monitor.y;

        this._bgActor.remove_transition('size');
        this._bgActor.remove_transition('position');
        this._bgActor.set_position(monitor.x, monitor.y);
        this._bgActor.set_size(monitor.width, monitor.height);
        this._bgActor.opacity = this._target.opacity;
        this._bgActor.show();

        this._liquidBox.set_position(0, 0);
        this._liquidBox.set_size(
            monitor.width,
            monitor.height
        );

        setClipIfChanged(
            this._bgActor,
            localBgX - CLIP_PADDING,
            localBgY - CLIP_PADDING,
            bgW + CLIP_PADDING * 2,
            bgH + CLIP_PADDING * 2
        );

        this._effect.setShadowMaxRadius(SHADOW_MAX_RADIUS);
        this._effect.setResolution(
            monitor.width,
            monitor.height
        );
        this._effect.setGlassGeometry(
            localBgX,
            localBgY,
            bgW,
            bgH
        );

        this._lastGeometry = {
            targetW,
            targetH,
        };

        this._windowCloneManager?.setOffset(
            -monitor.x,
            -monitor.y
        );

        syncGlassCaptureClip({
            cloneContainer: this._cloneContainer,
            effect: this._effect,
            originX: monitor.x,
            originY: monitor.y,
            uiSampler: this._uiSampler,
            windowCloneManager: this._windowCloneManager,
        });

        this._uiSampler?.refresh();
        this._uiSampler?.sync(
            monitor.x,
            monitor.y,
            monitor.width,
            monitor.height
        );
        this._windowCloneManager?.sync();
    }

    _syncLiveGeometry() {
        if (!this._effect || !this._target || !this._lastGeometry)
            return;

        if (!this._target.mapped)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const [absX, absY] = this._target.get_transformed_position();
        if (!Number.isFinite(absX) || !Number.isFinite(absY))
            return;

        const bgW = this._lastGeometry.targetW + SHADER_PADDING * 2;
        const bgH = this._lastGeometry.targetH + SHADER_PADDING * 2;
        const localBgX = absX - SHADER_PADDING - monitor.x;
        const localBgY = absY - SHADER_PADDING - monitor.y;

        this._effect.setGlassGeometry(
            localBgX,
            localBgY,
            bgW,
            bgH
        );
    }

    destroy() {
        if (this._idleId) {
            GLib.source_remove(this._idleId);
            this._idleId = 0;
        }

        if (this._target) {
            for (const id of this._targetSignals) {
                try {
                    this._target.disconnect(id);
                } catch {
                    // Target may already be destroyed during shell teardown.
                }
            }
        }
        this._targetSignals = [];

        if (this._monitorSignal) {
            try {
                Main.layoutManager.disconnect(this._monitorSignal);
            } catch {
                // Layout manager may already be tearing down.
            }
            this._monitorSignal = 0;
        }

        try {
            this._effect?.cleanup();
        } catch (error) {
            logError(error, 'Velora Desktop: Liquid Glass cleanup failed');
        }
        this._effect = null;

        try {
            this._uiSampler?.destroy();
        } catch (error) {
            logError(error, 'Velora Desktop: Liquid Glass UI sampler cleanup failed');
        }
        this._uiSampler = null;

        try {
            this._windowCloneManager?.destroy();
        } catch (error) {
            logError(error, 'Velora Desktop: Liquid Glass window clone cleanup failed');
        }
        this._windowCloneManager = null;

        this._bgActor?.destroy();
        this._bgActor = null;
        this._liquidBox = null;
        this._cloneContainer = null;
        this._target = null;
        this._layer = null;
        this._settings = null;
        this._lastGeometry = null;
    }
}
