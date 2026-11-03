import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Test the shipped GJS widget without GNOME Shell by substituting only its
// native Clutter/St/GSettings dependencies. This protects drag semantics,
// fixed card geometry, global glass material selection and teardown.
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
    set_size(width, height) {this.width = width; this.height = height;}
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
            'glass-style': 'liquid',
            'clock-widget-style': 'frosted', // legacy setting must be ignored
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
let synced = 0;
let detached = 0;
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
    {Widget: Actor, BoxLayout: Actor, Label: Actor, Button: Actor},
    {ActorAlign: {START: 0, END: 1}, BUTTON_PRIMARY: 1,
        EVENT_STOP: 1, EVENT_PROPAGATE: 0, PanGesture,
        BinLayout: class BinLayout {}},
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
    syncClockWidgetGlass: () => synced++,
    detachClockWidgetGlass: () => detached++,
});
clock.enable();
assert.equal(clock._actor.visible, true);
assert.equal(clock._actor.children[0], clock._content,
    'clock content must live in a BinLayout overlay, not a glass-displacing vertical root');
assert.ok(clock._actor.layout_manager,
    'glass background must use BinLayout and never enter the text layout');
assert.equal(updates[0], 'attach:liquid');
assert.equal(settings.handlers.size, 6, 'listens to controls and frost density');
assert.equal(clock._resizeGrip, undefined, 'no resize handle');
assert.equal(clock._actor.width, 296, 'clock card stays at fixed width');
assert.equal(clock._actor.height, 148, 'clock card stays at fixed height');

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
assert.ok(synced >= 3, 'native panel material follows the dragged clock');

const materialUpdates = updates.length;
settings.set_string('clock-widget-style', 'liquid');
assert.equal(updates.length, materialUpdates,
    'legacy per-clock material must not override Appearance');
settings.set_string('glass-style', 'frosted');
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
assert.equal(detached, 1, 'panel glass sibling detached before clock teardown');
assert.ok(grabDismissed >= 1);
assert.equal(settings.handlers.size, 0, 'no stale settings listeners');

const stylesheet = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
assert.match(stylesheet, /\.vliq-clock-card\.vliq-clock-panel-glass-ready/,
    'real native panel glass is revealed only after its first composited frame');
assert.doesNotMatch(stylesheet, /\.vliq-clock-resize-grip/,
    'resize CSS must be absent');
assert.match(stylesheet, /background-color:\s*rgba\(236, 244, 255, 0\.16\)/,
    'Liquid fallback must remain visible until its shader is ready');
assert.match(stylesheet, /background-color:\s*rgba\(239, 245, 255, 0\.38\)/,
    'Frosted fallback must remain visible until its shader is ready');
const clockCss = stylesheet.slice(
    stylesheet.indexOf('/* Clock fallback:'),
    stylesheet.indexOf('/* VLIQ monthly calendar:')
);
const clockTextShadows = [...clockCss.matchAll(/text-shadow:\s*([^;]+);/g)]
    .map(match => match[1].trim());
assert.deepEqual(clockTextShadows, ['none !important', 'none !important'],
    'Clock time/date must not have text shadows');
assert.match(clockCss, /border:\s*0\s*!important/,
    'Clock must not draw a horizontal border');
assert.match(clockCss, /box-shadow:\s*none\s*!important/,
    'Clock must not draw any rear shadow');
assert.doesNotMatch(clockCss, /border-top:\s*1px/,
    'Clock must not draw a horizontal top line');

const appearanceSource = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/liquidGlassDock.js', import.meta.url
), 'utf8');
assert.match(appearanceSource,
    /new PanelGlassSurface\(/,
    'Clock must reuse the real native panel renderer');
assert.match(appearanceSource,
    /this\._clockPanelGlass\?\.updateAppearance\(\)/,
    'Clock must follow shared VLIQ appearance changes');
assert.doesNotMatch(appearanceSource,
    /\.vliq-clock-card\.vliq-liquid-shell-card\.vliq-clock-glass-ready/,
    'retired 104px ShellCard renderer filter must not control Clock');

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
console.log('VLIQ desktop clock: fixed size, drag, persistence, glass readiness fallback, occlusion and cleanup PASS.');
