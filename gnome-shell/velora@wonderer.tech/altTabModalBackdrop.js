import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SWITCHER_CLASS = 'switcher-list';
const SWITCHER_ACTIVE_CLASS = 'velora-alt-tab-modal-switcher';
const ROOT_NAME = 'velora-alt-tab-modal-backdrop';
const SCENE_NAME = 'velora-alt-tab-modal-scene';
const DIM_CLASS = 'velora-alt-tab-modal-dim';

const BLUR_RADIUS = 34;
const BLUR_BRIGHTNESS = 0.70;
const SCENE_FPS = 24;

function classesOf(actor) {
    return String(
        actor?.get_style_class_name?.() ??
        actor?.style_class ??
        ''
    ).split(/\s+/).filter(Boolean);
}

function hasSwitcherAncestor(actor) {
    let node = actor?.get_parent?.() ?? null;
    let guard = 48;

    while (node && guard-- > 0) {
        if (classesOf(node).includes(SWITCHER_CLASS))
            return true;
        if (node === Main.uiGroup)
            break;
        node = node.get_parent?.() ?? null;
    }

    return false;
}

export class AltTabModalBackdropManager {
    constructor(params) {
        this._vendor = params.vendor;

        this._enabled = false;
        this._target = null;
        this._targetSignals = [];
        this._watched = new Map();

        this._root = null;
        this._scene = null;
        this._sceneManager = null;
        this._blurEffect = null;
        this._dim = null;

        this._stageId = 0;
        this._lastSceneSyncUs = 0;
        this._active = false;
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._watchTree(Main.uiGroup);

        console.log(
            '[Velora][AltTabModal] full-screen modal backdrop active'
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
            name.startsWith('velora-alt-tab-') ||
            name.startsWith('lg-')
        ) {
            return;
        }

        this._maybeAdopt(actor);

        const entry = {
            childId: 0,
            destroyId: 0,
        };

        try {
            entry.childId = actor.connect(
                'child-added',
                (_parent, child) =>
                    this._watchTree(child)
            );
        } catch {}

        try {
            entry.destroyId = actor.connect(
                'destroy',
                () => {
                    this._watched.delete(actor);
                    if (actor === this._target)
                        this._releaseTarget(false);
                }
            );
        } catch {}

        this._watched.set(actor, entry);

        for (const child of actor.get_children?.() ?? [])
            this._watchTree(child);
    }

    _maybeAdopt(actor) {
        if (
            !actor?.add_style_class_name ||
            !classesOf(actor).includes(
                SWITCHER_CLASS
            ) ||
            hasSwitcherAncestor(actor)
        ) {
            return;
        }

        this._adopt(actor);
    }

    _disconnectTargetSignals() {
        for (const {obj, id} of this._targetSignals) {
            try {
                obj?.disconnect?.(id);
            } catch {}
        }
        this._targetSignals = [];
    }

    _adopt(actor) {
        if (!actor || actor === this._target)
            return;

        this._releaseTarget(true);
        this._target = actor;

        try {
            actor.add_style_class_name(
                SWITCHER_ACTIVE_CLASS
            );
        } catch {}

        const sync = () =>
            this._syncState();

        for (const signal of [
            'notify::visible',
            'notify::mapped',
        ]) {
            try {
                this._targetSignals.push({
                    obj: actor,
                    id: actor.connect(
                        signal,
                        sync
                    ),
                });
            } catch {}
        }

        try {
            this._targetSignals.push({
                obj: actor,
                id: actor.connect(
                    'destroy',
                    () => this._releaseTarget(false)
                ),
            });
        } catch {}

        this._syncState();
    }

    _releaseTarget(removeClass = true) {
        const target = this._target;
        this._disconnectTargetSignals();

        if (removeClass && target) {
            try {
                target.remove_style_class_name?.(
                    SWITCHER_ACTIVE_CLASS
                );
            } catch {}
        }

        this._target = null;
        this._deactivate();
    }

    _createBackdrop() {
        if (this._root)
            return;

        const root =
            new this._vendor.UnpickableActor({
                name: ROOT_NAME,
                reactive: false,
            });
        root.set_no_layout?.(true);
        root.set_position(0, 0);
        root.set_size(
            global.stage.width,
            global.stage.height
        );
        root.hide();

        const scene =
            new this._vendor.UnpickableActor({
                name: SCENE_NAME,
                reactive: false,
            });
        scene.set_no_layout?.(true);
        scene.set_position(0, 0);
        scene.set_size(
            global.stage.width,
            global.stage.height
        );

        const sceneManager =
            new this._vendor.WindowCloneManager(
                scene,
                null,
                'velora-alt-tab-modal-scene'
            );

        const blur =
            new Shell.BlurEffect({
                name:
                    'velora-alt-tab-modal-blur',
            });
        scene.add_effect(blur);

        const dim = new St.Widget({
            style_class: DIM_CLASS,
            reactive: false,
        });
        dim.set_position(0, 0);
        dim.set_size(
            global.stage.width,
            global.stage.height
        );

        root.add_child(scene);
        root.add_child(dim);

        this._root = root;
        this._scene = scene;
        this._sceneManager = sceneManager;
        this._blurEffect = blur;
        this._dim = dim;

        this._updateBlur();
    }

    _updateBlur() {
        if (!this._blurEffect)
            return;

        let scale = 1;
        try {
            scale =
                St.ThemeContext
                    .get_for_stage(
                        global.stage
                    )
                    .scale_factor ?? 1;
        } catch {}

        try {
            this._blurEffect.set({
                brightness:
                    BLUR_BRIGHTNESS,
                radius:
                    BLUR_RADIUS * scale,
            });
        } catch {}
    }

    _topLevelSwitcherRoot() {
        let actor = this._target;
        let guard = 64;

        while (
            actor &&
            guard-- > 0 &&
            actor.get_parent?.() &&
            actor.get_parent() !==
                Main.uiGroup
        ) {
            actor =
                actor.get_parent();
        }

        return (
            actor?.get_parent?.() ===
                Main.uiGroup
        )
            ? actor
            : null;
    }

    _placeBelowSwitcher() {
        if (!this._root)
            return false;

        const switcherRoot =
            this._topLevelSwitcherRoot();

        try {
            if (!this._root.get_parent?.())
                Main.uiGroup.add_child(
                    this._root
                );

            if (
                switcherRoot &&
                switcherRoot.get_parent?.() ===
                    Main.uiGroup &&
                this._root.get_parent?.() ===
                    Main.uiGroup
            ) {
                Main.uiGroup
                    .set_child_below_sibling?.(
                        this._root,
                        switcherRoot
                    );
            }

            return true;
        } catch {
            return false;
        }
    }

    _isTargetVisible() {
        return Boolean(
            this._enabled &&
            this._target &&
            this._target.visible &&
            this._target.mapped &&
            (
                this._target
                    .get_paint_opacity?.() ??
                this._target.opacity ??
                255
            ) > 0
        );
    }

    _syncActors() {
        if (
            !this._root ||
            !this._scene ||
            !this._dim
        ) {
            return;
        }

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
            this._scene,
            width,
            height
        );
        this._vendor.setSizeIfChanged(
            this._dim,
            width,
            height
        );

        this._updateBlur();
    }

    _syncScene(force = false) {
        if (
            !this._active ||
            !this._sceneManager
        ) {
            return;
        }

        const nowUs =
            GLib.get_monotonic_time();
        const intervalUs =
            1000000 / SCENE_FPS;

        if (
            !force &&
            this._lastSceneSyncUs &&
            nowUs -
                this._lastSceneSyncUs <
                intervalUs
        ) {
            return;
        }

        const rect = [
            0,
            0,
            global.stage.width,
            global.stage.height,
        ];

        try {
            this._sceneManager
                .setCullRect?.(rect);
            this._sceneManager
                .applyBgCloneClip?.(rect);
            this._sceneManager.sync?.();
            this._lastSceneSyncUs =
                nowUs;
        } catch {}
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
                () => {
                    if (!this._active)
                        return;
                    this._syncActors();
                    this._syncScene();
                }
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

    _activate() {
        this._createBackdrop();
        if (!this._placeBelowSwitcher())
            return;

        this._active = true;
        this._syncActors();
        this._syncScene(true);

        if (this._root) {
            this._root.remove_all_transitions?.();
            this._root.opacity = 255;
            this._root.show?.();
        }

        this._ensureStageLoop();
    }

    _deactivate() {
        this._active = false;
        this._stopStageLoop();
        this._lastSceneSyncUs = 0;
        this._root?.remove_all_transitions?.();
        this._root?.hide?.();
    }

    _syncState() {
        if (this._isTargetVisible())
            this._activate();
        else
            this._deactivate();
    }

    refresh() {
        if (!this._enabled)
            return;

        this._syncActors();

        if (this._active) {
            this._placeBelowSwitcher();
            this._syncScene(true);
        }
    }

    cleanup() {
        if (!this._enabled)
            return;

        this._enabled = false;
        this._releaseTarget(true);
        this._stopStageLoop();

        for (const [actor, entry] of this._watched) {
            try {
                if (entry.childId)
                    actor.disconnect(
                        entry.childId
                    );
            } catch {}
            try {
                if (entry.destroyId)
                    actor.disconnect(
                        entry.destroyId
                    );
            } catch {}
        }
        this._watched.clear();

        try {
            this._sceneManager?.destroy?.();
        } catch {}

        try {
            this._root?.destroy?.();
        } catch {}

        this._root = null;
        this._scene = null;
        this._sceneManager = null;
        this._blurEffect = null;
        this._dim = null;

        console.log(
            '[Velora][AltTabModal] stopped'
        );
    }
}
