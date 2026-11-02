import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Independent desktop overlay: does not touch GNOME's native panel clock.
export class DesktopClockWidget {
    constructor(settings) {
        this._settings = settings;
        this._actor = null;
        this._timer = 0;
        this._signals = [];
    }

    enable() {
        this._actor = new St.BoxLayout({
            style_class: 'vliq-desktop-clock',
            vertical: true,
            reactive: false,
            x_align: Clutter.ActorAlign.START,
        });
        this._time = new St.Label({style_class: 'vliq-desktop-clock-time'});
        this._date = new St.Label({style_class: 'vliq-desktop-clock-date'});
        this._actor.add_child(this._time);
        this._actor.add_child(this._date);
        Main.layoutManager.addChrome(this._actor, {
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._signals.push(this._settings.connect('changed::clock-widget-enabled',
            () => this._refresh()));
        this._signals.push(this._settings.connect('changed::clock-widget-24h',
            () => this._refresh()));
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._position();
        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _position() {
        if (!this._actor)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        this._actor.set_position(monitor.x + Math.max(12, monitor.width - 320),
            monitor.y + 100);
        this._actor.set_width(296);
    }

    _refresh() {
        if (!this._actor)
            return;
        this._actor.visible = this._settings.get_boolean('clock-widget-enabled');
        if (!this._actor.visible)
            return;
        const now = GLib.DateTime.new_now_local();
        const format = this._settings.get_boolean('clock-widget-24h')
            ? '%H:%M' : '%I:%M %p';
        this._time.text = now.format(format);
        this._date.text = now.format('%A, %d %B');
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
    }
}
