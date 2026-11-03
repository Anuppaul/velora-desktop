import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BASE_WIDTH = 296;
const BASE_HEIGHT = 148;
const EDGE_MARGIN = 12;

function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
}

// One desktop-only clock. Move the fixed-size card freely; the position
// persists in canonical VLIQ GSettings. Resize intentionally disabled.
// The glass renderer is shared with VLIQ's existing preview material pipeline.
export class DesktopClockWidget {
    constructor(settings, glassIntegration = null) {
        this._settings = settings;
        this._glassIntegration = glassIntegration;
        this._actor = null;
        this._timer = 0;
        this._signals = [];
        this._monitorSignal = 0;
        this._clockBounds = null;
        this._interaction = null;
        this._dragGrab = null;
        this._materialAttached = false;
    }

    enable() {
        if (this._actor)
            return;

        // The glass material is a large 104px-padded actor. It MUST be
        // composited as a background in BinLayout, not inserted as a child
        // of a vertical St.BoxLayout (which can move the clock off-screen).
        const card = new St.Widget({
            name: 'vliq-clock-card',
            style_class: 'vliq-clock-card',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
        });
        this._actor = card;
        this._content = new St.BoxLayout({
            style_class: 'vliq-clock-content',
            vertical: true,
            x_expand: true,
            y_expand: true,
        });
        card.add_child(this._content);

        // Drag only. No resize grip or scale action.
        this._face = new St.BoxLayout({
            style_class: 'vliq-clock-drag-surface',
            vertical: true,
            reactive: true,
        });
        this._time = new St.Label({
            style_class: 'vliq-clock-card-time',
        });
        this._date = new St.Label({
            style_class: 'vliq-clock-card-date',
        });
        this._face.add_child(this._time);
        this._face.add_child(this._date);
        this._content.add_child(this._face);

        // Chrome remains above DING's desktop window. Application occlusion
        // is controlled below, so the card cannot cover normal app windows.
        Main.layoutManager.addChrome(card, {
            affectsStruts: false,
            trackFullscreen: false,
        });

        this._setupDrag();

        for (const key of [
            'clock-widget-enabled',
            'clock-widget-24h',
            'clock-widget-style',
            'frost-density',
            'clock-widget-x',
            'clock-widget-y',
        ]) {
            this._signals.push(this._settings.connect(
                'changed::' + key, () => this._onSettingsChanged(key)
            ));
        }
        this._monitorSignal = Main.layoutManager.connect(
            'monitors-changed', () => {
                this._positionFromSettings();
                this._refresh();
            }
        );
        // Position first: the shader should never take away the native
        // fallback on an unmapped, zero-size desktop chrome actor.
        this._positionFromSettings();
        this._refresh();
        this._setMaterial();

        // A once-per-second clock tick also handles overview and window
        // occlusion, without global pointer hooks or expensive redraw loops.
        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
        console.log('[VLIQ][Clock] movable fixed-size glass clock initialized');
    }

    _setupDrag() {
        const gesture = new Clutter.PanGesture();
        gesture.set_required_button(Clutter.BUTTON_PRIMARY);
        gesture.set_begin_threshold(2);
        this._face.add_action(gesture);

        gesture.connect('recognize', () => {
            if (!this._actor)
                return Clutter.EVENT_PROPAGATE;
            this._interaction = {
                x: this._actor.x,
                y: this._actor.y,
            };
            this._dragGrab?.dismiss();
            this._dragGrab = global.stage.grab(this._face);
            return Clutter.EVENT_STOP;
        });

        gesture.connect('pan-update', action => {
            if (!this._interaction || !this._actor)
                return;
            const delta = action.get_delta_abs();
            if (!delta)
                return;
            const monitor = Main.layoutManager.primaryMonitor;
            if (!monitor)
                return;
            const {width, height} = this._renderedSize();
            const x = clamp(this._interaction.x + delta.get_x(),
                monitor.x, monitor.x + Math.max(0, monitor.width - width));
            const y = clamp(this._interaction.y + delta.get_y(),
                monitor.y, monitor.y + Math.max(0, monitor.height - height));
            this._interaction.x = x;
            this._interaction.y = y;
            this._actor.set_position(Math.round(x), Math.round(y));
            this._updateBounds();
        });

        const finish = () => {
            if (!this._interaction)
                return;
            this._interaction = null;
            this._dragGrab?.dismiss();
            this._dragGrab = null;
            this._savePosition();
            this._refresh();
        };
        gesture.connect('end', finish);
        gesture.connect('cancel', finish);
    }

    _renderedSize() {
        return {width: BASE_WIDTH, height: BASE_HEIGHT};
    }

    _positionFromSettings() {
        if (!this._actor || this._interaction)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        this._actor.set_size(BASE_WIDTH, BASE_HEIGHT);
        const {width, height} = this._renderedSize();
        const usableX = Math.max(0, monitor.width - width - 2 * EDGE_MARGIN);
        const usableY = Math.max(0, monitor.height - height - 2 * EDGE_MARGIN);
        const x = monitor.x + EDGE_MARGIN +
            usableX * clamp(this._settings.get_double('clock-widget-x'), 0, 1);
        const y = monitor.y + EDGE_MARGIN +
            usableY * clamp(this._settings.get_double('clock-widget-y'), 0, 1);
        this._actor.set_position(Math.round(x), Math.round(y));
        this._updateBounds();
    }

    _savePosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!this._actor || !monitor)
            return;
        const {width, height} = this._renderedSize();
        const usableX = Math.max(1, monitor.width - width - 2 * EDGE_MARGIN);
        const usableY = Math.max(1, monitor.height - height - 2 * EDGE_MARGIN);
        const x = clamp((this._actor.x - monitor.x - EDGE_MARGIN) / usableX, 0, 1);
        const y = clamp((this._actor.y - monitor.y - EDGE_MARGIN) / usableY, 0, 1);
        this._settings.delay();
        this._settings.set_double('clock-widget-x', x);
        this._settings.set_double('clock-widget-y', y);
        this._settings.apply();
    }

    _updateBounds() {
        if (!this._actor)
            return;
        const {width, height} = this._renderedSize();
        this._clockBounds = {
            x: this._actor.x,
            y: this._actor.y,
            width,
            height,
        };
    }

    _setMaterial() {
        if (!this._actor)
            return;
        const mode = this._settings.get_string('clock-widget-style');
        const frosted = mode === 'frosted';
        this._actor.remove_style_class_name('vliq-clock-frosted');
        this._actor.remove_style_class_name('vliq-clock-liquid');
        this._actor.add_style_class_name(
            frosted ? 'vliq-clock-frosted' : 'vliq-clock-liquid'
        );

        const amount = frosted
            ? clamp(this._settings.get_int('frost-density') / 100, 0.05, 1)
            : 0;
        // Material attachment is optional: failure or asynchronous shader
        // loading must NEVER make the native clock disappear.
        try {
            if (this._materialAttached) {
                this._glassIntegration?.updateClockWidgetGlass?.(
                    this._actor, mode, amount
                );
            } else if (this._actor.mapped !== false &&
                       this._actor.width > 1 &&
                       this._actor.visible) {
                this._materialAttached = Boolean(
                    this._glassIntegration?.attachClockWidgetGlass?.(
                        this._actor, mode, amount
                    )
                );
            }
        } catch (error) {
            this._materialAttached = false;
            console.warn('[VLIQ][Clock] glass fallback active: ' + error);
        }
    }

    _onSettingsChanged(key) {
        if (key === 'clock-widget-style' || key === 'frost-density')
            this._setMaterial();
        if (key === 'clock-widget-x' || key === 'clock-widget-y')
            this._positionFromSettings();
        this._refresh();
    }

    _isDesktopExposed() {
        const card = this._clockBounds;
        if (!card || Main.overview.visible || Main.sessionMode?.isLocked)
            return false;

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
        if (!this._settings.get_boolean('clock-widget-enabled')) {
            this._actor.hide();
            return;
        }
        const now = GLib.DateTime.new_now_local();
        this._time.text = now.format(
            this._settings.get_boolean('clock-widget-24h')
                ? '%H:%M' : '%I:%M %p'
        );
        this._date.text = now.format('%A, %d %B');
        this._actor.visible = Boolean(this._interaction) ||
            this._isDesktopExposed();
        this._updateBounds();
        // Retry only after Clutter maps the actor. One existing second
        // tick is enough; do not add another polling loop.
        if (this._actor.visible && !this._materialAttached &&
            this._actor.mapped !== false)
            this._setMaterial();
    }

    disable() {
        this._interaction = null;
        this._dragGrab?.dismiss();
        this._dragGrab = null;
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
        this._content = null;
        this._face = null;
        this._time = null;
        this._date = null;
        this._clockBounds = null;
        this._glassIntegration = null;
        this._materialAttached = false;
    }
}
