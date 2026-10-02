import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    VELORA_GLASS_ADAPTERS,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

export const SPOTLIGHT_GLASS_ENTRY_CLASS =
    'velora-spotlight-glass-entry';
export const SPOTLIGHT_GLASS_RESULTS_CLASS =
    'velora-spotlight-glass-results';

const PAD = 20;
// Entry height is 68px; 34px keeps the search bar fully pill-shaped while
// giving the taller results panel a premium but controlled corner radius.
const SHARED_RADIUS = 34;
// Covers the shader's 96px edge-lens reach plus blur/filter sampling slack.
// The scene clone cull must be larger than the visible pill or the refraction
// samples the clipped edge and recreates the horizontal streak we removed.
const SCENE_CAPTURE_MARGIN = 160;

function finiteRect(rect) {
    return (
        Array.isArray(rect) &&
        rect.length >= 4 &&
        rect.every(Number.isFinite) &&
        rect[2] > 1 &&
        rect[3] > 1
    );
}

export class SpotlightGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance =
            params.readAppearance;

        this._enabled = false;
        this._target = null;
        this._resultsTarget = null;
        this._hostLayer = null;

        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;

        this._appearance = null;
        this._signals = [];
        this._stageId = 0;

        this._lastRegionData = [];
        this._lastResolutionW = 0;
        this._lastResolutionH = 0;
        this._lastSceneSyncUs = 0;
        this._lastCullX = NaN;
        this._lastCullY = NaN;
        this._lastCullW = NaN;
        this._lastCullH = NaN;
        this._geometryDirty = true;
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._appearance =
            this._readAppearance?.() ?? null;
    }

    attach(target, resultsTarget, hostLayer) {
        if (
            !this._enabled ||
            !target ||
            !hostLayer
        ) {
            return false;
        }

        this._detachTarget();

        this._target = target;
        this._resultsTarget =
            resultsTarget ?? null;
        this._hostLayer = hostLayer;

        try {
            target.add_style_class_name?.(
                SPOTLIGHT_GLASS_ENTRY_CLASS
            );
            this._resultsTarget
                ?.add_style_class_name?.(
                    SPOTLIGHT_GLASS_RESULTS_CLASS
                );
        } catch {}

        if (!this._root)
            this._createLayer();
        else
            this._placeBelowHost();

        const sync = () =>
            this._syncLoopState();
        const markDirty = () => {
            this._geometryDirty = true;
            this._ensureStageLoop();
        };

        for (const [obj, signal, callback] of [
            [target, 'notify::visible', sync],
            [target, 'notify::mapped', sync],
            [target, 'notify::allocation', markDirty],
            [target, 'notify::hover', markDirty],
            [this._resultsTarget, 'notify::visible', sync],
            [this._resultsTarget, 'notify::mapped', sync],
            [this._resultsTarget, 'notify::allocation', markDirty],
            [hostLayer, 'notify::visible', sync],
            [hostLayer, 'notify::mapped', sync],
            [hostLayer, 'notify::opacity', markDirty],
            [global.stage, 'notify::key-focus', markDirty],
        ]) {
            if (!obj)
                continue;

            try {
                this._signals.push({
                    obj,
                    id: obj.connect(
                        signal,
                        callback
                    ),
                });
            } catch {}
        }

        try {
            this._signals.push({
                obj: target,
                id: target.connect(
                    'destroy',
                    () => {
                        this._detachTarget();
                        this._syncLoopState();
                    }
                ),
            });
        } catch {}

        try {
            if (this._resultsTarget) {
                this._signals.push({
                    obj: this._resultsTarget,
                    id: this._resultsTarget.connect(
                        'destroy',
                        () => {
                            this._resultsTarget = null;
                            this._lastRegionData = [];
                            this._geometryDirty = true;
                        }
                    ),
                });
            }
        } catch {}

        this._applyAppearance();
        this._lastRegionData = [];
        this._geometryDirty = true;
        this._syncLoopState();

        return true;
    }

    _createLayer() {
        const root =
            new this._vendor.UnpickableActor({
                name:
                    'velora-spotlight-glass-root',
                reactive: false,
            });
        root.set_no_layout?.(true);
        root.set_position(0, 0);
        root.set_size(
            global.stage.width,
            global.stage.height
        );
        root.hide();

        const liquidBox =
            new this._vendor.UnpickableActor({
                name:
                    'velora-spotlight-glass-box',
                reactive: false,
            });
        liquidBox.set_no_layout?.(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(
            global.stage.width,
            global.stage.height
        );
        liquidBox.set_clip_to_allocation(
            true
        );
        root.add_child(liquidBox);

        const sceneRoot =
            new this._vendor.UnpickableActor({
                name:
                    'velora-spotlight-glass-scene',
                reactive: false,
            });
        sceneRoot.set_no_layout?.(true);
        sceneRoot.set_position(0, 0);
        sceneRoot.set_size(
            global.stage.width,
            global.stage.height
        );
        liquidBox.add_child(sceneRoot);

        const sceneManager =
            new this._vendor.WindowCloneManager(
                sceneRoot,
                null,
                'velora-spotlight-glass-scene'
            );

        const breaker =
            new this._vendor.UnpickableActor({
                name:
                    'velora-spotlight-glass-breaker',
                reactive: false,
            });
        breaker.set_no_layout?.(true);
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect =
            new this._vendor.LiquidEffect({
                extensionPath:
                    this._vendor.root,
                settings: this._settings,
                owner:
                    'velora-spotlight-search',
            });

        effect.setPadding?.(PAD);
        effect.setIsDock?.(false);
        effect.setMultiRegionMode?.(
            true
        );
        effect.setShadowMaxRadius?.(0);
        effect.setLiveGeometryHook?.(
            () =>
                this._syncEffectRegion()
        );

        liquidBox.add_effect(effect);

        this._root = root;
        this._liquidBox = liquidBox;
        this._sceneRoot = sceneRoot;
        this._sceneManager = sceneManager;
        this._effect = effect;

        this._placeBelowHost();
        this._applyAppearance();
    }

    _placeBelowHost() {
        if (
            !this._root ||
            !this._hostLayer
        ) {
            return;
        }

        try {
            if (!this._root.get_parent?.()) {
                Main.uiGroup.insert_child_below(
                    this._root,
                    this._hostLayer
                );
            } else if (
                this._root.get_parent?.() ===
                    Main.uiGroup &&
                this._hostLayer.get_parent?.() ===
                    Main.uiGroup
            ) {
                Main.uiGroup
                    .set_child_below_sibling?.(
                        this._root,
                        this._hostLayer
                    );
            }
        } catch {
            try {
                if (!this._root.get_parent?.())
                    Main.uiGroup.add_child(
                        this._root
                    );
            } catch {}
        }
    }

    _isActive() {
        return Boolean(
            this._enabled &&
            this._target &&
            this._hostLayer &&
            this._target.visible &&
            this._target.mapped &&
            this._hostLayer.visible &&
            this._hostLayer.mapped
        );
    }

    _ensureStageLoop() {
        if (
            this._stageId ||
            !this._enabled
        ) {
            return;
        }

        this._stageId =
            global.stage.connect(
                'before-update',
                () => this._tick()
            );
    }

    _stopStageLoop() {
        if (!this._stageId)
            return;

        try {
            global.stage.disconnect(
                this._stageId
            );
        } catch {}
        this._stageId = 0;
    }

    _sceneIntervalUs() {
        const adapter =
            VELORA_GLASS_ADAPTERS
                .spotlight;
        const sceneFps = Math.max(
            15,
            Math.min(
                adapter.sceneFpsCap ??
                    24,
                this._appearance
                    ?.sceneFps ??
                    30
            )
        );

        return 1000000 / sceneFps;
    }

    _syncLoopState() {
        if (!this._isActive()) {
            this._stopStageLoop();
            this._root?.hide?.();
            this._lastSceneSyncUs = 0;
            this._lastCullX = NaN;
        this._lastCullY = NaN;
        this._lastCullW = NaN;
        this._lastCullH = NaN;
            return;
        }

        this._placeBelowHost();
        this._syncActors();

        const regions = this._regions();
        this._syncEffectRegion(regions);
        this._syncSceneCull(regions);
        this._geometryDirty = false;
        this._syncSceneOnly(true);

        if (!this._root?.visible)
            this._root?.show?.();

        this._ensureStageLoop();
    }

    _syncActors() {
        const width =
            global.stage.width;
        const height =
            global.stage.height;

        this._vendor.setSizeIfChanged(
            this._root,
            width,
            height
        );
        this._vendor.setSizeIfChanged(
            this._liquidBox,
            width,
            height
        );
        this._vendor.setSizeIfChanged(
            this._sceneRoot,
            width,
            height
        );

        const opacity =
            this._hostLayer?.opacity ??
            255;
        if (
            this._root &&
            this._root.opacity !== opacity
        ) {
            this._root.opacity =
                opacity;
        }
    }

    _regionFor(target, interactive = false) {
        if (
            !target ||
            !target.visible ||
            !target.mapped ||
            (target.get_paint_opacity?.() ??
                target.opacity ??
                255) <= 0
        ) {
            return null;
        }

        const rect =
            this._vendor
                .getTransformedRect(
                    target
                );

        if (!finiteRect(rect))
            return null;

        const [x, y, w, h] = rect;
        const adapter =
            VELORA_GLASS_ADAPTERS
                .spotlight;

        let focused = false;
        if (interactive) {
            try {
                const keyFocus =
                    global.stage.get_key_focus?.() ??
                    null;
                focused =
                    keyFocus === target ||
                    Boolean(
                        keyFocus &&
                        target.contains?.(
                            keyFocus
                        )
                    );
            } catch {}
        }

        const response =
            interactive &&
            target.get_hover?.()
                ? (
                    adapter
                        .hoverResponse ??
                    0.32
                )
                : interactive &&
                    focused
                    ? (
                        adapter
                            .focusResponse ??
                        0.16
                    )
                    : 0.0;

        return {
            x: x - PAD,
            y: y - PAD,
            w: w + PAD * 2,
            h: h + PAD * 2,
            tintR: 1.0,
            tintG: 1.0,
            tintB: 1.0,
            baseStrength: 0.0,
            response,
        };
    }

    _regions() {
        const regions = [];

        const entryRegion =
            this._regionFor(
                this._target,
                true
            );
        if (entryRegion)
            regions.push(entryRegion);

        const resultsRegion =
            this._regionFor(
                this._resultsTarget,
                false
            );
        if (resultsRegion)
            regions.push(resultsRegion);

        return regions;
    }

    _syncEffectRegion(regions = null) {
        if (
            !this._effect ||
            !this._isActive()
        ) {
            return;
        }

        const resolvedRegions =
            regions ?? this._regions();
        if (!resolvedRegions.length)
            return;

        const width =
            global.stage.width;
        const height =
            global.stage.height;

        let changed =
            this._lastResolutionW !== width ||
            this._lastResolutionH !== height ||
            this._lastRegionData.length !==
                resolvedRegions.length * 5;

        if (!changed) {
            let index = 0;
            for (const region of resolvedRegions) {
                const values = [
                    Math.round(region.x * 10) / 10,
                    Math.round(region.y * 10) / 10,
                    Math.round(region.w * 10) / 10,
                    Math.round(region.h * 10) / 10,
                    region.response,
                ];

                for (const value of values) {
                    if (
                        this._lastRegionData[index++] !==
                        value
                    ) {
                        changed = true;
                        break;
                    }
                }

                if (changed)
                    break;
            }
        }

        if (!changed)
            return;

        const nextData =
            new Array(
                resolvedRegions.length * 5
            );
        let index = 0;
        for (const region of resolvedRegions) {
            nextData[index++] =
                Math.round(region.x * 10) / 10;
            nextData[index++] =
                Math.round(region.y * 10) / 10;
            nextData[index++] =
                Math.round(region.w * 10) / 10;
            nextData[index++] =
                Math.round(region.h * 10) / 10;
            nextData[index++] =
                region.response;
        }

        this._lastResolutionW = width;
        this._lastResolutionH = height;
        this._lastRegionData = nextData;

        this._effect.setResolution?.(
            width,
            height
        );
        this._effect.setCornerRadius?.(
            SHARED_RADIUS
        );
        this._effect.setGlassRegions?.(
            resolvedRegions
        );
    }

    _syncSceneCull(regions) {
        if (
            !this._sceneManager ||
            !regions?.length
        ) {
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const region of regions) {
            minX = Math.min(minX, region.x);
            minY = Math.min(minY, region.y);
            maxX = Math.max(
                maxX,
                region.x + region.w
            );
            maxY = Math.max(
                maxY,
                region.y + region.h
            );
        }

        const left = Math.max(
            0,
            minX - SCENE_CAPTURE_MARGIN
        );
        const top = Math.max(
            0,
            minY - SCENE_CAPTURE_MARGIN
        );
        const right = Math.min(
            global.stage.width,
            maxX + SCENE_CAPTURE_MARGIN
        );
        const bottom = Math.min(
            global.stage.height,
            maxY + SCENE_CAPTURE_MARGIN
        );

        const width =
            Math.max(1, right - left);
        const height =
            Math.max(1, bottom - top);

        const x = Math.round(left);
        const y = Math.round(top);
        const w = Math.round(width);
        const h = Math.round(height);

        if (
            this._lastCullX === x &&
            this._lastCullY === y &&
            this._lastCullW === w &&
            this._lastCullH === h
        ) {
            return;
        }

        this._lastCullX = x;
        this._lastCullY = y;
        this._lastCullW = w;
        this._lastCullH = h;

        const cullRect = [x, y, w, h];
        this._sceneManager.setCullRect?.(
            cullRect
        );
        this._sceneManager
            .applyBgCloneClip?.(
                cullRect
            );
    }

    _syncSceneOnly(force = false, nowUs = null) {
        if (
            !this._sceneManager ||
            !this._isActive()
        ) {
            return;
        }

        const now =
            nowUs ??
            GLib.get_monotonic_time();
        const intervalUs =
            this._sceneIntervalUs();

        if (
            !force &&
            this._lastSceneSyncUs > 0 &&
            now - this._lastSceneSyncUs <
                intervalUs
        ) {
            return;
        }

        this._sceneManager.sync?.();
        this._lastSceneSyncUs = now;
    }

    _tick() {
        if (!this._isActive()) {
            this._syncLoopState();
            return;
        }

        const nowUs =
            GLib.get_monotonic_time();
        const sceneDue =
            this._lastSceneSyncUs === 0 ||
            nowUs - this._lastSceneSyncUs >=
                this._sceneIntervalUs();

        // Ordinary compositor frames do no transformed-geometry work.
        if (
            !this._geometryDirty &&
            !sceneDue
        ) {
            return;
        }

        if (this._geometryDirty) {
            this._syncActors();
            const regions =
                this._regions();
            this._syncEffectRegion(
                regions
            );
            this._syncSceneCull(
                regions
            );
            this._geometryDirty = false;
        }

        if (sceneDue)
            this._syncSceneOnly(
                false,
                nowUs
            );
    }

    _applyAppearance(
        state =
            this._appearance ??
            this._readAppearance?.()
    ) {
        if (
            !this._effect ||
            !state
        ) {
            return;
        }

        this._appearance = state;

        const role =
            VELORA_GLASS_ROLES
                .innerCard;

        let brightness = null;
        let contrast = null;
        let saturation = null;

        try {
            brightness =
                this._settings.get_double(
                    'menu-brightness'
                );
            contrast =
                this._settings.get_double(
                    'menu-contrast'
                );
            saturation =
                this._settings.get_double(
                    'menu-saturation'
                );
        } catch {}

        applyVeloraGlassRole(
            this._effect,
            role,
            {
                tintColor: [
                    (state.r ?? 255) /
                        255,
                    (state.g ?? 255) /
                        255,
                    (state.b ?? 255) /
                        255,
                ],
                tintStrength:
                    state.opacity ??
                    role.tintStrength,
                baseBlur:
                    state.blur ?? 7,
                cornerRadius:
                    SHARED_RADIUS,
                brightness,
                contrast,
                saturation,
                multiRegion: true,
            }
        );

        this._lastRegionData = [];
        this._geometryDirty = true;
        this._effect.queue_repaint?.();
    }

    updateAppearance(
        state =
            this._readAppearance?.()
    ) {
        this._applyAppearance(state);
    }

    refresh() {
        this._lastRegionData = [];
        this._geometryDirty = true;
        this._lastCullX = NaN;
        this._lastCullY = NaN;
        this._lastCullW = NaN;
        this._lastCullH = NaN;
        this._syncLoopState();
    }

    _detachTarget() {
        for (const {obj, id} of
            this._signals) {
            try {
                obj?.disconnect?.(id);
            } catch {}
        }
        this._signals = [];

        try {
            this._target
                ?.remove_style_class_name?.(
                    SPOTLIGHT_GLASS_ENTRY_CLASS
                );
            this._resultsTarget
                ?.remove_style_class_name?.(
                    SPOTLIGHT_GLASS_RESULTS_CLASS
                );
        } catch {}

        this._target = null;
        this._resultsTarget = null;
        this._hostLayer = null;
        this._stopStageLoop();
        this._root?.hide?.();
        this._lastRegionData = [];
        this._geometryDirty = true;
        this._lastSceneSyncUs = 0;
        this._lastCullX = NaN;
        this._lastCullY = NaN;
        this._lastCullW = NaN;
        this._lastCullH = NaN;
    }

    cleanup() {
        if (!this._enabled)
            return;

        this._enabled = false;
        this._detachTarget();

        try {
            this._effect
                ?.setLiveGeometryHook?.(
                    null
                );
        } catch {}

        try {
            this._sceneManager
                ?.destroy?.();
        } catch {}

        try {
            this._root?.destroy?.();
        } catch {}

        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;
        this._appearance = null;
        this._vendor = null;
        this._settings = null;
        this._readAppearance = null;
    }
}
