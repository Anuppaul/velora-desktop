import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const VENDOR_CACHE_KEY = '__veloraLiquidGlassVendorModulesV1';
const VENDOR_ROOT_KEY = '__veloraLiquidGlassVendorRootV1';
const VENDOR_PROMISE_KEY = '__veloraLiquidGlassVendorPromiseV1';
const DEBUG_STATE_KEY = '__veloraLiquidGlassDebugV1';

function canonicalExtensionRoot() {
    return GLib.build_filenamev([
        GLib.get_user_data_dir(),
        'gnome-shell',
        'extensions',
        'velora@wonderer.tech',
    ]);
}

function canonicalVendorRoot() {
    return GLib.build_filenamev([
        canonicalExtensionRoot(),
        'vendor',
        'liquid-glass',
    ]);
}

function previousRevisionVendorRoot(settings) {
    const revision =
        settings?.get_string?.('runtime-loaded-revision')?.trim?.() ?? '';
    if (!revision || revision === 'base')
        return null;

    const root = GLib.build_filenamev([
        canonicalExtensionRoot(),
        'runtime-revisions',
        revision,
        'vendor',
        'liquid-glass',
    ]);
    const entry = Gio.File.new_for_path(
        GLib.build_filenamev([
            root,
            'dist',
            'liquidEffect.js',
        ])
    );
    return entry.query_exists(null) ? root : null;
}

function moduleUri(root, relativePath) {
    return Gio.File.new_for_path(
        GLib.build_filenamev([
            root,
            ...relativePath.split('/'),
        ])
    ).get_uri();
}

async function importVendorModules(root) {
    const [
        liquidEffect,
        unpickable,
        uiLayerSampler,
        windowClones,
        captureClip,
        writes,
        allocation,
        glassExclusions,
        frameLoops,
        frameSync,
        diagnostics,
    ] = await Promise.all([
        import(moduleUri(root, 'dist/liquidEffect.js')),
        import(moduleUri(root, 'dist/actors/unpickable.js')),
        import(moduleUri(root, 'dist/capture/uiLayerSampler.js')),
        import(moduleUri(root, 'dist/capture/windowClones.js')),
        import(moduleUri(root, 'dist/capture/clip.js')),
        import(moduleUri(root, 'dist/actors/writes.js')),
        import(moduleUri(root, 'dist/actors/allocation.js')),
        import(moduleUri(root, 'dist/capture/glassExclusions.js')),
        import(moduleUri(root, 'dist/animation/frameLoops.js')),
        import(moduleUri(root, 'dist/animation/frameSync.js')),
        import(moduleUri(root, 'dist/diagnostics/logging.js')),
    ]);

    return {
        root,
        LiquidEffect: liquidEffect.LiquidEffect,
        UnpickableActor: unpickable.UnpickableActor,
        UILayerSampler: uiLayerSampler.UILayerSampler,
        WindowCloneManager: windowClones.WindowCloneManager,
        syncGlassCaptureClip: captureClip.syncGlassCaptureClip,
        setClipIfChanged: writes.setClipIfChanged,
        ensureGlassAllocated: allocation.ensureGlassAllocated,
        excludeOtherGlass: glassExclusions.excludeOtherGlass,
        startStageLoop: frameLoops.startStageLoop,
        stopStageLoop: frameLoops.stopStageLoop,
        isFrameSyncFrozen: frameSync.isFrameSyncFrozen,
        SAME_FRAME_WINDOW_US: frameSync.SAME_FRAME_WINDOW_US,
        reportFrameLoopError: diagnostics.reportFrameLoopError,
    };
}

async function loadVendorModules(settings) {
    if (globalThis[VENDOR_CACHE_KEY])
        return globalThis[VENDOR_CACHE_KEY];

    if (globalThis[VENDOR_PROMISE_KEY])
        return globalThis[VENDOR_PROMISE_KEY];

    let root = globalThis[VENDOR_ROOT_KEY] ?? null;

    if (!root) {
        // GObject classes live for the lifetime of the Shell process. If an
        // earlier Velora runtime already registered upstream Liquid Glass
        // types, re-importing the vendored source from a new hashed runtime
        // URI attempts to register the same GTypes again and fails. Reuse the
        // exact previous runtime URI in that case so GJS returns its cached
        // module objects instead of evaluating registerClass() again.
        const liquidType = GObject.type_from_name('LiquidGlassEffect');
        const cloneType = GObject.type_from_name(
            'Gjs_actors_unpickable_UnpickableClone'
        );
        const alreadyRegistered = Boolean(liquidType || cloneType);

        if (alreadyRegistered) {
            root = previousRevisionVendorRoot(settings);
            if (!root) {
                throw new Error(
                    'Liquid Glass GObject types are already registered, ' +
                    'but the previously loaded Velora vendor revision is unavailable'
                );
            }
        } else {
            root = canonicalVendorRoot();
        }

        globalThis[VENDOR_ROOT_KEY] = root;
    }

    const promise = importVendorModules(root)
        .then(modules => {
            globalThis[VENDOR_CACHE_KEY] = modules;
            return modules;
        })
        .catch(error => {
            delete globalThis[VENDOR_PROMISE_KEY];
            if (!globalThis[VENDOR_CACHE_KEY])
                delete globalThis[VENDOR_ROOT_KEY];
            throw error;
        });

    globalThis[VENDOR_PROMISE_KEY] = promise;
    return promise;
}

const SHADER_PADDING = 20;
const CLIP_PADDING = 200;
const SHADOW_MAX_RADIUS = CLIP_PADDING - SHADER_PADDING;
const UPSTREAM_DOCK_BLUR_RADIUS = 2;
const UPSTREAM_DOCK_TINT_STRENGTH = 0.12;
const UPSTREAM_DOCK_SATURATION = 1.5;
const UPSTREAM_DOCK_CORNER_RADIUS = 30;
const VELORA_REFERENCE_OPACITY = 0.76;

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
        this._frameSyncId = 0;
        this._frameSignalId = 0;
        this._lastTickUs = 0;
        this._torndown = false;
        this._lastGeometry = null;
        this._vendor = null;
        this._enablePromise = null;
        this._destroyed = false;
    }

    enable() {
        if (this._bgActor || this._enablePromise || !this._target || !this._layer)
            return this._enablePromise;

        this._destroyed = false;
        this._enablePromise = this._enableAsync()
            .catch(error => {
                if (!this._destroyed) {
                    logError(
                        error,
                        'Velora Desktop: upstream Liquid Glass renderer failed'
                    );
                }
                throw error;
            })
            .finally(() => {
                this._enablePromise = null;
            });

        return this._enablePromise;
    }

    async _enableAsync() {
        this._vendor = await loadVendorModules(this._settings);
        if (this._destroyed || !this._target || !this._layer)
            return;

        this._torndown = false;
        this._installDebugState();
        console.log(
            '[Velora][LiquidGlass] vendor root: ' +
            this._vendor.root
        );

        const {
            LiquidEffect,
            UnpickableActor,
            UILayerSampler,
            WindowCloneManager,
        } = this._vendor;

        this._bgActor = new UnpickableActor();
        // Keep the upstream actor names: its capture/exclusion utilities use
        // these names to identify Liquid Glass compositor surfaces.
        this._bgActor.set_name('liquid-glass-bg-actor');
        this._bgActor.set_size(1, 1);

        this._liquidBox = new UnpickableActor();
        this._liquidBox.set_name('liquid-box');
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

        // Upstream DockManager deliberately keeps the full-monitor FBO actor
        // as a direct uiGroup child. Nesting it inside the dock/layer changes
        // the capture coordinate space and can leave the compositor surface
        // with nothing useful to paint.
        const uiGroup = Main.layoutManager.uiGroup;
        try {
            uiGroup.insert_child_below(
                this._bgActor,
                this._layer
            );
        } catch {
            uiGroup.add_child(this._bgActor);
            uiGroup.set_child_below_sibling?.(
                this._bgActor,
                this._layer
            );
        }

        this._effect = new LiquidEffect({
            extensionPath: this._vendor.root,
            owner: 'dock',
        });
        this._effect.setPadding(SHADER_PADDING);
        this._effect.setShadowMaxRadius(SHADOW_MAX_RADIUS);
        this._effect.setTintColor(1.0, 1.0, 1.0);
        this._effect.setTintStrength(UPSTREAM_DOCK_TINT_STRENGTH);
        this._effect.setCornerRadius(UPSTREAM_DOCK_CORNER_RADIUS);
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
                // Exclude the entire Velora UI layer from the backdrop clone.
                // The target dock lives inside this layer; cloning the layer
                // would feed the dock back into its own glass capture.
                this._layer,
                global.windowGroup,
                global.window_group,
            ],
            this._cloneContainer,
            'dock',
            [this._target]
        );

        this._buildClones();
        this._connectTargetSignals();
        this._monitorSignal = Main.layoutManager.connect(
            'monitors-changed',
            () => this.sync()
        );

        this.syncSettings();
        this.sync();
        this._startFrameSync();
        this._idleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._idleId = 0;
                this.sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _installDebugState() {
        globalThis[DEBUG_STATE_KEY] = {
            status: () => ({
                vendorRoot: this._vendor?.root ?? null,
                destroyed: this._destroyed,
                targetMapped: Boolean(this._target?.mapped),
                targetVisible: Boolean(this._target?.visible),
                targetAllocation: Boolean(
                    this._target?.has_allocation?.()
                ),
                targetGeometry: this._target
                    ? {
                        x: this._target.x,
                        y: this._target.y,
                        width: this._target.width,
                        height: this._target.height,
                        opacity: this._target.opacity,
                    }
                    : null,
                backgroundMapped: Boolean(this._bgActor?.mapped),
                backgroundVisible: Boolean(this._bgActor?.visible),
                backgroundAllocation: Boolean(
                    this._bgActor?.has_allocation?.()
                ),
                liquidBoxMapped: Boolean(this._liquidBox?.mapped),
                liquidBoxAllocation: Boolean(
                    this._liquidBox?.has_allocation?.()
                ),
                liveEffects:
                    globalThis.global?._lgGlass?.count?.() ?? null,
            }),
            dump: () => {
                const status =
                    globalThis[DEBUG_STATE_KEY]?.status?.() ?? null;
                console.log(
                    '[Velora][LiquidGlass][status] ' +
                    JSON.stringify(status)
                );
                const upstream =
                    globalThis.global?._lgGlass?.dump?.() ?? null;
                return {status, upstream};
            },
        };
    }

    _buildClones() {
        if (!this._bgActor)
            return;

        this._vendor?.excludeOtherGlass(
            this._uiSampler,
            this._bgActor
        );
        this._windowCloneManager?.rebuildClones();
        this._uiSampler?.rebindSelf();
        this._uiSampler?.refresh();
    }

    get _frameSlot() {
        return {
            get: () => this._frameSyncId,
            set: id => {
                this._frameSyncId = id;
            },
        };
    }

    get _frameSignalSlot() {
        return {
            get: () => this._frameSignalId,
            set: id => {
                this._frameSignalId = id;
            },
        };
    }

    _startFrameSync() {
        if (this._frameSignalId !== 0)
            return;

        this._buildClones();

        const frameTick = () => {
            if (
                this._torndown ||
                !this._bgActor ||
                !this._target?.mapped
            ) {
                return;
            }

            if (this._vendor?.isFrameSyncFrozen())
                return;

            const nowUs = GLib.get_monotonic_time();
            if (
                nowUs - this._lastTickUs <
                (this._vendor?.SAME_FRAME_WINDOW_US ?? 4000)
            ) {
                return;
            }
            this._lastTickUs = nowUs;

            try {
                this._vendor?.ensureGlassAllocated(this._bgActor);
                this.sync();
            } catch (error) {
                this._vendor?.reportFrameLoopError(
                    'VeloraLiquidGlassDock',
                    error
                );
            }
        };

        this._vendor?.startStageLoop(
            this._frameSignalSlot,
            this._frameSlot,
            frameTick
        );
    }

    _stopFrameSync() {
        this._vendor?.stopStageLoop(
            this._frameSignalSlot,
            this._frameSlot
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
                    () => {
                        if (
                            signal === 'notify::mapped'
                        ) {
                            if (this._target?.mapped)
                                this._startFrameSync();
                            else
                                this._stopFrameSync();
                        }
                        this.sync();
                    }
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
            UPSTREAM_DOCK_CORNER_RADIUS
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

        let monitorIndex = Main.layoutManager.findIndexForActor(
            this._target
        );
        if (monitorIndex < 0)
            monitorIndex = Main.layoutManager.primaryIndex;
        const monitor =
            Main.layoutManager.monitors[monitorIndex] ||
            Main.layoutManager.primaryMonitor;
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

        this._vendor?.setClipIfChanged(
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

        this._vendor?.syncGlassCaptureClip({
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

        let monitorIndex = Main.layoutManager.findIndexForActor(
            this._target
        );
        if (monitorIndex < 0)
            monitorIndex = Main.layoutManager.primaryIndex;
        const monitor =
            Main.layoutManager.monitors[monitorIndex] ||
            Main.layoutManager.primaryMonitor;
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
        this._destroyed = true;
        this._torndown = true;
        this._stopFrameSync();

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
        this._vendor = null;

        const debug = globalThis[DEBUG_STATE_KEY];
        if (debug)
            delete globalThis[DEBUG_STATE_KEY];
    }
}
