import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Paint above Desktop Icons NG (which owns a DESKTOP window), but never cover
// real application windows. This keeps the card visible on the desktop without
// becoming an always-on-top overlay or changing Mutter window stacking.
export class DesktopClockWidget {
    constructor(settings) {
        this._settings = settings;
        this._actor = null;
        this._timer = 0;
        this._signals = [];
        this._monitorSignal = 0;
        this._clockBounds = null;
    }

    enable() {
        if (this._actor)
            return;

        const card = new St.BoxLayout({
            name: 'vliq-desktop-clock-card',
            style_class: 'vliq-desktop-clock',
            vertical: true,
            reactive: false,
            x_align: Clutter.ActorAlign.START,
        });
        this._actor = card;
        this._time = new St.Label({
            style_class: 'vliq-desktop-clock-time',
        });
        this._date = new St.Label({
            style_class: 'vliq-desktop-clock-date',
        });
        card.add_child(this._time);
        card.add_child(this._date);

        // addChrome survives DING's desktop window. trackFullscreen:false
        // leaves fullscreen visibility control with Shell; application
        // occlusion is handled separately, so this is desktop-only.
        Main.layoutManager.addChrome(card, {
            affectsStruts: false,
            trackFullscreen: false,
        });

        this._signals.push(this._settings.connect(
            'changed::clock-widget-enabled', () => this._refresh()
        ));
        this._signals.push(this._settings.connect(
            'changed::clock-widget-24h', () => this._refresh()
        ));
        this._monitorSignal = Main.layoutManager.connect(
            'monitors-changed', () => {
                this._position();
                this._refresh();
            }
        );
        this._position();
        this._refresh();

        // One lightweight tick each second also detects changes in active
        // workspace, minimized windows and overview without intrusive hooks.
        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
        console.log('[VLIQ][Clock] clock card initialized');
    }

    _position() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!this._actor || !monitor) {
            this._clockBounds = null;
            return;
        }

        const margin = 20;
        const width = Math.max(160, Math.min(296, monitor.width - margin * 2));
        const x = monitor.x + monitor.width - width - margin;
        const y = monitor.y + 96;
        this._actor.set_position(x, y);
        this._actor.set_width(width);
        this._clockBounds = {x, y, width, height: 140};
    }

    _isDesktopExposed() {
        const card = this._clockBounds;
        if (!card || Main.overview.visible || Main.sessionMode?.isLocked)
            return false;

        // Chrome is above normal windows: hide it whenever a visible app
        // overlaps the clock's screen rectangle. Ignore DING's DESKTOP
        // window and GNOME panels (DOCK), otherwise it would never show.
        const workspace = global.workspace_manager.get_active_workspace();
        for (const actor of global.get_window_actors()) {
            const window = actor.meta_window ?? actor.get_meta_window?.();
            if (!window)
                continue;

            const type = window.get_window_type();
            if (type === Meta.WindowType.DESKTOP ||
                type === Meta.WindowType.DOCK)
                continue;
            if (window.get_showing_on_its_workspace?.() === false)
                continue;
            if (window.get_workspace?.() !== workspace &&
                !window.is_on_all_workspaces?.())
                continue;

            const rect = window.get_frame_rect();
            if (rect.x < card.x + card.width &&
                rect.x + rect.width > card.x &&
                rect.y < card.y + card.height &&
                rect.y + rect.height > card.y)
                return false;
        }
        return true;
    }

    _refresh() {
        if (!this._actor)
            return;

        const enabled = this._settings.get_boolean('clock-widget-enabled');
        if (!enabled) {
            this._actor.hide();
            return;
        }

        const now = GLib.DateTime.new_now_local();
        this._time.text = now.format(
            this._settings.get_boolean('clock-widget-24h')
                ? '%H:%M' : '%I:%M %p'
        );
        this._date.text = now.format('%A, %d %B');
        this._actor.visible = this._isDesktopExposed();
    }

    disable() {
        if (this._timer) {
            GLib.Source.remove(this._timer);
            this._timer = 0;
        }
        for (const id of this._signals.splice(0))
            this._settings.disconnect(id);
        if (this._monitorSignal) {
            Main.layoutManager.disconnect(this._monitorSignal);
            this._monitorSignal = 0;
        }
        this._actor?.destroy();
        this._actor = null;
        this._time = null;
        this._date = null;
        this._clockBounds = null;
    }
}
