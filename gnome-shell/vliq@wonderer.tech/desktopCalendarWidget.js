import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CARD_WIDTH = 326;
const CARD_HEIGHT = 342;
const EDGE_MARGIN = 12;
const GRID_CELL_WIDTH = 40;
const DAY_BADGE_SIZE = 30;
const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function clamp(value, lower, upper) {
    return Math.min(upper, Math.max(lower, value));
}

// A fixed-size, offline, desktop-only monthly calendar. No network calls,
// external calendar access, second material pipeline or GNOME clock override.
export class DesktopCalendarWidget {
    constructor(settings, glassIntegration = null) {
        this._settings = settings;
        this._glassIntegration = glassIntegration;
        this._actor = null;
        this._signalIds = [];
        this._monitorSignal = 0;
        this._timer = 0;
        this._dragGrab = null;
        this._interaction = null;
        this._materialAttached = false;
        this._bounds = null;
        this._days = [];
        this._dayBadges = [];
        this._viewOffset = 0;
        this._visibleYear = null;
        this._visibleMonth = null;
        this._todayKey = '';
    }

    enable() {
        if (this._actor)
            return;

        const card = new St.Widget({
            name: 'vliq-calendar-card',
            style_class: 'vliq-calendar-card',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
        });
        this._actor = card;

        const content = new St.BoxLayout({
            style_class: 'vliq-calendar-content',
            vertical: true,
            x_expand: true,
            y_expand: true,
        });
        card.add_child(content);

        const header = new St.BoxLayout({
            style_class: 'vliq-calendar-header',
            vertical: false,
            x_expand: true,
        });
        content.add_child(header);

        this._previous = new St.Button({
            style_class: 'vliq-calendar-nav',
            label: '‹',
            can_focus: true,
            reactive: true,
        });
        this._next = new St.Button({
            style_class: 'vliq-calendar-nav',
            label: '›',
            can_focus: true,
            reactive: true,
        });
        this._monthDrag = new St.BoxLayout({
            style_class: 'vliq-calendar-month-drag',
            reactive: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._monthTitle = new St.Label({
            style_class: 'vliq-calendar-month-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._monthDrag.add_child(this._monthTitle);
        header.add_child(this._previous);
        header.add_child(this._monthDrag);
        header.add_child(this._next);

        this._previous.connect('clicked', () => this._changeMonth(-1));
        this._next.connect('clicked', () => this._changeMonth(1));

        const weekdayRow = new St.BoxLayout({
            style_class: 'vliq-calendar-weekdays',
            x_expand: true,
        });
        content.add_child(weekdayRow);
        // Identical seven-column cell geometry for headings AND dates.
        // Previously each St.Label centered at its natural text width;
        // today's background therefore did not align consistently with
        // the weekday heading and adjacent date columns.
        for (const day of DAY_HEADERS) {
            const cell = new St.Widget({
                style_class: 'vliq-calendar-cell',
                layout_manager: new Clutter.BinLayout(),
                width: GRID_CELL_WIDTH,
                height: DAY_BADGE_SIZE,
                x_expand: true,
            });
            // Center the actual text actor, not its Pango line inside a
            // fixed-width St.Label. Clutter BinLayout makes the glyph and
            // column share the same center regardless of font metrics.
            cell.add_child(new St.Label({
                text: day,
                style_class: 'vliq-calendar-weekday',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            weekdayRow.add_child(cell);
        }

        this._grid = new St.BoxLayout({
            style_class: 'vliq-calendar-grid',
            vertical: true,
            x_expand: true,
        });
        content.add_child(this._grid);

        // Constant six-row geometry prevents the widget from jumping as
        // the displayed month changes between four, five and six weeks.
        for (let row = 0; row < 6; row++) {
            const week = new St.BoxLayout({
                style_class: 'vliq-calendar-week',
                x_expand: true,
            });
            this._grid.add_child(week);
            for (let col = 0; col < 7; col++) {
                // Never paint the highlight on St.Label: its text can use
                // a natural glyph width while its 30px CSS background paints
                // at a different origin (the screenshot's detached bubble).
                // Put the 30x30 background on a separate badge actor, and
                // center the natural-size text WITHIN that exact badge.
                const label = new St.Label({
                    style_class: 'vliq-calendar-day',
                    text: '',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                const badge = new St.Widget({
                    style_class: 'vliq-calendar-day-badge',
                    layout_manager: new Clutter.BinLayout(),
                    width: DAY_BADGE_SIZE,
                    height: DAY_BADGE_SIZE,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                badge.add_child(label);
                const cell = new St.Widget({
                    style_class: 'vliq-calendar-cell',
                    layout_manager: new Clutter.BinLayout(),
                    width: GRID_CELL_WIDTH,
                    height: DAY_BADGE_SIZE,
                    x_expand: true,
                });
                cell.add_child(badge);
                week.add_child(cell);
                this._days.push(label);
                this._dayBadges.push(badge);
            }
        }

        Main.layoutManager.addChrome(card, {
            affectsStruts: false,
            trackFullscreen: false,
        });

        this._setupDrag();
        for (const key of [
            'calendar-widget-enabled', 'calendar-widget-x',
            'calendar-widget-y', 'glass-style', 'frost-density',
        ]) {
            this._signalIds.push(this._settings.connect(
                'changed::' + key, () => this._onSettingsChanged(key)
            ));
        }
        this._monitorSignal = Main.layoutManager.connect(
            'monitors-changed', () => {
                this._positionFromSettings();
                this._refresh();
            }
        );

        this._positionFromSettings();
        this._refresh();
        this._setMaterial();

        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
        console.log('[VLIQ][Calendar] monthly widget initialized');
    }

    _setupDrag() {
        const gesture = new Clutter.PanGesture();
        gesture.set_required_button(Clutter.BUTTON_PRIMARY);
        gesture.set_begin_threshold(2);
        this._monthDrag.add_action(gesture);

        gesture.connect('recognize', () => {
            if (!this._actor)
                return Clutter.EVENT_PROPAGATE;
            this._interaction = {x: this._actor.x, y: this._actor.y};
            this._dragGrab?.dismiss();
            this._dragGrab = global.stage.grab(this._monthDrag);
            return Clutter.EVENT_STOP;
        });
        gesture.connect('pan-update', action => {
            if (!this._interaction || !this._actor)
                return;
            const delta = action.get_delta_abs();
            const monitor = Main.layoutManager.primaryMonitor;
            if (!delta || !monitor)
                return;

            const x = clamp(this._interaction.x + delta.get_x(),
                monitor.x, monitor.x + Math.max(0, monitor.width - CARD_WIDTH));
            const y = clamp(this._interaction.y + delta.get_y(),
                monitor.y, monitor.y + Math.max(0, monitor.height - CARD_HEIGHT));
            this._interaction.x = x;
            this._interaction.y = y;
            this._actor.set_position(Math.round(x), Math.round(y));
            this._updateBounds();
            this._glassIntegration?.syncCalendarWidgetGlass?.(this._actor);
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

    _positionFromSettings() {
        if (!this._actor || this._interaction)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        this._actor.set_size(CARD_WIDTH, CARD_HEIGHT);
        const x = monitor.x + EDGE_MARGIN +
            Math.max(0, monitor.width - CARD_WIDTH - 2 * EDGE_MARGIN) *
            clamp(this._settings.get_double('calendar-widget-x'), 0, 1);
        const y = monitor.y + EDGE_MARGIN +
            Math.max(0, monitor.height - CARD_HEIGHT - 2 * EDGE_MARGIN) *
            clamp(this._settings.get_double('calendar-widget-y'), 0, 1);
        this._actor.set_position(Math.round(x), Math.round(y));
        this._updateBounds();
    }

    _savePosition() {
        if (!this._actor)
            return;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const spaceX = Math.max(1, monitor.width - CARD_WIDTH - 2 * EDGE_MARGIN);
        const spaceY = Math.max(1, monitor.height - CARD_HEIGHT - 2 * EDGE_MARGIN);
        this._settings.delay();
        this._settings.set_double('calendar-widget-x',
            clamp((this._actor.x - monitor.x - EDGE_MARGIN) / spaceX, 0, 1));
        this._settings.set_double('calendar-widget-y',
            clamp((this._actor.y - monitor.y - EDGE_MARGIN) / spaceY, 0, 1));
        this._settings.apply();
    }

    _updateBounds() {
        if (!this._actor)
            return;
        this._bounds = {
            x: this._actor.x, y: this._actor.y,
            width: CARD_WIDTH, height: CARD_HEIGHT,
        };
    }

    _changeMonth(delta) {
        // Browsing is relative to the actual current month, so navigating
        // across December/January and midnight remains correct.
        this._viewOffset += delta;
        this._renderMonth(true);
    }

    _renderMonth(force = false) {
        if (!this._actor)
            return;
        const now = new Date();
        const view = new Date(now.getFullYear(),
            now.getMonth() + this._viewOffset, 1);
        const year = view.getFullYear();
        const month = view.getMonth();
        const todayKey = [now.getFullYear(), now.getMonth(), now.getDate()].join(':');

        if (!force && year === this._visibleYear &&
            month === this._visibleMonth && todayKey === this._todayKey)
            return;
        this._visibleYear = year;
        this._visibleMonth = month;
        this._todayKey = todayKey;

        this._monthTitle.text = GLib.DateTime.new_local(
            year, month + 1, 1, 12, 0, 0
        ).format('%B %Y');

        const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let index = 0; index < this._days.length; index++) {
            const day = index - firstWeekday + 1;
            const label = this._days[index];
            const badge = this._dayBadges[index];
            badge.remove_style_class_name('vliq-calendar-today');
            label.remove_style_class_name('vliq-calendar-weekend');
            label.text = day > 0 && day <= daysInMonth ? String(day) : '';
            if (day > 0 && day <= daysInMonth && index % 7 >= 5)
                label.add_style_class_name('vliq-calendar-weekend');
            if (day === now.getDate() &&
                year === now.getFullYear() &&
                month === now.getMonth()) {
                badge.add_style_class_name('vliq-calendar-today');
            }
        }
    }

    _setMaterial() {
        if (!this._actor)
            return;
        const frosted = this._settings.get_string('glass-style') === 'frosted';
        this._actor.remove_style_class_name('vliq-calendar-frosted');
        if (frosted)
            this._actor.add_style_class_name('vliq-calendar-frosted');

        try {
            if (this._materialAttached) {
                this._glassIntegration?.updateCalendarWidgetGlass?.(this._actor);
            } else if (this._actor.mapped !== false &&
                       this._actor.visible && this._actor.width > 1) {
                this._materialAttached = Boolean(
                    this._glassIntegration?.attachCalendarWidgetGlass?.(
                        this._actor
                    )
                );
            }
        } catch (error) {
            this._materialAttached = false;
            console.warn('[VLIQ][Calendar] material fallback: ' + error);
        }
    }

    _onSettingsChanged(key) {
        if (key === 'glass-style' || key === 'frost-density')
            this._setMaterial();
        if (key === 'calendar-widget-x' || key === 'calendar-widget-y')
            this._positionFromSettings();
        this._refresh();
    }

    _isDesktopExposed() {
        const rect = this._bounds;
        if (!rect || Main.overview.visible || Main.sessionMode?.isLocked)
            return false;
        const workspace = global.workspace_manager.get_active_workspace();
        for (const actor of global.get_window_actors()) {
            const window = actor.meta_window ?? actor.get_meta_window?.();
            if (!window)
                continue;
            const type = window.get_window_type();
            if (type === Meta.WindowType.DESKTOP || type === Meta.WindowType.DOCK)
                continue;
            if (window.get_showing_on_its_workspace?.() === false)
                continue;
            if (window.get_workspace?.() !== workspace &&
                !window.is_on_all_workspaces?.())
                continue;
            const b = window.get_frame_rect();
            if (b.x < rect.x + rect.width && b.x + b.width > rect.x &&
                b.y < rect.y + rect.height && b.y + b.height > rect.y)
                return false;
        }
        return true;
    }

    _refresh() {
        if (!this._actor)
            return;
        if (!this._settings.get_boolean('calendar-widget-enabled')) {
            this._actor.hide();
            this._glassIntegration?.syncCalendarWidgetGlass?.(this._actor);
            return;
        }
        this._renderMonth();
        this._actor.visible = Boolean(this._interaction) ||
            this._isDesktopExposed();
        this._glassIntegration?.syncCalendarWidgetGlass?.(this._actor);
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
        for (const id of this._signalIds.splice(0))
            this._settings.disconnect(id);
        if (this._monitorSignal) {
            Main.layoutManager.disconnect(this._monitorSignal);
            this._monitorSignal = 0;
        }
        this._glassIntegration?.detachCalendarWidgetGlass?.(this._actor);
        this._actor?.destroy();
        this._actor = null;
        this._days = [];
        this._dayBadges = [];
        this._monthTitle = null;
        this._monthDrag = null;
        this._grid = null;
        this._glassIntegration = null;
        this._materialAttached = false;
        this._bounds = null;
    }
}
