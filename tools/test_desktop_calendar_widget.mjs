import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the shipped GJS widget with lightweight GNOME St/Clutter mocks,
// without calling the real calendar UI or depending on a display session.
const source = (await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/desktopCalendarWidget.js', import.meta.url
), 'utf8'))
    .replace(/^import[^\n]*\n/gm, '')
    .replace('export class DesktopCalendarWidget', 'class DesktopCalendarWidget');

class Actor {
    constructor(props = {}) {
        Object.assign(this, props);
        this.x = 0;
        this.y = 0;
        this.width = props.width ?? 0;
        this.height = props.height ?? 0;
        this.visible = true;
        this.mapped = true;
        this.children = [];
        this.classes = new Set();
        this.handlers = new Map();
    }
    add_child(child) {this.children.push(child);}
    add_action(action) {this.action = action;}
    set_size(w, h) {this.width = w; this.height = h;}
    set_position(x, y) {this.x = x; this.y = y;}
    add_style_class_name(name) {this.classes.add(name);}
    remove_style_class_name(name) {this.classes.delete(name);}
    connect(name, callback) {this.handlers.set(name, callback); return 1;}
    click() {this.handlers.get('clicked')?.();}
    hide() {this.visible = false;}
    destroy() {this.destroyed = true;}
}
class PanGesture {
    constructor() {this.handlers = new Map();}
    set_required_button() {}
    set_begin_threshold() {}
    connect(name, callback) {this.handlers.set(name, callback);}
    get_delta_abs() {return {get_x: () => 30, get_y: () => 20};}
    emit(name) {this.handlers.get(name)?.(this);}
}
class Settings {
    constructor() {
        this.values = {
            'calendar-widget-enabled': true,
            'calendar-widget-x': 0.04,
            'calendar-widget-y': 0.17,
            'glass-style': 'liquid',
            'frost-density': 88,
        };
        this.handlers = new Map();
        this.nextId = 1;
    }
    get_boolean(key) {return this.values[key];}
    get_double(key) {return this.values[key];}
    get_int(key) {return this.values[key];}
    get_string(key) {return this.values[key];}
    set_double(key, value) {this.values[key] = value; this.emit(key);}
    set_string(key, value) {this.values[key] = value; this.emit(key);}
    connect(key, callback) {
        const id = this.nextId++;
        this.handlers.set(id, {key, callback});
        return id;
    }
    disconnect(id) {this.handlers.delete(id);}
    delay() {}
    apply() {}
    emit(key) {
        for (const handler of this.handlers.values()) {
            if (handler.key === 'changed::' + key)
                handler.callback();
        }
    }
}
const settings = new Settings();
const updates = [];
let timerRemoved = 0;
let dismissed = 0;
const monitor = {x: 0, y: 0, width: 1920, height: 1080};
let windows = [];

const Calendar = new Function(
    'GLib', 'Meta', 'St', 'Clutter', 'Main', 'global', 'console',
    source + '\nreturn DesktopCalendarWidget;'
)(
    {
        PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: 1,
        timeout_add_seconds: () => 12,
        Source: {remove: () => timerRemoved++},
        DateTime: {new_local: (year, month) => ({
            format: () => new Date(year, month - 1, 1)
                .toLocaleString('en-US', {month: 'long'}) + ' ' + year,
        })},
    },
    {WindowType: {DESKTOP: 1, DOCK: 2, NORMAL: 3}},
    {Widget: Actor, BoxLayout: Actor, Label: Actor, Button: Actor},
    {ActorAlign: {CENTER: 0, FILL: 1}, BUTTON_PRIMARY: 1,
        EVENT_STOP: 1, EVENT_PROPAGATE: 0,
        BinLayout: class BinLayout {}, PanGesture},
    {layoutManager: {primaryMonitor: monitor, addChrome() {},
        connect: () => 14, disconnect() {}},
    overview: {visible: false}, sessionMode: {isLocked: false}},
    {stage: {grab: () => ({dismiss: () => dismissed++})},
    workspace_manager: {get_active_workspace: () => 7},
    get_window_actors: () => windows},
    {log() {}, warn() {}}
);
const calendar = new Calendar(settings, {
    attachCalendarWidgetGlass: (_actor) => {
        updates.push('attach');
        return true;
    },
    updateCalendarWidgetGlass: () => updates.push('update'),
    syncCalendarWidgetGlass: () => updates.push('sync'),
    detachCalendarWidgetGlass: () => updates.push('detach'),
});
calendar.enable();
assert.equal(calendar._actor.width, 326);
assert.equal(calendar._actor.height, 342);
assert.equal(calendar._days.length, 42,
    'all months must share the same 6x7 layout');
assert.equal(calendar._actor.visible, true);
assert.ok(updates.includes('attach'));
assert.equal(settings.handlers.size, 5);

const now = new Date();
const firstWeekday = (new Date(now.getFullYear(), now.getMonth(), 1)
    .getDay() + 6) % 7;
assert.equal(calendar._days[firstWeekday].text, '1',
    'calendar must use Monday as first weekday');
const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
assert.equal(calendar._days[firstWeekday + days - 1].text, String(days));
assert.equal(calendar._days.filter(day =>
    day.classes.has('vliq-calendar-today')).length, 1,
'current month must mark exactly one today cell');

const initialMonth = calendar._monthTitle.text;
calendar._next.click();
assert.equal(calendar._viewOffset, 1);
assert.notEqual(calendar._monthTitle.text, initialMonth,
    'next month button must change the month');
calendar._previous.click();
assert.equal(calendar._viewOffset, 0);
assert.equal(calendar._monthTitle.text, initialMonth);
calendar._previous.click();
assert.equal(calendar._viewOffset, -1);
calendar._next.click();

const beforeX = calendar._actor.x;
const drag = calendar._monthDrag.action;
drag.emit('recognize');
for (let i = 0; i < 3; i++)
    drag.emit('pan-update');
assert.equal(calendar._actor.x - beforeX, 90,
    'incremental pan deltas accumulate');
drag.emit('end');
assert.ok(settings.get_double('calendar-widget-x') > 0.04,
    'calendar position must persist');
settings.set_string('glass-style', 'frosted');
assert.ok(calendar._actor.classes.has('vliq-calendar-frosted'));
assert.ok(updates.includes('update'),
    'calendar must follow global Liquid / Frosted selection');

windows = [{meta_window: {
    get_window_type: () => 3,
    get_showing_on_its_workspace: () => true,
    get_workspace: () => 7,
    get_frame_rect: () => ({x: 0, y: 0, width: 1920, height: 1080}),
}}];
calendar._refresh();
assert.equal(calendar._actor.visible, false,
    'calendar may not overlay ordinary app windows');
windows = [];
settings.values['calendar-widget-enabled'] = false;
calendar._refresh();
assert.equal(calendar._actor.visible, false,
    'calendar toggle must hide the card without disabling Clock');
settings.values['calendar-widget-enabled'] = true;
calendar._refresh();
assert.equal(calendar._actor.visible, true);

calendar.disable();
assert.equal(timerRemoved, 1);
assert.equal(calendar._actor, null);
assert.ok(dismissed >= 1);
assert.ok(updates.includes('detach'));
assert.equal(settings.handlers.size, 0,
    'no stale settings handlers after teardown');

const css = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
assert.match(css, /\.vliq-calendar-card\.vliq-calendar-panel-glass-ready/);
assert.match(css, /\.vliq-calendar-today\s*\{/);
console.log('Calendar widget: date grid, navigation, drag, persistence, global glass and cleanup PASS.');
