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
class StWidget {
    constructor(props) {
        this.name = props.name;
        this.clipToAllocation = props.clip_to_allocation;
        this.constraints = [];
        this.effects = [];
        this.destroyed = false;
        this.visible = true;
    }
    set_position(x, y) {this.position = [x, y];}
    set_size(width, height) {this.size = [width, height];}
    set_clip(x, y, width, height) {this.clip = [x, y, width, height];}
    add_effect_with_name(name, effect) {
        this.effectName = name;
        this.effects.push(effect);
    }
    get_effects() {return [...this.effects];}
    get width() {return this.size?.[0] ?? 0;}
    get height() {return this.size?.[1] ?? 0;}
    hide() {this.visible = false;}
    show() {this.visible = true;}
    destroy() {this.destroyed = true;}
}
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
let failBlurEffect = false;
let failMask = false;
class TerminalBlurOutputMask {
    constructor() {this.frames = [];}
    updateFrame(width, height, radius) {
        if (failMask)
            throw new Error('Rounded-output mask unavailable');
        this.frames.push([width, height, radius]);
    }
}
const MASK_EFFECT_NAME = 'velora-ptyxis-rounded-output-mask';
const DEFAULT_CORNER_RADIUS = 12;
const Shell = {
    BlurEffect,
    GLSLEffect: class {},
    BlurMode: {BACKGROUND: 'BACKGROUND'},
};
const Meta = {WindowType: {NORMAL: 0, DIALOG: 1}};
const St = {Widget: StWidget};
const managerSignals = new Signals();
const displaySignals = new Signals();
let liveWindowActors = [];
const fakeGlobal = {
    window_manager: managerSignals,
    display: displaySignals,
    get_window_actors() {return liveWindowActors;},
};
const stripped = src.replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '');
const api = new Function(
    'Meta', 'Shell', 'St', 'global',
    'TerminalBlurOutputMask', 'DEFAULT_CORNER_RADIUS', 'MASK_EFFECT_NAME',
    stripped + '\nreturn {isPtyxisWindow, computeTerminalBlurFrame, terminalCornerRadius, TerminalBackdropBlurManager};'
)(Meta, Shell, St, fakeGlobal,
    TerminalBlurOutputMask, DEFAULT_CORNER_RADIUS, MASK_EFFECT_NAME);

function meta(name, type = Meta.WindowType.NORMAL) {
    const target = new Signals();
    target.frame = {x: 18, y: 24, width: 800, height: 600};
    target.buffer = {x: 10, y: 20, width: 816, height: 620};
    target.get_window_type = () => type;
    target.get_wm_class = () => name;
    target.get_wm_class_instance = () => null;
    target.get_gtk_application_id = () => null;
    target.get_frame_rect = () => ({...target.frame});
    target.get_buffer_rect = () => ({...target.buffer});
    return target;
}
class WindowActor extends Signals {
    constructor(metaWindow, extraChildren = []) {
        super();
        this.metaWindow = metaWindow;
        this.surface = {get_name: () => 'native-ptyxis-surface'};
        this.children = [this.surface, ...extraChildren];
        this.opacity = 255;
        this.width = 816;
        this.height = 620;
    }
    get_meta_window() {return this.metaWindow;}
    get_texture() {return this.surface;}
    get_children() {return this.children;}
    get_first_child() {return this.children[0];}
    get_width() {return this.width;}
    get_height() {return this.height;}
    insert_child_at_index(child, index) {
        assert.equal(index, 0);
        this.children.splice(index, 0, child);
    }
    set_child_below_sibling(child, sibling) {
        assert.equal(sibling, null, 'blur must be beneath the native surface');
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
    set_boolean(key, v) {this.values.set(key, v); this.emit('changed::' + key);}
    set_int(key, v) {this.values.set(key, v); this.emit('changed::' + key);}
    set_string(key, v) {this.values.set(key, v); this.emit('changed::' + key);}
}

const defaultWindow = new WindowActor(meta('ptyxis'));
const original = api.computeTerminalBlurFrame(
    defaultWindow.metaWindow, defaultWindow
);
assert.deepEqual(original, {x: 8, y: 4, width: 800, height: 600},
    'CSD shadows must be outside the painted frame');
assert.ok(original.x + original.width <= defaultWindow.width);
assert.ok(original.y + original.height <= defaultWindow.height);

const scaled = new WindowActor(meta('ptyxis'));
scaled.width = 408; scaled.height = 310; // 0.5 compositor-to-buffer scale
assert.equal(api.computeTerminalBlurFrame(scaled.metaWindow, scaled),
    null, 'GNOME 50 must NOT guess a scale from a transient actor allocation');
scaled.width = 816; scaled.height = 620;
assert.deepEqual(api.computeTerminalBlurFrame(scaled.metaWindow, scaled),
    {x: 8, y: 4, width: 800, height: 600},
    'GNOME 50 frame uses native frame minus buffer without guessed scaling');

const partial = new WindowActor(meta('ptyxis'));
partial.metaWindow.frame = {x: 3, y: 14, width: 800, height: 600};
assert.deepEqual(api.computeTerminalBlurFrame(partial.metaWindow, partial),
    {x: 0, y: 0, width: 793, height: 594},
    'overlapping frame outside buffer is intersected, never overdrawn');

const invalid = new WindowActor(meta('ptyxis'));
invalid.metaWindow.frame.width = 0;
assert.equal(api.computeTerminalBlurFrame(invalid.metaWindow, invalid), null);
invalid.metaWindow.frame.width = 800;
invalid.width = 10000;
assert.equal(api.computeTerminalBlurFrame(invalid.metaWindow, invalid), null,
    'wildly mismatched coordinate spaces must fail closed');

assert.throws(
    () => new Shell.BlurEffect({sigma: 18, brightness: 1, mode: 'BACKGROUND'}),
    /No property sigma on ShellBlurEffect/
);
assert.equal(api.isPtyxisWindow(meta('ptyxis')), true);
assert.equal(api.isPtyxisWindow(meta('org.gnome.Ptyxis')), true);
assert.equal(api.isPtyxisWindow(meta('Firefox')), false);
assert.equal(api.isPtyxisWindow(meta('Ptyxis', Meta.WindowType.DIALOG)), false);

const settings = new Settings();
const terminal = defaultWindow;
const browser = new WindowActor(meta('firefox'));
const conflict = new WindowActor(meta('ptyxis'), [
    {get_name: () => 'bms-application-blurred-widget'},
]);
liveWindowActors = [terminal, browser, conflict];
const manager = new api.TerminalBackdropBlurManager(settings);
manager.setup();
assert.equal(manager._windows.size, 0);
assert.equal(managerSignals.count(), 0, 'opt-out must not observe windows');

settings.set_boolean('terminal-backdrop-blur-enabled', true);
assert.equal(manager._windows.size, 1, 'only non-conflicting Ptyxis matches');
const {backdrop, effect, mask} = manager._windows.get(terminal);
assert.ok(backdrop instanceof StWidget);
assert.equal(mask instanceof TerminalBlurOutputMask, true);
assert.deepEqual(backdrop.get_effects(), [mask, effect],
    'rounded output mask must process final background blur pixels');
assert.deepEqual(mask.frames.at(-1), [800, 600, 12]);
assert.equal(api.terminalCornerRadius(terminal.metaWindow), 12);
terminal.metaWindow.is_fullscreen = () => true;
assert.equal(api.terminalCornerRadius(terminal.metaWindow), 0);
delete terminal.metaWindow.is_fullscreen;
assert.equal(terminal.children[0], backdrop);
assert.equal(terminal.children[1], terminal.surface);
assert.equal(terminal.bottomPinned, true);
assert.deepEqual(backdrop.position, [8, 4], 'shadow margin must be excluded');
assert.deepEqual(backdrop.size, [800, 600], 'blur must fit visible frame');
assert.deepEqual(backdrop.clip, [0, 0, 800, 600],
    'scissor explicitly prevents GPU blur halo outside frame');
assert.equal(backdrop.clipToAllocation, true);
assert.equal(backdrop.visible, true);
assert.equal(backdrop.constraints.length, 0,
    'whole WindowActor WIDTH/HEIGHT binding is forbidden');
assert.equal(effect.mode, 'BACKGROUND');
assert.equal(effect.radius, 36);
assert.equal('sigma' in effect, false);
assert.equal(terminal.opacity, 255);
assert.equal(browser.opacity, 255);
assert.equal(managerSignals.count(), 1);
assert.equal(displaySignals.count(), 1);
assert.equal(terminal.metaWindow.count(), 2,
    'window resize and position listeners installed');
assert.equal(terminal.count(), 2, 'actor allocation and destroy listened to');
assert.match(settings.get_string('terminal-backdrop-blur-status'),
    /Masked: 1.*visual unverified/);

settings.set_int('terminal-backdrop-blur-radius', 26);
assert.equal(effect.radius, 52);
manager._scan();
assert.equal(manager._windows.size, 1, 'no duplicate actors');

// Resize and restore must update both quad and clip; old widget incorrectly
// continued blurring shadow margins or retained stale full-window geometry.
terminal.metaWindow.frame.width = 740;
terminal.metaWindow.frame.height = 540;
terminal.metaWindow.emit('size-changed');
assert.deepEqual(backdrop.size, [740, 540]);
assert.deepEqual(backdrop.clip, [0, 0, 740, 540]);
assert.deepEqual(mask.frames.at(-1), [740, 540, 12]);
assert.deepEqual(backdrop.position, [8, 4]);

terminal.metaWindow.frame.x = 22; // buffer.x remains 10
terminal.metaWindow.emit('position-changed');
assert.deepEqual(backdrop.position, [12, 4]);

// Invalid geometry must hide backdrop: never redraw an oversized stale quad.
terminal.metaWindow.frame.width = 0;
terminal.metaWindow.emit('size-changed');
assert.equal(backdrop.visible, false);
assert.match(settings.get_string('terminal-backdrop-blur-status'),
    /Paused: invalid Ptyxis frame geometry/);
terminal.metaWindow.frame.width = 740;
terminal.metaWindow.emit('size-changed');
assert.equal(backdrop.visible, true);
assert.deepEqual(backdrop.clip, [0, 0, 740, 540]);

const fractional = new WindowActor(meta('ptyxis'));
fractional.width = 408;
fractional.height = 310;
managerSignals.emit('map', fractional);
assert.equal(manager._windows.size, 1);
assert.equal(manager._windows.has(fractional), false,
    'transient scaling may NOT attach oversized background blur');

failBlurEffect = true;
const failed = new WindowActor(meta('ptyxis'));
managerSignals.emit('map', failed);
assert.equal(manager._windows.has(failed), false);
assert.equal(failed.metaWindow.count(), 0, 'failed attach clears geometry hooks');
assert.equal(failed.count(), 0, 'failed attach clears actor hooks');
assert.equal(failed.children.length, 1);
assert.match(manager._lastAttachFailure, /create-blur-effect/);
failBlurEffect = false;

// No blur may be rendered if the rounded post-mask is unavailable. Never
// fall back to a square or full-buffer blur in a Wayland session.
failMask = true;
const missingMask = new WindowActor(meta('ptyxis'));
managerSignals.emit('map', missingMask);
assert.equal(manager._windows.has(missingMask), false);
assert.equal(missingMask.children.length, 1);
assert.equal(missingMask.metaWindow.count(), 0);
assert.equal(missingMask.count(), 0);
assert.match(manager._lastAttachFailure, /create-output-mask:.*mask unavailable/);
failMask = false;

const added = new WindowActor(meta('org.gnome.Ptyxis'));
displaySignals.emit('window-created', {
    get_compositor_private: () => added,
});
assert.equal(manager._windows.size, 2);
added.emit('destroy');
assert.equal(manager._windows.size, 1);
assert.equal(added.metaWindow.count(), 0, 'window destruction disconnects hooks');

settings.set_boolean('terminal-backdrop-blur-enabled', false);
assert.equal(backdrop.destroyed, true);
assert.equal(manager._windows.size, 0);
assert.equal(terminal.metaWindow.count(), 0);
assert.equal(terminal.count(), 0);
assert.equal(fractional.metaWindow.count(), 0);
assert.equal(managerSignals.count(), 0);
assert.equal(displaySignals.count(), 0);
assert.equal(settings.get_string('terminal-backdrop-blur-status'), 'Off');
assert.equal(terminal.opacity, 255);
manager.cleanup();
assert.equal(settings.count(), 0, 'hot-swap releases settings listeners');

assert.match(runtime, /new TerminalBackdropBlurManager\(this\._settings\)/);
assert.match(runtime, /this\._terminalBackdropBlurManager\?\.cleanup\(\)/);
assert.match(prefs, /Velora Terminal Glass — experimental/);
assert.match(schema, /<key name="terminal-backdrop-blur-enabled" type="b">\s*<default>false<\/default>/);
assert.match(installer, /"terminalBackdropBlur.js"/);
assert.match(builder, /"terminalBackdropBlur.js"/);
assert.match(src, /backdrop\.set_clip\(0, 0, next\.width, next\.height\)/);
assert.match(src, /new TerminalBlurOutputMask\(\)/);
assert.match(src, /order\[0\] !== mask/);
assert.match(installer, /"terminalBlurMask\.js"/);
assert.match(builder, /"terminalBlurMask\.js"/);
assert.doesNotMatch(src, /Clutter\.BindConstraint|\beffect\.sigma\b|\bsigma\s*:/,
    'never blur whole WindowActor or use obsolete GNOME sigma API');
assert.doesNotMatch(src,
    /set_window_opacity\s*\(|\.opacity\s*=|Shell\.Screenshot|GLib\.timeout_add/,
    'never fade window contents, screen capture or poll');
console.log('Ptyxis clipped blur: frame/buffer intersection, fractional scaling, ' +
    'live resize/move, invalid frame hide, lifecycle isolation PASS.');
