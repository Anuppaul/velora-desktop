// Velora Terminal Glass, phase 2: compositor-native background blur for Ptyxis.
// GNOME Shell 50 / Wayland. Opt-in; transparent terminal backgrounds are
// supplied by Ptyxis itself (and retain fully opaque glyphs).
//
// We attach BACKGROUND blur on a frame-clipped St.Widget beneath the native
// surface. Meta.WindowActor may include client-side shadows outside the
// visible frame: a full-buffer blur leaks a halo onto the wallpaper.
// No screenshots, opacity writes or global overlays; fail closed on geometry.
// No polling; all signals/effects are removed on disable/hot-swap.
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

const BLUR_ACTOR_NAME = 'velora-ptyxis-backdrop-blur';
// Never stack an extra expensive background pass on another extension's blur.
const OTHER_BLUR_ACTORS = new Set([
    'bms-application-blurred-widget',
    'blur-actor',
    'winfx-blur-actor',
]);

const PTYXIS_IDS = new Set([
    'ptyxis',
    'org.gnome.ptyxis',
    'org.gnome.ptyxis.devel',
    'app.devsuite.ptyxis',
]);

function safeName(actor) {
    try {
        return String(actor?.get_name?.() ?? actor?.name ?? '');
    } catch {
        return '';
    }
}

export function isPtyxisWindow(metaWindow) {
    if (!metaWindow)
        return false;

    try {
        const kind = metaWindow.get_window_type?.();
        if (kind !== undefined && kind !== Meta.WindowType.NORMAL)
            return false;
    } catch {
        return false;
    }

    // Exact application IDs only. Never blur arbitrary terminals, browsers
    // or dialogs because a window TITLE happens to contain "Ptyxis".
    const getters = [
        'get_wm_class',
        'get_wm_class_instance',
        'get_gtk_application_id',
    ];
    return getters.some(getter => {
        try {
            const value = metaWindow[getter]?.();
            if (typeof value !== 'string')
                return false;
            return PTYXIS_IDS.has(
                value.trim().toLowerCase().replace(/\.desktop$/, '')
            );
        } catch {
            return false;
        }
    });
}

/**
 * Compute visible Meta.Window frame in local buffer/actor coordinates.
 * frame_rect excludes CSD shadows while buffer_rect includes them.
 * Scale for fractional displays, rounding inward so blur never spills.
 */
export function computeTerminalBlurFrame(metaWindow, actor) {
    const frame = metaWindow?.get_frame_rect?.();
    const buffer = metaWindow?.get_buffer_rect?.();
    const valid = rect => rect && ['x', 'y', 'width', 'height']
        .every(key => Number.isFinite(rect[key])) &&
        rect.width > 1 && rect.height > 1;
    if (!valid(frame) || !valid(buffer))
        return null;

    const left = Math.max(frame.x, buffer.x);
    const top = Math.max(frame.y, buffer.y);
    const right = Math.min(frame.x + frame.width, buffer.x + buffer.width);
    const bottom = Math.min(frame.y + frame.height, buffer.y + buffer.height);
    if (right - left < 2 || bottom - top < 2)
        return null;

    const actorWidth = actor?.get_width?.();
    const actorHeight = actor?.get_height?.();
    const scaleX = Number.isFinite(actorWidth) && actorWidth > 1
        ? actorWidth / buffer.width
        : 1;
    const scaleY = Number.isFinite(actorHeight) && actorHeight > 1
        ? actorHeight / buffer.height
        : 1;
    if (
        !Number.isFinite(scaleX) || !Number.isFinite(scaleY) ||
        scaleX < 0.25 || scaleY < 0.25 ||
        scaleX > 4 || scaleY > 4
    )
        return null;

    const x1 = Math.ceil((left - buffer.x) * scaleX);
    const y1 = Math.ceil((top - buffer.y) * scaleY);
    const x2 = Math.floor((right - buffer.x) * scaleX);
    const y2 = Math.floor((bottom - buffer.y) * scaleY);
    if (x2 - x1 < 2 || y2 - y1 < 2)
        return null;
    return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
}

export class TerminalBackdropBlurManager {
    constructor(settings) {
        this._settings = settings;
        this._enabled = false;
        this._running = false;
        this._enabledChangedId = 0;
        this._radiusChangedId = 0;
        this._wmMapId = 0;
        this._windowCreatedId = 0;
        this._windows = new Map();
        this._lastStatus = '';
        this._lastAttachFailure = '';
    }

    setup() {
        if (this._running)
            return;
        this._running = true;
        this._enabledChangedId = this._settings.connect(
            'changed::terminal-backdrop-blur-enabled',
            () => this._applyPreference()
        );
        this._radiusChangedId = this._settings.connect(
            'changed::terminal-backdrop-blur-radius',
            () => this._updateRadius()
        );
        this._applyPreference();
    }

    _radius() {
        try {
            const value = this._settings.get_int('terminal-backdrop-blur-radius');
            return Math.min(36, Math.max(4, value));
        } catch {
            return 18;
        }
    }

    _publishStatus(message) {
        if (message === this._lastStatus)
            return;
        this._lastStatus = message;
        try {
            if (this._settings.get_string('terminal-backdrop-blur-status') !==
                message) {
                this._settings.set_string('terminal-backdrop-blur-status', message);
            }
        } catch {
            // Diagnostic is optional: never break live Shell over status text.
        }
    }

    _applyPreference() {
        let enabled = false;
        try {
            enabled = this._settings.get_boolean(
                'terminal-backdrop-blur-enabled'
            );
        } catch {}
        if (!this._running || !enabled) {
            this._stop();
            this._publishStatus('Off');
            return;
        }

        if (this._enabled) {
            this._scan();
            return;
        }

        if (
            typeof Shell.BlurEffect !== 'function' ||
            Shell.BlurMode?.BACKGROUND === undefined ||
            typeof St.Widget !== 'function'
        ) {
            this._publishStatus('Unavailable: compositor blur API missing');
            return;
        }

        this._enabled = true;
        try {
            // Map fires once the compositor actor exists. window-created
            // handles the corresponding Meta.Window path when available.
            this._wmMapId = global.window_manager.connect(
                'map', (_wm, actor) => this._attach(actor)
            );
            this._windowCreatedId = global.display.connect(
                'window-created',
                (_display, window) => {
                    this._attach(window?.get_compositor_private?.());
                }
            );
            this._scan();
            this._publishAttachedCount();
        } catch (error) {
            this._stop();
            this._publishStatus('Unavailable: cannot track Shell windows');
            console.warn(
                '[Velora][TerminalBlur] window tracking unavailable: ' + error
            );
        }
    }

    _scan() {
        if (!this._enabled)
            return;
        try {
            for (const actor of global.get_window_actors?.() ?? [])
                this._attach(actor);
        } catch (error) {
            console.warn('[Velora][TerminalBlur] scan skipped: ' + error);
        }
    }

    _attach(actor) {
        if (!this._enabled || !actor || this._windows.has(actor))
            return false;

        let metaWindow;
        try {
            metaWindow = actor.get_meta_window?.();
        } catch {
            return false;
        }
        if (!isPtyxisWindow(metaWindow))
            return false;

        // Do not create a second GPU blur when Blur My Shell or WinFX
        // already owns a backdrop below this same native window.
        const children = actor.get_children?.() ?? [];
        if (children.some(child =>
            safeName(child) === BLUR_ACTOR_NAME ||
            OTHER_BLUR_ACTORS.has(safeName(child))
        )) {
            this._publishStatus('Skipped: existing window blur detected');
            return false;
        }

        // Meta.WindowActor.get_texture() is the authoritative native
        // surface on GNOME 50. A child at index 0 is not guaranteed to be
        // the actual Wayland surface (e.g. shadow/other effects).
        let nativeSurface = null;
        try {
            nativeSurface =
                actor.get_texture?.() ??
                children.find(child =>
                    child &&
                    !OTHER_BLUR_ACTORS.has(safeName(child)) &&
                    safeName(child) !== BLUR_ACTOR_NAME
                ) ??
                actor.get_first_child?.();
        } catch (error) {
            this._recordAttachFailure('find-surface', error);
            return false;
        }
        if (!nativeSurface || nativeSurface === actor) {
            this._publishStatus('Unavailable: Ptyxis native surface not mapped');
            return false;
        }

        let backdrop = null;
        let destroyedId = 0;
        const geometrySignals = [];
        let stage = 'frame-geometry';
        try {
            let lastRect = null;
            const syncGeometry = () => {
                const next = computeTerminalBlurFrame(metaWindow, actor);
                if (!next) {
                    backdrop?.hide();
                    lastRect = null;
                    return false;
                }
                const changed = !lastRect ||
                    Object.keys(next).some(key => next[key] !== lastRect[key]);
                if (changed) {
                    backdrop.set_position(next.x, next.y);
                    backdrop.set_size(next.width, next.height);
                    // Scissor the output: blur can SAMPLE outside the
                    // frame but must never PAINT outside its rectangle.
                    backdrop.set_clip(0, 0, next.width, next.height);
                    lastRect = next;
                }
                backdrop.show();
                return true;
            };
            if (!computeTerminalBlurFrame(metaWindow, actor))
                throw new Error('visible frame/buffer geometry unavailable');

            stage = 'create-actor';
            backdrop = new St.Widget({
                name: BLUR_ACTOR_NAME,
                reactive: false,
                clip_to_allocation: true,
            });
            stage = 'frame-geometry';
            if (!syncGeometry())
                throw new Error('failed to crop blur to visible frame');

            stage = 'connect-geometry';
            const onGeometry = () => {
                try {
                    if (!syncGeometry())
                        this._publishStatus('Paused: invalid Ptyxis frame geometry');
                    else
                        this._publishAttachedCount();
                } catch (error) {
                    backdrop.hide();
                    this._recordAttachFailure('update-geometry', error);
                }
            };
            for (const [source, signal] of [
                [metaWindow, 'size-changed'],
                [metaWindow, 'position-changed'],
                [actor, 'notify::allocation'],
            ]) {
                try {
                    const id = source.connect(signal, onGeometry);
                    if (id)
                        geometrySignals.push({source, id});
                } catch (error) {
                    console.warn(
                        '[Velora][TerminalBlur] optional geometry signal ' +
                        signal + ' unavailable: ' + error
                    );
                }
            }

            stage = 'create-blur-effect';
            const effect = new Shell.BlurEffect({
                // GNOME Shell 46+ renamed sigma to radius. Preserve the
                // user's existing sigma-equivalent strength setting:
                // native radius = legacy sigma * 2.
                radius: this._radius() * 2,
                brightness: 1.0,
                mode: Shell.BlurMode.BACKGROUND,
            });
            stage = 'add-effect';
            backdrop.add_effect_with_name(
                'velora-terminal-background-blur',
                effect
            );

            stage = 'insert-under-surface';
            // The original terminal surface stays ABOVE the effect: glyphs,
            // cursor, selection and titlebar never have their alpha changed.
            actor.insert_child_at_index(backdrop, 0);
            // Clip ONLY the blur, not the WindowActor (which owns
            // legitimate native surface content and compositor shadows).
            actor.set_child_below_sibling?.(backdrop, null);

            stage = 'connect-destroy';
            destroyedId = actor.connect('destroy', () => {
                this._windows.delete(actor);
                for (const {source, id} of geometrySignals) {
                    try { source.disconnect(id); } catch {}
                }
                this._publishAttachedCount();
            });
            this._windows.set(actor, {
                backdrop,
                effect,
                destroyedId,
                geometrySignals,
            });
            this._lastAttachFailure = '';
            this._publishAttachedCount();
            console.log(
                '[Velora][TerminalBlur] native Ptyxis backdrop actor attached; ' +
                'visible blur requires a translucent Ptyxis profile and device QA'
            );
            return true;
        } catch (error) {
            if (destroyedId) {
                try { actor.disconnect(destroyedId); } catch {}
            }
            for (const {source, id} of geometrySignals) {
                try { source.disconnect(id); } catch {}
            }
            try { backdrop?.destroy(); } catch {}
            this._recordAttachFailure(stage, error);
            return false;
        }
    }

    _recordAttachFailure(stage, error) {
        const reason = String(error?.message ?? error ?? 'unknown')
            .replace(/\s+/g, ' ')
            .slice(0, 100);
        this._lastAttachFailure = stage + ': ' + reason;
        this._publishStatus(
            'Unavailable (' + this._lastAttachFailure + ')'
        );
        console.warn(
            '[Velora][TerminalBlur] native blur attach ' +
            stage + ' failed: ' + (error?.stack ?? error)
        );
    }

    _publishAttachedCount() {
        if (!this._enabled)
            return;
        this._publishStatus(
            this._windows.size
                ? 'Attached: ' + this._windows.size +
                    ' Ptyxis window(s) (visual unverified; check profile opacity)'
                : this._lastAttachFailure
                    ? 'Unavailable (' + this._lastAttachFailure + ')'
                    : 'Ready: open a Ptyxis window'
        );
    }

    _updateRadius() {
        if (!this._enabled)
            return;
        const radius = this._radius() * 2;
        for (const {effect} of this._windows.values()) {
            try {
                if (effect.radius !== radius)
                    effect.radius = radius;
            } catch (error) {
                console.warn(
                    '[Velora][TerminalBlur] radius change skipped: ' + error
                );
            }
        }
    }

    _stop() {
        this._enabled = false;
        if (this._wmMapId) {
            try { global.window_manager.disconnect(this._wmMapId); } catch {}
        }
        this._wmMapId = 0;
        if (this._windowCreatedId) {
            try { global.display.disconnect(this._windowCreatedId); } catch {}
        }
        this._windowCreatedId = 0;

        for (const [actor, {backdrop, destroyedId, geometrySignals}] of this._windows) {
            if (destroyedId) {
                try { actor.disconnect(destroyedId); } catch {}
            }
            for (const {source, id} of geometrySignals) {
                try { source.disconnect(id); } catch {}
            }
            try { backdrop.destroy(); } catch {}
        }
        this._windows.clear();
        this._lastAttachFailure = '';
    }

    cleanup() {
        if (!this._running)
            return;
        this._running = false;
        this._stop();
        if (this._enabledChangedId) {
            try { this._settings.disconnect(this._enabledChangedId); } catch {}
        }
        if (this._radiusChangedId) {
            try { this._settings.disconnect(this._radiusChangedId); } catch {}
        }
        this._enabledChangedId = 0;
        this._radiusChangedId = 0;
        this._publishStatus('Off');
        this._settings = null;
    }
}
