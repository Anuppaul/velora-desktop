import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Test the shipped GJS widget without GNOME Shell by substituting only its
// native Clutter/St/GSettings dependencies. This protects gesture semantics,
// persistent geometry, local glass material selection and teardown.
const source = (await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/desktopClockWidget.js', import.meta.url
), 'utf8'))
    .replace(/^import[^\n]*\n/gm, '')
    .replace('export class DesktopClockWidget', 'class DesktopClockWidget');

class Actor {
    constructor(props = {}) {
        Object.assign(this, props);
        this.x = 0;
        this.y = 0;
        this.height = 140;
        this.width = 0;
        this.visible = true;
        this.children = [];
        this.classes = new Set();
    }
    add_child(actor) {this.children.push(actor);}
    add_action(action) {this.action = action;}
    set_width(width) {this.width = width;}
    set_position(x, y) {this.x = x; this.y = y;}
    set_scale(x, y) {this.scale_x = x; this.scale_y = y;}
    add_style_class_name(name) {this.classes.add(name);}
    remove_style_class_name(name) {this.classes.delete(name);}
    hide() {this.visible = false;}
    destroy() {this.destroyed = true;}
}
class PanGesture {
    constructor() {this.handlers = new Map();}
    set_required_button() {}
    set_begin_threshold() {}
    connect(name, callback) {this.handlers.set(name, callback);}
    get_delta_abs() {
        return {get_x: () => 30, get_y: () => 30};
    }
    emit(name) {this.handlers.get(name)?.(this);}
}
class Settings {
    constructor() {
        this.values = {
            'clock-widget-enabled': true,
            'clock-widget-24h': false,
            'clock-widget-style': 'liquid',
            'clock-widget-scale': 100,
            'clock-widget-x': 0.30,
            'clock-widget-y': 0.30,
            'frost-density': 88,
        };
        this.handlers = new Map();
        this.nextId = 1;
    }
    get_boolean(key) {return this.values[key];}
    get_double(key) {return this.values[key];}
    get_int(key) {return this.values[key];}
    get_string(key) {return this.values[key];}
    set_double(key, value) {this.values[key] = value; this._emit(key);}
    set_int(key, value) {this.values[key] = value; this._emit(key);}
    set_string(key, value) {this.values[key] = value; this._emit(key);}
    connect(name, callback) {
        const id = this.nextId++;
        this.handlers.set(id, {name, callback});
        return id;
    }
    disconnect(id) {this.handlers.delete(id);}
    delay() {}
    apply() {}
    _emit(key) {
        for (const {name, callback} of this.handlers.values()) {
            if (name === 'changed::' + key)
                callback();
        }
    }
}
const settings = new Settings();
const updates = [];
let sourceRemoved = 0;
let grabDismissed = 0;
const screen = {x: 0, y: 0, width: 1920, height: 1080};
let windows = [];
const Widget = new Function(
    'GLib', 'Meta', 'St', 'Clutter', 'Main', 'global', 'console',
    source + '\nreturn DesktopClockWidget;'
)(
    {
        PRIORITY_DEFAULT: 0,
        SOURCE_CONTINUE: 1,
        timeout_add_seconds: () => 42,
        Source: {remove: () => sourceRemoved++},
        DateTime: {new_now_local: () => ({format: pattern => pattern})},
    },
    {WindowType: {DESKTOP: 1, DOCK: 2, NORMAL: 3}},
    {BoxLayout: Actor, Label: Actor, Button: Actor},
    {ActorAlign: {START: 0, END: 1}, BUTTON_PRIMARY: 1,
        EVENT_STOP: 1, EVENT_PROPAGATE: 0, PanGesture},
    {layoutManager: {primaryMonitor: screen, addChrome() {},
        connect: () => 11, disconnect() {}},
    overview: {visible: false}, sessionMode: {isLocked: false}},
    {stage: {grab: () => ({dismiss: () => grabDismissed++})},
        workspace_manager: {get_active_workspace: () => 7},
        get_window_actors: () => windows},
    {log() {}, warn() {}}
);
const clock = new Widget(settings, {
    attachClockWidgetGlass: (_actor, style) => {
        updates.push('attach:' + style);
        return true;
    },
    updateClockWidgetGlass: (_actor, style) => {
        updates.push('update:' + style);
        return true;
    },
});
clock.enable();
assert.equal(clock._actor.visible, true);
assert.equal(updates[0], 'attach:liquid');
assert.equal(settings.handlers.size, 7, 'listens to controls and frost density');

const startX = clock._actor.x;
const move = clock._face.action;
move.emit('recognize');
for (let i = 0; i < 3; i++)
    move.emit('pan-update');
assert.equal(clock._actor.x - startX, 90,
    'every incremental PanGesture update must accumulate');
move.emit('end');
assert.ok(settings.get_double('clock-widget-x') > 0.30,
    'freehand position must persist');

const resize = clock._resizeGrip.action;
resize.emit('recognize');
for (let i = 0; i < 3; i++)
    resize.emit('pan-update');
resize.emit('end');
assert.ok(settings.get_int('clock-widget-scale') >= 128,
    'resize grip must persist the new scale');

settings.set_string('clock-widget-style', 'frosted');
assert.ok(updates.includes('update:frosted'),
    'Frosted Crystal must use the shared glass renderer');
settings.set_int('frost-density', 72);
assert.equal(updates.at(-1), 'update:frosted',
    'density changes must refresh the clock surface');

const beforeHide = clock._actor.visible;
assert.equal(beforeHide, true);
windows = [{meta_window: {
    get_window_type: () => 3,
    get_showing_on_its_workspace: () => true,
    get_workspace: () => 7,
    get_frame_rect: () => ({x: 0, y: 0, width: 1920, height: 1080}),
}}];
clock._refresh();
assert.equal(clock._actor.visible, false,
    'desktop-only widget must not cover normal application windows');

clock.disable();
assert.equal(sourceRemoved, 1);
assert.equal(clock._actor, null);
assert.ok(grabDismissed >= 2);
assert.equal(settings.handlers.size, 0, 'no stale settings listeners');

const stylesheet = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
assert.match(stylesheet, /\.vliq-desktop-clock\.vliq-liquid-shell-card/);
assert.match(stylesheet, /\.vliq-clock-resize-grip/);
assert.match(stylesheet, /background-color:\s*rgba\(228, 240, 255, 0\.13\)/,
    'clock must not become fully transparent while shader compiles');

// Even if shared GPU material construction throws, the desktop card should
// remain visible and draggable as native St actors (no GNOME logout needed).
windows = [];
const broken = new Widget(settings, {
    attachClockWidgetGlass: () => {throw Error('simulated shader failure');},
});
broken.enable();
assert.equal(broken._actor.visible, true,
    'shader failure must not hide the desktop clock');
assert.equal(broken._materialAttached, false,
    'failed glass attachment should retain native fallback');
broken.disable();
console.log('VLIQ desktop clock: drag, resize, persistence, glass fallback, occlusion and cleanup PASS.');
