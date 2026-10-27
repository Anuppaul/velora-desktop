import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Verify the actual shipped Velora Dock Preferences helper and its bindings.
// This mock models the real Gio.Settings signals and Adw property notifications;
// it does not require a user's GNOME session or modify system GSettings.
const src = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/nativeDockPreferences.js',
    import.meta.url
), 'utf8');
const prefs = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/prefs.js',
    import.meta.url
), 'utf8');
const install = await readFile(new URL(
    '../gnome-shell/install.sh', import.meta.url
), 'utf8');

const mod = new Function(src.replace(/^export\s+/gm, '') +
    '\nreturn {openUbuntuDockSettings, addUbuntuDockPreferences, UBUNTU_DOCK_SCHEMA};')();
assert.equal(mod.UBUNTU_DOCK_SCHEMA,
    'org.gnome.shell.extensions.dash-to-dock');
assert.match(prefs, /import \{addUbuntuDockPreferences\} from '\.\/nativeDockPreferences\.js';/);
assert.match(prefs, /addUbuntuDockPreferences\(dockPage, Gio, Gtk, Adw\)/);
assert.match(install, /HOT_AUX_FILES=\([\s\S]*"nativeDockPreferences\.js"/,
    'canonical installer must copy new prefs helper');
assert.match(install, /installed_file in[\s\S]*nativeDockPreferences\.js/);

const boolKeys = [
    'dock-fixed', 'intellihide', 'autohide', 'manualhide',
    'require-pressure-to-show', 'autohide-in-fullscreen',
    'extend-height', 'always-center-icons', 'multi-monitor',
    'icon-size-fixed', 'custom-theme-shrink',
    'show-favorites', 'show-running', 'show-trash', 'show-mounts',
    'show-mounts-network', 'show-show-apps-button',
    'show-windows-preview', 'isolate-workspaces',
    'isolate-monitors', 'hot-keys', 'show-dock-urgent-notify',
];
const doubleKeys = [
    'pressure-threshold', 'show-delay', 'hide-delay',
    'animation-time', 'height-fraction',
];
const intKeys = ['dash-max-icon-size'];
const enumKeys = [
    'dock-position', 'intellihide-mode', 'click-action',
    'scroll-action', 'running-indicator-style',
];
const keys = [...boolKeys, ...doubleKeys, ...intKeys, ...enumKeys];
const nativeState = new Map(keys.map(key => [key,
    boolKeys.includes(key) ? false :
    doubleKeys.includes(key) ? 0.2 : 0]));
for (const [key, value] of [
    ['autohide', true], ['intellihide', true],
    ['require-pressure-to-show', true],
    ['show-favorites', true], ['show-running', true],
    ['dock-position', 2], ['intellihide-mode', 1],
    ['pressure-threshold', 100], ['dash-max-icon-size', 48],
    ['height-fraction', 0.9], ['show-delay', 0.25],
]) nativeState.set(key, value);

class Evented {
    constructor(props = {}) {
        Object.assign(this, props);
        this.handlers = new Map();
        this.sensitive = true;
    }
    connect(signal, fn) {
        const list = this.handlers.get(signal) ?? [];
        list.push(fn);
        this.handlers.set(signal, list);
        return list.length;
    }
    emit(signal) {
        for (const fn of this.handlers.get(signal) ?? [])
            fn(this, signal);
    }
}
class Group extends Evented {
    constructor(props) {
        super(props);
        this.rows = [];
    }
    add(row) {this.rows.push(row);}
}
class Combo extends Evented {
    constructor(props) {
        super(props);
        this._selected = 0;
    }
    get selected() {return this._selected;}
    set selected(value) {
        this._selected = value;
        this.emit('notify::selected');
    }
}
class Spin extends Evented {
    constructor(props) {
        super(props);
        this._value = props.adjustment.value;
    }
    get value() {return this._value;}
    set value(next) {
        this._value = next;
        this.emit('notify::value');
    }
}
class Switch extends Evented {
    constructor(props) {
        super(props);
        this._active = false;
    }
    get active() {return this._active;}
    set active(value) {
        this._active = value;
        this.emit('notify::active');
    }
}
class Action extends Evented {
    add_suffix(child) {this.suffix = child;}
}
class Button extends Evented {
    click() {this.emit('clicked');}
}
const Adw = {PreferencesGroup: Group, ActionRow: Action,
    ComboRow: Combo, SpinRow: Spin, SwitchRow: Switch};
const Gtk = {Adjustment: class {constructor(p) {Object.assign(this,p);}},
    StringList: {new: values => values},
    Button,
    Align: {CENTER: 'center'},
};
class NativeSettings {
    constructor(state = nativeState) {
        this.state = new Map(state);
        this.settings_schema = {has_key: key => this.state.has(key)};
        this.events = new Map();
        this.calls = [];
        this.batching = false;
        this.pending = new Set();
    }
    connect(event, fn) {
        const listeners = this.events.get(event) ?? [];
        listeners.push(fn);
        this.events.set(event, listeners);
        return listeners.length;
    }
    emitChange(key) {
        for (const handler of this.events.get('changed::' + key) ?? [])
            handler(this, key);
    }
    read(key) {
        assert.ok(this.state.has(key), 'unsupported native key read: ' + key);
        return this.state.get(key);
    }
    write(key, value) {
        assert.ok(this.state.has(key), 'unsupported native key write: ' + key);
        if (this.state.get(key) === value)
            return;
        this.state.set(key, value);
        this.calls.push([key, value]);
        if (this.batching)
            this.pending.add(key);
        else
            this.emitChange(key);
    }
    get_boolean(k) {return this.read(k);}
    get_double(k) {return this.read(k);}
    get_int(k) {return this.read(k);}
    get_enum(k) {return this.read(k);}
    set_boolean(k, v) {this.write(k, v);}
    set_double(k, v) {this.write(k, v);}
    set_int(k, v) {this.write(k, v);}
    set_enum(k, v) {this.write(k, v);}
    bind(key, row, prop) {
        assert.equal(prop, 'active');
        row.active = this.read(key);
        row.connect('notify::active', () =>
            this.set_boolean(key, row.active));
        this.connect('changed::' + key,
            () => {row.active = this.read(key);});
    }
    delay() {
        assert.equal(this.batching, false);
        this.batching = true;
    }
    apply() {
        assert.equal(this.batching, true);
        this.batching = false;
        for (const key of this.pending)
            this.emitChange(key);
        this.pending.clear();
    }
}
const Gio = {
    SettingsBindFlags: {DEFAULT: 0},
    SettingsSchemaSource: {get_default() {
        return {lookup(name) {
            return name === mod.UBUNTU_DOCK_SCHEMA
                ? {has_key: key => nativeState.has(key)}
                : null;
        }};
    }},
    Settings: class extends NativeSettings {
        constructor({settings_schema}) {
            super(nativeState);
            this.settings_schema = settings_schema;
        }
    },
};
const page = {groups: [], add(group) {this.groups.push(group);}};
const native = new NativeSettings();
assert.equal(mod.addUbuntuDockPreferences(page, Gio, Gtk, Adw, native),
    native);
assert.equal(native.calls.length, 0,
    'opening Velora Dock settings must never write native Ubuntu defaults');
assert.ok(page.groups.length >= 4);
const findRow = title => page.groups.flatMap(g => g.rows)
    .find(row => row.title === title);
const row = title => {
    const found = findRow(title);
    assert.ok(found, 'missing native Dock UI: ' + title);
    return found;
};

// Three native visibility modes stay independent, no second hide state.
assert.equal(row('Auto-hide at screen edge').active, true);
assert.equal(row('Intelligent hide').active, true);
assert.equal(row('Always visible').active, false);
assert.equal(row('Hide when').selected, 1);
assert.equal(row('Dock position').selected, 2);
assert.equal(row('Pressure threshold').value, 100,
    'pressure-threshold is a double, not an integer');
assert.equal(row('Maximum icon size').value, 48);

// External Ubuntu/system GSettings changes must reflect in Velora.
native.set_boolean('dock-fixed', true);
assert.equal(row('Always visible').active, true);
assert.equal(row('Auto-hide at screen edge').sensitive, false);
assert.equal(row('Intelligent hide').sensitive, false);
native.set_boolean('dock-fixed', false);
assert.equal(row('Auto-hide at screen edge').sensitive, true);
native.set_boolean('autohide', false);
assert.equal(row('Require edge pressure').sensitive, false);
native.set_boolean('autohide', true);
assert.equal(row('Require edge pressure').sensitive, true);

row('Require edge pressure').active = false;
assert.equal(native.get_boolean('require-pressure-to-show'), false);
row('Dock position').selected = 1;
assert.equal(native.get_enum('dock-position'), 1);
native.set_enum('dock-position', 3);
assert.equal(row('Dock position').selected, 3,
    'external native enum changes reflect in Velora');
row('Maximum icon size').value = 56;
assert.equal(native.get_int('dash-max-icon-size'), 56);
row('Reveal delay (seconds)').value = 0.6;
assert.equal(native.get_double('show-delay'), 0.6);
row('Pressure threshold').value = 130.5;
assert.equal(native.get_double('pressure-threshold'), 130.5);
row('Show Trash').active = true;
assert.equal(native.get_boolean('show-trash'), true);
row('Click on a running application').selected = 6;
assert.equal(native.get_enum('click-action'), 6);

// Restore is explicitly user-triggered and operates atomically in the
// native schema (no intermediary Velora setting or duplicate dock engine).
native.set_boolean('dock-fixed', true);
native.set_boolean('manualhide', true);
native.set_boolean('intellihide', false);
native.set_boolean('autohide', false);
native.set_boolean('require-pressure-to-show', true);
const restore = row('Restore Intelligent Auto-hide');
const before = native.calls.length;
restore.suffix.click();
assert.equal(native.batching, false);
assert.deepEqual(
    native.calls.slice(before),
    [
        ['manualhide', false], ['dock-fixed', false],
        ['intellihide', true], ['autohide', true],
        ['require-pressure-to-show', false],
    ]
);
assert.equal(row('Always visible').active, false);
assert.equal(row('Auto-hide at screen edge').active, true);
assert.equal(row('Intelligent hide').active, true);
assert.equal(row('Require edge pressure').active, false);

// Unsupported distro keys must be omitted, not crash, and a missing
// Ubuntu Dock schema must display an actionable info card.
const minimal = new NativeSettings(new Map([['dock-fixed', false]]));
const minPage = {groups: [], add(group) {this.groups.push(group);}};
mod.addUbuntuDockPreferences(minPage, Gio, Gtk, Adw, minimal);
assert.equal(minimal.calls.length, 0);
assert.ok(minPage.groups.length >= 3);
const noPage = {groups: [], add(group) {this.groups.push(group);}};
assert.equal(mod.addUbuntuDockPreferences(noPage, Gio, Gtk, Adw, null),
    null);
assert.match(noPage.groups[0].rows[0].subtitle,
    /Install or enable Ubuntu Dock/);
console.log('Native Ubuntu Dock Preferences, live GSettings, typed enums/delays, no defaults mutation, restore and fallback PASS.');
