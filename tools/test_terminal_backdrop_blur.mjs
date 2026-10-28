import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../gnome-shell/velora@wonderer.tech/', import.meta.url);
const src = await readFile(new URL('terminalBackdropBlur.js', root), 'utf8');
const runtime = await readFile(new URL('orbThemeRuntime.js', root), 'utf8');
const prefs = await readFile(new URL('prefs.js', root), 'utf8');
const schema = await readFile(new URL(
    'schemas/org.gnome.shell.extensions.velora.gschema.xml', root
), 'utf8');
const installer = await readFile(
    new URL('../gnome-shell/install.sh', import.meta.url), 'utf8'
);
const builder = await readFile(
    new URL('../tools/build_ego_release.py', import.meta.url), 'utf8'
);

class Signals {
    constructor() {this.signals = new Map(); this.next = 0;}
    connect(name, fn) {
        const id = ++this.next;
        this.signals.set(id, {name, fn});
        return id;
    }
    disconnect(id) {
        assert.ok(this.signals.delete(id), 'disconnect a live signal');
    }
    emit(name, ...args) {
        for (const {name: registered, fn} of [...this.signals.values()]) {
            if (registered === name)
                fn(this, ...args);
        }
    }
    count() {return this.signals.size;}
}
class Widget {
    constructor(props) {
        this.name = props.name;
        this.constraints = [];
        this.effects = [];
        this.destroyed = false;
    }
    set_clip_to_allocation(v) {this.clip = v;}
    add_constraint(v) {this.constraints.push(v);}
    clear_constraints() {this.constraints = [];}
    add_effect(v) {this.effects.push(v);}
    add_effect_with_name(name, effect) {
        this.effectName = name;
        this.add_effect(effect);
    }
    set_position(x, y) {this.position = [x, y];}
    set_size(w, h) {this.size = [w, h];}
    destroy() {this.destroyed = true;}
}
class StWidget extends Widget {}
class ClutterActor extends Widget {}
let failBindConstraint = false;
let failBlurEffect = false;
class BindConstraint {
    constructor(props) {
        if (failBindConstraint)
            throw new Error('Cannot bind to Meta.SurfaceActor');
        Object.assign(this, props);
    }
}
// Model the actual GNOME Shell 50 GObject property contract rather than a
// permissive JS mock. GNOME Shell 46 removed the 'sigma' property; previous
// test accepted it and incorrectly reported a working compositor path.
class BlurEffect {
    constructor(props) {
        if (failBlurEffect)
            throw new Error('GJS Shell.BlurEffect construction failed');
        const allowed = new Set(['radius', 'brightness', 'mode']);
        for (const key of Object.keys(props)) {
            if (!allowed.has(key))
                throw new Error('No property ' + key + ' on ShellBlurEffect');
        }
        if (!Number.isInteger(props.radius) || props.radius < 0)
            throw new Error('Invalid native BlurEffect radius');
        Object.assign(this, props);
        Object.seal(this);
    }
}

const Shell = {
    BlurEffect,
    BlurMode: {BACKGROUND: 'BACKGROUND'},
};
const Meta = {WindowType: {NORMAL: 0, DIALOG: 1}};
const Clutter = {
    Actor: ClutterActor,
    BindConstraint,
    BindCoordinate: {WIDTH: 'WIDTH', HEIGHT: 'HEIGHT'},
};
const St = {Widget: StWidget};
const windowManager = new Signals();
const display = new Signals();
let liveWindowActors = [];
const fakeGlobal = {
    window_manager: windowManager,
    display,
    get_window_actors() {return liveWindowActors;},
};

const stripped = src.replace(/^import .*?;\s*$/gm, '').replace(
    /^export /gm, ''
);
const api = new Function(
    'Clutter', 'Meta', 'Shell', 'St', 'global',
    stripped + '\nreturn {isPtyxisWindow, TerminalBackdropBlurManager};'
)(Clutter, Meta, Shell, St, fakeGlobal);

function meta(name, type = Meta.WindowType.NORMAL) {
    return {
        get_window_type: () => type,
        get_wm_class: () => name,
        get_wm_class_instance: () => null,
        get_gtk_application_id: () => null,
        get_frame_rect: () => ({x: 18, y: 24, width: 800, height: 600}),
        get_buffer_rect: () => ({x: 10, y: 20, width: 816, height: 620}),
    };
}
class WindowActor extends Signals {
    constructor(metaWindow, extraChildren = []) {
        super();
        this.metaWindow = metaWindow;
        this.surface = {
            get_name: () => 'native-ptyxis-surface',
        };
        this.children = [this.surface, ...extraChildren];
        this.opacity = 255;
    }
    get_meta_window() {return this.metaWindow;}
    get_texture() {return this.surface;}
    get_first_child() {return this.children[0];}
    get_children() {return this.children;}
    insert_child_at_index(child, index) {
        assert.equal(index, 0);
        this.children.splice(index, 0, child);
    }
    set_child_below_sibling(child, sibling) {
        assert.equal(sibling, null, 'blur is always bottom-most');
        const index = this.children.indexOf(child);
        assert.ok(index >= 0);
        this.children.splice(index, 1);
        this.children.unshift(child);
        this.bottomPinned = true;
    }
}
class Settings extends Signals {
    constructor() {
        super();
        this.values = new Map([
            ['terminal-backdrop-blur-enabled', false],
            ['terminal-backdrop-blur-radius', 18],
            ['terminal-backdrop-blur-status', 'Off'],
        ]);
    }
    get_boolean(key) {return this.values.get(key);}
    get_int(key) {return this.values.get(key);}
    get_string(key) {return this.values.get(key);}
    set_boolean(key, value) {
        this.values.set(key, value);
        this.emit('changed::' + key);
    }
    set_int(key, value) {
        this.values.set(key, value);
        this.emit('changed::' + key);
    }
    set_string(key, value) {
        this.values.set(key, value);
        this.emit('changed::' + key);
    }
}
assert.throws(
    () => new Shell.BlurEffect({
        sigma: 18, brightness: 1.0, mode: Shell.BlurMode.BACKGROUND,
    }),
    /No property sigma on ShellBlurEffect/,
    'the regression harness must reject obsolete GNOME Shell sigma'
);
assert.ok(
    new Shell.BlurEffect({
        radius: 36, brightness: 1.0, mode: Shell.BlurMode.BACKGROUND,
    }),
    'native GNOME 50 radius property is supported'
);

assert.equal(api.isPtyxisWindow(meta('org.gnome.Ptyxis')), true);
assert.equal(api.isPtyxisWindow(meta('ptyxis')), true);
assert.equal(api.isPtyxisWindow(meta('app.devsuite.Ptyxis')), true);
assert.equal(api.isPtyxisWindow(meta('Firefox')), false);
assert.equal(api.isPtyxisWindow(meta('Ptyxis', Meta.WindowType.DIALOG)), false);
assert.equal(api.isPtyxisWindow(meta('Ptyxis or Firefox')), false);
assert.equal(api.isPtyxisWindow(null), false);

const settings = new Settings();
const terminal = new WindowActor(meta('org.gnome.Ptyxis'));
const firefox = new WindowActor(meta('firefox'));
const conflict = new WindowActor(meta('ptyxis'), [
    {get_name: () => 'bms-application-blurred-widget'},
]);
liveWindowActors = [terminal, firefox, conflict];
const m = new api.TerminalBackdropBlurManager(settings);
m.setup();
assert.equal(m._windows.size, 0, 'feature off by default');
assert.equal(windowManager.count(), 0, 'no map watcher while disabled');
assert.equal(display.count(), 0, 'no window-created watcher while disabled');
assert.equal(terminal.children.length, 1);

settings.set_boolean('terminal-backdrop-blur-enabled', true);
assert.equal(m._windows.size, 1, 'only Ptyxis, not browsers/conflicts');
assert.equal(terminal.children.length, 2);
const {backdrop, effect} = m._windows.get(terminal);
assert.equal(terminal.children[0], backdrop, 'blur BEHIND native surface');
assert.equal(terminal.children[1], terminal.surface);
assert.equal(backdrop.name, 'velora-ptyxis-backdrop-blur');
assert.ok(backdrop instanceof StWidget,
    'GNOME BACKGROUND blur uses paintable St.Widget, not bare Clutter.Actor');
assert.equal(terminal.bottomPinned, true);
assert.equal(backdrop.effects[0], effect);
assert.equal(effect.mode, 'BACKGROUND');
assert.equal(effect.radius, 36, 'GNOME 46+ radius = legacy sigma × 2');
assert.equal('sigma' in effect, false, 'GNOME 50 has no sigma property');
assert.equal(backdrop.constraints.length, 2,
    'both dimension constraints required for a non-zero blur quad');
assert.equal(backdrop.constraints[0].source, terminal,
    'width must follow Meta.WindowActor, not ambiguous texture');
assert.equal(backdrop.constraints[0].coordinate, 'WIDTH');
assert.equal(backdrop.constraints[1].source, terminal);
assert.equal(backdrop.constraints[1].coordinate, 'HEIGHT');
assert.equal(backdrop.effectName, 'velora-terminal-background-blur');
assert.equal(terminal.opacity, 255, 'never fade glyphs/window actor');
assert.equal(firefox.opacity, 255, 'never touch unrelated windows');
assert.equal(windowManager.count(), 1);
assert.equal(display.count(), 1);

settings.set_int('terminal-backdrop-blur-radius', 26);
assert.equal(effect.radius, 52, 'native radius updates live without a new actor');
assert.equal(terminal.children.length, 2);
m._scan();
assert.equal(m._windows.size, 1, 'repeated scan is idempotent');

// GNOME 50 compatibility: a Meta.SurfaceActor may reject a sibling
// BindConstraint. Fall back to frame/buffer bounds, then track native
// allocation changes without a CPU screenshot or timer.
failBindConstraint = true;
const fallbackWindow = new WindowActor(meta('ptyxis'));
windowManager.emit('map', fallbackWindow);
assert.equal(m._windows.size, 2);
const fallback = m._windows.get(fallbackWindow);
assert.deepEqual(fallback.backdrop.position, [8, 4]);
assert.deepEqual(fallback.backdrop.size, [800, 600]);
assert.equal(fallback.backdrop.constraints.length, 0);
assert.equal(fallbackWindow.count(), 2, 'destroy + allocation signals');
failBindConstraint = false;

// Failure is now actionable, not the former generic "native attach
// failed" message. A failed actor must be destroyed immediately and never
// cause Shell-side listeners to leak.
failBlurEffect = true;
const failedWindow = new WindowActor(meta('ptyxis'));
windowManager.emit('map', failedWindow);
assert.equal(m._windows.has(failedWindow), false);
assert.match(m._lastAttachFailure, /create-blur-effect:.*construction failed/);
assert.equal(failedWindow.children.length, 1);
assert.equal(failedWindow.count(), 0);
failBlurEffect = false;

const added = new WindowActor(meta('ptyxis'));
windowManager.emit('map', added);
assert.equal(m._windows.size, 3, 'new window gets native blur');
assert.equal(added.children.length, 2);
const fromDisplay = new WindowActor(meta('org.gnome.Ptyxis'));
display.emit('window-created', {
    get_compositor_private: () => fromDisplay,
});
assert.equal(m._windows.size, 4);

added.emit('destroy');
assert.equal(m._windows.size, 3, 'native destroy removes ownership');
settings.set_boolean('terminal-backdrop-blur-enabled', false);
assert.equal(backdrop.destroyed, true, 'effect destroyed on disable');
assert.equal(m._windows.size, 0);
assert.equal(windowManager.count(), 0, 'no permanent map hook');
assert.equal(display.count(), 0, 'no permanent display hook');
assert.equal(settings.get_string('terminal-backdrop-blur-status'), 'Off');
assert.match(src, /visual unverified; check profile opacity/,
    'an attached compositor actor must not claim visible glass pixels');
assert.equal(terminal.opacity, 255);

m.cleanup();
assert.equal(settings.count(), 0, 'all settings signals cleaned up');
settings.set_boolean('terminal-backdrop-blur-enabled', true);
assert.equal(m._windows.size, 0, 'disabled manager cannot reattach');

assert.match(runtime, /new TerminalBackdropBlurManager\(this\._settings\)/);
assert.match(runtime, /this\._terminalBackdropBlurManager\?\.cleanup\(\)/);
assert.match(prefs, /title: 'Velora Terminal Glass — experimental'/);
assert.match(prefs, /terminal-backdrop-blur-enabled/);
assert.match(prefs, /terminal-backdrop-blur-radius/);
assert.match(prefs, /terminal-backdrop-blur-status/);
assert.match(schema,
    /<key name="terminal-backdrop-blur-enabled" type="b">\s*<default>false<\/default>/);
assert.match(schema, /<key name="terminal-backdrop-blur-radius" type="i">/);
assert.doesNotMatch(src, /\bsigma\s*:/,
    'never construct a GNOME 50 BlurEffect using the removed sigma property');
assert.doesNotMatch(src, /effect\.sigma\b/,
    'live blur updates must use native radius property');
assert.match(installer, /"terminalBackdropBlur.js"/);
assert.match(builder, /"terminalBackdropBlur.js"/);

assert.doesNotMatch(src,
    /set_window_opacity\s*\(|\.opacity\s*=|get_window_actor_opacity|Shell\.Screenshot|GLib\.timeout_add/,
    'no global window opacity, screenshots or timer-based capture');
console.log(
    'Ptyxis compositor BACKGROUND blur: disabled-by-default, matching, ' +
    'native surface order, live radius, conflicts, events, hot-swap cleanup PASS.'
);
