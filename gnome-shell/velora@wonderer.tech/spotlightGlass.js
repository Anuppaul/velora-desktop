import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    VELORA_GLASS_ADAPTERS,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

export const SPOTLIGHT_GLASS_ENTRY_CLASS =
    'velora-spotlight-glass-entry';

const PAD = 20;
const SHARED_RADIUS = 128;

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
        this._hostLayer = null;

        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;

        this._appearance = null;
        this._signals = [];
        this._stageId = 0;

        this._lastRegionKey = '';
        this._lastSceneSyncUs = 0;
        this._lastCullKey = '';
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._appearance =
            this._readAppearance?.() ?? null;
    }

    attach(target, hostLayer) {
        if (
            !this._enabled ||
            !target ||
            !hostLayer
        ) {
            return false;
        }

        this._detachTarget();

        this._target = target;
        this._hostLayer = hostLayer;

        try {
            target.add_style_class_name?.(
                SPOTLIGHT_GLASS_ENTRY_CLASS
            );
        } catch {}

        if (!this._root)
            this._createLayer();
        else
            this._placeBelowHost();

        const sync = () =>
            this._syncLoopState();

        for (const [obj, signal] of [
            [target, 'notify::visible'],
            [target, 'notify::mapped'],
            [hostLayer, 'notify::visible'],
            [hostLayer, 'notify::mapped'],
        ]) {
            try {
                this._signals.push({
                    obj,
                    id: obj.connect(
                        signal,
                        sync
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

        this._applyAppearance();
        this._lastRegionKey = '';
        this._lastCullKey = '';
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
            this._hostLayer.mapped &&
            (
                this._target
                    .get_paint_opacity?.() ??
                this._target.opacity ??
                255
            ) > 0
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

    _syncLoopState() {
        if (!this._isActive()) {
            this._stopStageLoop();
            this._root?.hide?.();
            this._lastSceneSyncUs = 0;
            this._lastCullKey = '';
            return;
        }

        this._placeBelowHost();
        this._syncActors();
        this._syncEffectRegion();
        this._syncScene(true);

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

    _region() {
        if (!this._target)
            return null;

        const rect =
            this._vendor
                .getTransformedRect(
                    this._target
                );

        if (!finiteRect(rect))
            return null;

        const [x, y, w, h] = rect;
        const adapter =
            VELORA_GLASS_ADAPTERS
                .spotlight;

        let focused = false;
        try {
            focused =
                Boolean(
                    this._target
                        .clutter_text
                        ?.has_key_focus?.()
                );
        } catch {}

        const response =
            this._target.get_hover?.()
                ? (
                    adapter
                        .hoverResponse ??
                    0.32
                )
                : focused
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

    _syncEffectRegion() {
        if (
            !this._effect ||
            !this._isActive()
        ) {
            return;
        }

        const region = this._region();
        if (!region)
            return;

        const width =
            global.stage.width;
        const height =
            global.stage.height;

        const key = [
            width,
            height,
            Math.round(region.x * 10) /
                10,
            Math.round(region.y * 10) /
                10,
            Math.round(region.w * 10) /
                10,
            Math.round(region.h * 10) /
                10,
            region.response,
        ].join(':');

        if (
            key ===
            this._lastRegionKey
        ) {
            return;
        }

        this._lastRegionKey = key;
        this._effect.setResolution?.(
            width,
            height
        );
        this._effect.setCornerRadius?.(
            SHARED_RADIUS
        );
        this._effect.setGlassRegions?.(
            [region]
        );
    }

    _syncScene(force = false) {
        if (
            !this._sceneManager ||
            !this._isActive()
        ) {
            return;
        }

        const region = this._region();
        if (!region)
            return;

        const adapter =
            VELORA_GLASS_ADAPTERS
                .spotlight;
        const nowUs =
            GLib.get_monotonic_time();

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

        const intervalUs =
            1000000 / sceneFps;
        if (
            !force &&
            this._lastSceneSyncUs > 0 &&
            nowUs -
                this._lastSceneSyncUs <
                intervalUs
        ) {
            return;
        }

        const cullRect = [
            region.x,
            region.y,
            region.w,
            region.h,
        ];
        const cullKey =
            cullRect
                .map(value =>
                    Math.round(value)
                )
                .join(':');

        if (
            force ||
            cullKey !==
                this._lastCullKey
        ) {
            this._lastCullKey =
                cullKey;
            this._sceneManager
                .setCullRect?.(
                    cullRect
                );
            this._sceneManager
                .applyBgCloneClip?.(
                    cullRect
                );
        }

        this._sceneManager.sync?.();
        this._lastSceneSyncUs =
            nowUs;
    }

    _tick() {
        if (!this._isActive()) {
            this._syncLoopState();
            return;
        }

        this._syncActors();
        this._syncEffectRegion();
        this._syncScene(false);
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

        this._lastRegionKey = '';
        this._effect.queue_repaint?.();
    }

    updateAppearance(
        state =
            this._readAppearance?.()
    ) {
        this._applyAppearance(state);
    }

    refresh() {
        this._lastRegionKey = '';
        this._lastCullKey = '';
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
        } catch {}

        this._target = null;
        this._hostLayer = null;
        this._stopStageLoop();
        this._root?.hide?.();
        this._lastRegionKey = '';
        this._lastSceneSyncUs = 0;
        this._lastCullKey = '';
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
