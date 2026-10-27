import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    ATMOSPHERE_KEYS,
    readAtmosphereProfile,
} from './wallpaperAtmosphereConfig.js';
import {getAtmosphereEffectClass} from './wallpaperAtmosphereEffect.js';

const EFFECT_NAME = 'velora-atmosphere-wallpaper';
const VENDOR_MIRROR_NAME = 'lg-bg-mirror-source';

/**
 * One Atmosphere treatment on each physical wallpaper paint source:
 *
 * (1) original GNOME desktop Meta.BackgroundActors;
 * (2) Meta.BackgroundActors in Liquid Glass's SHARED wallpaper mirror;
 * (3) the independent wallpaper actors of Velora's native App Grid blur.
 *
 * The three sources share the original Meta.Background image and stay
 * independent as actors; each has at most ONE Atmosphere shader. We never
 * grade a whole uiGroup, OverviewGroup, popup, window or glass output, so
 * Browser pages, native app icons and glass reflections are not recolored.
 */
export class WallpaperAtmosphereManager {
    constructor(settings) {
        this._settings = settings;
        this._enabled = false;
        this._containers = new Map();
        this._actors = new Map();
        this._profile = readAtmosphereProfile(settings);
        this._settingsId = 0;
        this._uiGroup = null;
        this._uiAddedId = 0;
        this._uiRemovedId = 0;
        this._pendingUpdateId = 0;
        this._warnings = new Set();
    }

    setup() {
        if (this._enabled)
            return;
        this._enabled = true;

        // Hook original GNOME wallpaper before the other Velora glass
        // managers start. No wallpaper image is loaded or copied here.
        this.watchContainer(Main.layoutManager?._backgroundGroup);

        this._uiGroup = Main.layoutManager?.uiGroup ?? null;
        if (this._uiGroup) {
            // The shared mirror is created lazily by the vendored glass
            // pipeline. Hook its source once, not every window clone.
            this._uiAddedId = this._uiGroup.connect(
                'child-added', (_group, child) => {
                    if (child?.get_name?.() === VENDOR_MIRROR_NAME)
                        this.watchContainer(child);
                }
            );
            this._uiRemovedId = this._uiGroup.connect(
                'child-removed', (_group, child) => {
                    if (this._containers.has(child) &&
                        child?.get_name?.() === VENDOR_MIRROR_NAME)
                        this.unwatchContainer(child);
                }
            );
            for (const actor of this._uiGroup.get_children?.() ?? []) {
                if (actor?.get_name?.() === VENDOR_MIRROR_NAME)
                    this.watchContainer(actor);
            }
        }

        const onChange = (_settings, key) => {
            if (key !== 'wallpaper-style' &&
                !ATMOSPHERE_KEYS.includes(key))
                return;
            this._scheduleApply();
        };
        this._settingsId = this._settings?.connect?.(
            'changed', onChange
        ) ?? 0;
        this._applyNow();
    }

    _warnOnce(phase, error) {
        if (this._warnings.has(phase))
            return;
        this._warnings.add(phase);
        console.warn(
            '[Velora][Atmosphere] ' + phase + ': ' + error
        );
    }

    _isWallpaperActor(actor) {
        if (!actor)
            return false;
        try {
            // Filter only real GNOME/Mutter wallpaper surfaces, never UI
            // widgets that may happen to be children of a known container.
            if (!(actor instanceof Meta.BackgroundActor))
                return false;
            const content = actor.content ?? actor.get_content?.();
            return Boolean(content instanceof Meta.BackgroundContent);
        } catch {
            return false;
        }
    }

    _track(actor) {
        if (!this._isWallpaperActor(actor) ||
            this._actors.has(actor))
            return;

        const content = actor.content ?? actor.get_content?.();
        const record = {
            effect: null,
            destroyId: 0,
            backgroundId: 0,
            content,
        };
        this._actors.set(actor, record);

        try {
            record.destroyId = actor.connect(
                'destroy', () => this._untrack(actor)
            );
        } catch {}

        try {
            // Meta.BackgroundActor can be added BEFORE it receives a
            // background; do NOT trigger its offscreen paint at that
            // moment. Mutter 50 can crash while drawing a null BG.
            record.backgroundId = content.connect(
                'notify::background',
                () => this._syncActor(actor)
            );
        } catch {}

        this._syncActor(actor);
    }

    _hasLoadedBackground(record) {
        try {
            return Boolean(record?.content?.background);
        } catch {
            return false;
        }
    }

    _syncActor(actor) {
        const record = this._actors.get(actor);
        if (!record)
            return;

        const active = this._enabled &&
            this._profile.active &&
            this._hasLoadedBackground(record);

        if (!active) {
            this._detachActor(actor, record);
            return;
        }

        try {
            if (!record.effect) {
                // Construct only after user opts into a non-Original preset
                // AND GNOME has provided a non-null Meta.Background.
                const Effect = getAtmosphereEffectClass();
                const effect = new Effect();
                effect.configure(this._profile.values);
                actor.add_effect_with_name(EFFECT_NAME, effect);
                record.effect = effect;
            } else {
                record.effect.configure(this._profile.values);
            }
        } catch (error) {
            this._warnOnce('wallpaper shader disabled for one actor', error);
            this._detachActor(actor, record);
        }
    }

    _detachActor(actor, record) {
        const effect = record?.effect ?? null;
        if (!effect)
            return;
        record.effect = null;
        try {
            actor.remove_effect?.(effect);
        } catch {}
        // The compositor owns the effect lifetime after removal. Do not
        // destroy GNOME's source actor, background content or wallpaper.
    }

    _untrack(actor) {
        const record = this._actors.get(actor);
        if (!record)
            return;
        this._actors.delete(actor);
        this._detachActor(actor, record);
        if (record.destroyId) {
            try {
                actor.disconnect(record.destroyId);
            } catch {}
        }
        if (record.backgroundId && record.content) {
            try {
                record.content.disconnect(record.backgroundId);
            } catch {}
        }
    }

    watchContainer(container) {
        if (!this._enabled || !container ||
            this._containers.has(container))
            return false;

        const record = {addedId: 0, removedId: 0, destroyId: 0};
        this._containers.set(container, record);

        try {
            record.addedId = container.connect(
                'child-added', (_parent, actor) => this._track(actor)
            );
        } catch {}
        try {
            record.removedId = container.connect(
                'child-removed', (_parent, actor) => this._untrack(actor)
            );
        } catch {}
        try {
            record.destroyId = container.connect(
                'destroy', () => this.unwatchContainer(container)
            );
        } catch {}

        for (const actor of container.get_children?.() ?? [])
            this._track(actor);
        return true;
    }

    unwatchContainer(container) {
        const record = this._containers.get(container);
        if (!record)
            return false;
        this._containers.delete(container);

        for (const [signal, id] of [
            ['added', record.addedId],
            ['removed', record.removedId],
            ['destroy', record.destroyId],
        ]) {
            if (!id)
                continue;
            try {
                container.disconnect(id);
            } catch {}
        }

        // Each monitored wallpaper is parented to exactly one source
        // container, so dropping it cannot detach a different source.
        for (const actor of container.get_children?.() ?? [])
            this._untrack(actor);
        return true;
    }

    _scheduleApply() {
        if (!this._enabled || this._pendingUpdateId)
            return;
        this._pendingUpdateId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._pendingUpdateId = 0;
                if (this._enabled)
                    this._applyNow();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _applyNow() {
        this._profile = readAtmosphereProfile(this._settings);
        for (const actor of this._actors.keys())
            this._syncActor(actor);
    }

    cleanup() {
        if (!this._enabled)
            return;
        this._enabled = false;

        if (this._pendingUpdateId) {
            try {
                GLib.source_remove(this._pendingUpdateId);
            } catch {}
            this._pendingUpdateId = 0;
        }
        if (this._settingsId) {
            try {
                this._settings?.disconnect(this._settingsId);
            } catch {}
            this._settingsId = 0;
        }
        if (this._uiGroup) {
            for (const id of [this._uiAddedId, this._uiRemovedId]) {
                if (!id)
                    continue;
                try {
                    this._uiGroup.disconnect(id);
                } catch {}
            }
        }
        this._uiAddedId = 0;
        this._uiRemovedId = 0;
        this._uiGroup = null;

        for (const container of [...this._containers.keys()])
            this.unwatchContainer(container);
        // Destroyed background actors are pruned by their own signals;
        // safety cleanup handles any that were detached unexpectedly.
        for (const actor of [...this._actors.keys()])
            this._untrack(actor);
        this._settings = null;
    }
}
