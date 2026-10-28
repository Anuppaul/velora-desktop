// Velora Terminal Glass, phase 2: compositor-native background blur for Ptyxis.
// GNOME Shell 50 / Wayland. Opt-in; transparent terminal backgrounds are
// supplied by Ptyxis itself (and retain fully opaque glyphs).
//
// We attach one Shell.BlurEffect(BACKGROUND) directly under the *native*
// window surface as a child of its Meta.WindowActor. This paints the real
// background below the terminal without sampling pixels in JavaScript,
// changing Meta.WindowActor opacity or inserting a global stage overlay.
// No polling; all signals/effects are removed on disable/hot-swap.
import Clutter from 'gi://Clutter';
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
            Clutter.BindCoordinate?.ALL === undefined
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
            this._publishStatus(
                this._windows.size
                    ? 'Attached: ' + this._windows.size + ' Ptyxis window(s)'
                    : 'Ready: open a Ptyxis window'
            );
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

        const nativeSurface = children[0] ?? actor.get_first_child?.();
        if (!nativeSurface || nativeSurface === actor) {
            this._publishStatus('Unavailable: Ptyxis native surface not mapped');
            return false;
        }

        let backdrop = null;
        let destroyedId = 0;
        try {
            backdrop = new St.Widget({
                name: BLUR_ACTOR_NAME,
                reactive: false,
            });
            backdrop.set_clip_to_allocation?.(true);
            backdrop.add_constraint(new Clutter.BindConstraint({
                source: nativeSurface,
                coordinate: Clutter.BindCoordinate.ALL,
            }));

            const effect = new Shell.BlurEffect({
                sigma: this._radius(),
                brightness: 1.0,
                mode: Shell.BlurMode.BACKGROUND,
            });
            backdrop.add_effect(effect);

            // Directly behind the REAL Wayland surface, not above native
            // terminal text, not a screenshot, not a stage-wide overlay.
            actor.insert_child_at_index(backdrop, 0);
            destroyedId = actor.connect('destroy', () => {
                this._windows.delete(actor);
                this._publishAttachedCount();
            });
            this._windows.set(actor, {backdrop, effect, destroyedId});
            this._publishAttachedCount();
            console.log('[Velora][TerminalBlur] attached native Ptyxis backdrop');
            return true;
        } catch (error) {
            if (destroyedId) {
                try { actor.disconnect(destroyedId); } catch {}
            }
            try { backdrop?.destroy(); } catch {}
            this._publishStatus('Unavailable: native backdrop attach failed');
            console.warn(
                '[Velora][TerminalBlur] native blur fallback: ' + error
            );
            return false;
        }
    }

    _publishAttachedCount() {
        if (!this._enabled)
            return;
        this._publishStatus(
            this._windows.size
                ? 'Attached: ' + this._windows.size + ' Ptyxis window(s)'
                : 'Ready: open a Ptyxis window'
        );
    }

    _updateRadius() {
        if (!this._enabled)
            return;
        const sigma = this._radius();
        for (const {effect} of this._windows.values()) {
            try {
                if (effect.sigma !== sigma)
                    effect.sigma = sigma;
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

        for (const [actor, {backdrop, destroyedId}] of this._windows) {
            if (destroyedId) {
                try { actor.disconnect(destroyedId); } catch {}
            }
            try { backdrop.destroy(); } catch {}
        }
        this._windows.clear();
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
