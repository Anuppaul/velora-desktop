import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the shipped GNOME 50 three-island panel manager without a display.
// Keep the real GNOME boxes and buttons in place: only paint bounded, rounded
// PanelGlassSurface actors below Main.layoutManager.panelBox.
const source = (await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/topBarIslands.js', import.meta.url
), 'utf8')).replace(/^import[^\n]*\n/gm, '')
    .replace('export class TopBarIslands', 'class TopBarIslands');

let nextSignal = 1;
const stageSignals = new Map();
const stage = {
    connect(signal, fn) {
        assert.equal(signal, 'before-update');
        const id = nextSignal++;
        stageSignals.set(id, fn);
        return id;
    },
    disconnect(id) {stageSignals.delete(id);},
    tick() {for (const fn of [...stageSignals.values()]) fn();},
};

class Actor {
    constructor({x = 0, y = 0, width = 0, height = 0, children = []} = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.children = children;
        this.parent = null;
        this.visible = true;
        this.mapped = true;
        this.opacity = 255;
        this.classes = new Set();
        this.signals = new Map();
    }
    add_child(actor) {
        actor.parent?.remove_child(actor);
        actor.parent = this;
        this.children.push(actor);
    }
    insert_child_below(actor, sibling) {
        const index = this.children.indexOf(sibling);
        assert.ok(index >= 0);
        actor.parent?.remove_child(actor);
        actor.parent = this;
        this.children.splice(index, 0, actor);
    }
    remove_child(actor) {
        this.children = this.children.filter(x => x !== actor);
        if (actor.parent === this) actor.parent = null;
    }
    get_parent() {return this.parent;}
    get_children() {return this.children;}
    get_transformed_position() {
        const [px, py] = this.parent?.get_transformed_position?.() ?? [0, 0];
        return [this.x + px, this.y + py];
    }
    get_transformed_size() {return [this.width, this.height];}
    get_paint_opacity() {return this.opacity;}
    add_style_class_name(name) {this.classes.add(name);}
    remove_style_class_name(name) {this.classes.delete(name);}
    connect(signal, handler) {
        const id = nextSignal++;
        this.signals.set(id, {signal, handler});
        return id;
    }
    disconnect(id) {this.signals.delete(id);}
    emit(signal) {
        for (const entry of [...this.signals.values()])
            if (entry.signal === signal) entry.handler(this);
    }
}
const glassSurfaces = [];
class MockPanelGlassSurface {
    constructor(vendor, settings, appearance, options) {
        this.vendor = vendor;
        this.settings = settings;
        this.appearance = appearance;
        this.options = options;
        this._ready = false;
        this.visible = true;
        this.updates = 0;
        glassSurfaces.push(this);
    }
    attach(host, root) {
        this.material = new Actor();
        this.host = host;
        host.insert_child_below(this.material, root);
        return true;
    }
    setBounds(x, y, w, h, opacity) {
        this.bounds = {x, y, w, h, opacity};
        this.visible = true;
    }
    hide() {this.visible = false;}
    get ready() {return this._ready;}
    updateAppearance() {this.updates++;}
    destroy() {
        this.host?.remove_child(this.material);
        this.destroyed = true;
    }
}
const uiGroup = new Actor({x: 0, y: 0, width: 1920, height: 1080});
const panelBox = new Actor({x: 0, y: 0, width: 1920, height: 36});
uiGroup.add_child(panelBox);
const panel = new Actor({x: 0, y: 0, width: 1920, height: 36});
panelBox.add_child(panel);
panel._leftBox = new Actor({x: 0, y: 0, width: 122, height: 36,
    children: [{role: 'Activities'}]});
panel._centerBox = new Actor({x: 900, y: 0, width: 120, height: 36,
    children: [{role: 'DateMenu'}]});
panel._rightBox = new Actor({x: 1650, y: 0, width: 270, height: 36,
    children: [{role: 'QuickSettings'}, {role: 'Network'}, {role: 'Battery'}]});
for (const actor of [panel._leftBox, panel._centerBox, panel._rightBox])
    panel.add_child(actor);
const controls = [
    [...panel._leftBox.children], [...panel._centerBox.children],
    [...panel._rightBox.children],
];
const monitor = {index: 0, x: 0, y: 0, width: 1920, height: 1080};
const layout = new Actor();
layout.uiGroup = uiGroup;
layout.panelBox = panelBox;
layout.primaryMonitor = monitor;
const display = new Actor();
let fullscreen = false;
const TopBarIslands = new Function(
    'Main', 'global', 'PanelGlassSurface', 'primaryPanelIsFullscreen', 'console',
    source + '\nreturn TopBarIslands;'
)(
    {panel, layoutManager: layout},
    {stage, display},
    MockPanelGlassSurface,
    () => fullscreen,
    {log() {}, warn() {}}
);
const instance = new TopBarIslands({
    vendor: {}, settings: {}, readAppearance: () => ({opacity: 0.05}),
    panel, layout, display,
});
assert.equal(instance.setup(), true);
assert.equal(glassSurfaces.length, 3);
assert.equal(stageSignals.size, 1, 'one stage sync for all three islands');
assert.equal(instance._regions.length, 3);
assert.ok(panel.classes.has('vliq-three-islands'));
for (let i = 0; i < 3; i++) {
    const region = instance._regions[i];
    const group = [panel._leftBox, panel._centerBox, panel._rightBox][i];
    assert.equal(region.actor, group);
    assert.ok(group.classes.has('vliq-panel-island'));
    assert.equal(region.surface.options.cornerRadius, 16);
    assert.equal(region.surface.material.parent, uiGroup);
    assert.ok(uiGroup.children.indexOf(region.surface.material) <
        uiGroup.children.indexOf(panelBox),
    'Glass must be BEHIND the native panel and must never intercept input');
    assert.ok(region.surface.bounds.w < 500,
        'island must not become a full-width backplate');
    assert.ok(region.surface.bounds.h < 36,
        'island must float inside the native top-bar height');
    assert.deepEqual(group.children, controls[i],
        'GNOME native panel controls must never be reparented');
}
const [left, center, right] = instance._regions;
assert.ok(center.surface.bounds.x > left.surface.bounds.x +
    left.surface.bounds.w + 100, 'left and center are separate');
assert.ok(right.surface.bounds.x > center.surface.bounds.x +
    center.surface.bounds.w + 100, 'center and right are separate');

// The native CSS fallback stays until each GPU material has actually
// composited, then independently disappears for that single island.
left.surface._ready = true;
instance.sync();
assert.ok(left.actor.classes.has('vliq-panel-island-ready'));
assert.ok(!center.actor.classes.has('vliq-panel-island-ready'));
center.surface._ready = true;
right.surface._ready = true;
stage.tick();
assert.ok(center.actor.classes.has('vliq-panel-island-ready'));
assert.ok(right.actor.classes.has('vliq-panel-island-ready'));

// A late indicator and monitor width adjustment must be accounted for
// without a destructive rebuild or changing click ownership.
panel._rightBox.width += 36;
panel._rightBox.x -= 36;
panel._rightBox.add_child({role: 'late-system-indicator'});
panel._rightBox.emit('child-added');
assert.ok(right.surface.bounds.w > 270);
assert.deepEqual(panel._leftBox.children, controls[0]);
assert.equal(glassSurfaces.length, 3, 'no new shader on indicator changes');
layout.primaryMonitor.width = 1680;
panel._rightBox.x = 1440;
panel._rightBox.width = 240;
layout.emit('monitors-changed');
assert.ok(right.surface.bounds.x + right.surface.bounds.w <= 1674,
    'right island must fit within resized monitor');

// Individual empty boxes hide only their own material.
panel._centerBox.children = [];
stage.tick();
assert.equal(center.surface.visible, false);
assert.ok(center.actor.classes.has('vliq-panel-island-inactive'),
    'empty indicator group must not keep a CSS glass fallback');
assert.equal(left.surface.visible, true);
panel._centerBox.children = [...controls[1]];
stage.tick();
assert.equal(center.surface.visible, true);
assert.ok(!center.actor.classes.has('vliq-panel-island-inactive'),
    'repopulated native controls restore only their own island');

// Narrow displays and third-party indicators can make *glass padding*
// overlap while the native GNOME controls remain independent. Keep a true
// visible wallpaper gap without moving/click-blocking any controls.
const originalCenter = {x: panel._centerBox.x, y: panel._centerBox.y,
    width: panel._centerBox.width, height: panel._centerBox.height};
const originalRight = {x: panel._rightBox.x, width: panel._rightBox.width};
panel._centerBox.x = 1140;
panel._centerBox.width = 170;
panel._rightBox.x = 1250;
panel._rightBox.width = 290;
stage.tick();
assert.ok(
    right.surface.bounds.x -
    (center.surface.bounds.x + center.surface.bounds.w) >= 7.99,
    'overlapping native group allocations must keep an 8px glass gap'
);
assert.deepEqual(panel._centerBox.children, controls[1],
    'overlap repair must not mutate native Date Menu controls');
panel._centerBox.x = originalCenter.x;
panel._centerBox.width = originalCenter.width;
panel._rightBox.x = originalRight.x;
panel._rightBox.width = originalRight.width;

// A hidden GNOME indicator remains parented during session transitions.
// Do not leave a floating orphan-glass island behind invisible controls.
const dateControl = controls[1][0];
dateControl.visible = false;
stage.tick();
assert.equal(center.surface.visible, false,
    'hidden native controls must hide their glass immediately');
assert.ok(center.actor.classes.has('vliq-panel-island-inactive'),
    'hidden controls must clear their own painted fallback');
delete dateControl.visible;
stage.tick();
assert.equal(center.surface.visible, true);
assert.ok(!center.actor.classes.has('vliq-panel-island-inactive'));

// GNOME can stretch a panel box when adding status indicators. Fit the
// optical card to the real visible child allocation, not the empty box.
const dateActor = new Actor({x: 8, y: 8, width: 120, height: 20});
panel._centerBox.width = 410;
panel._centerBox.add_child(dateActor);
stage.tick();
assert.ok(center.surface.bounds.w <= 150,
    'glass should tightly fit the visible child, not a wide GNOME box');
assert.equal(center.surface.bounds.h, 32,
    'all three islands retain the native 36px panel height minus 2px inset');
panel._centerBox.remove_child(dateActor);
panel._centerBox.width = originalCenter.width;
stage.tick();

// Broken extensions sometimes report content extending below the panel.
// Never let a 3-island glass material bleed onto the desktop underneath.
panel._centerBox.y = -10;
panel._centerBox.height = 90;
stage.tick();
assert.ok(center.surface.bounds.h <= panelBox.height,
    'glass must be clipped to the real native top-panel height');
assert.ok(center.surface.bounds.y >= 0);
panel._centerBox.y = originalCenter.y;
panel._centerBox.height = originalCenter.height;
stage.tick();

instance.updateAppearance();
assert.deepEqual(glassSurfaces.map(s => s.updates), [1, 1, 1]);

// A fullscreen movie on the primary monitor must hide all islands; an
// independent visibility gate is honored even when the panel is mapped.
fullscreen = true;
display.emit('in-fullscreen-changed');
assert.ok(glassSurfaces.every(s => !s.visible));
fullscreen = false;
instance.setVisibilityGate(() => false);
assert.ok(glassSurfaces.every(s => !s.visible));
instance.setVisibilityGate(() => true);
assert.ok(glassSurfaces.every(s => s.visible));
panelBox.visible = false;
stage.tick();
assert.ok(glassSurfaces.every(s => !s.visible));
panelBox.visible = true;
stage.tick();
assert.ok(glassSurfaces.every(s => s.visible));

instance.cleanup();
assert.equal(stageSignals.size, 0);
assert.ok(glassSurfaces.every(s => s.destroyed));
assert.equal(uiGroup.children.filter(x => x !== panelBox).length, 0,
    'hot unload must remove all three glass actors');
for (const [index, group] of [
    panel._leftBox, panel._centerBox, panel._rightBox,
].entries()) {
    assert.ok(!group.classes.has('vliq-panel-island'));
    assert.ok(!group.classes.has('vliq-panel-island-inactive'),
        'no stale inactive glass class after hot-reload');
    assert.equal(group.children.length,
        controls[index].length + (index === 2 ? 1 : 0));
    for (let j = 0; j < controls[index].length; j++) {
        assert.equal(group.children[j], controls[index][j],
            'original GNOME panel input actors keep their identities');
    }
    if (index === 2)
        assert.equal(group.children.at(-1).role, 'late-system-indicator');
    assert.equal(group.signals.size, 0,
        'hot reload must not leak native actor signal handlers');
}
assert.ok(!panel.classes.has('vliq-three-islands'));
assert.equal(panel.signals.size, 0);
assert.equal(display.signals.size, 0);
assert.equal(layout.signals.size, 0);

const css = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
assert.match(css, /#panel\.vliq-liquid-top-panel\.vliq-three-islands/);
assert.match(css, /#panelLeft\.vliq-panel-island/);
assert.match(css, /#panelCenter\.vliq-panel-island/);
assert.match(css, /#panelRight\.vliq-panel-island/);
assert.match(css, /#panelLeft\.vliq-panel-island-ready/);
assert.match(css, /vliq-panel-island\.vliq-panel-island-inactive/,
    'inactive native glass islands need a transparent fallback');

const integration = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/liquidGlassDock.js',
    import.meta.url
), 'utf8');
const begin = integration.indexOf('    _setupTopPanelGlass() {');
const finish = integration.indexOf('    _setupNativeNotificationStyler() {', begin);
assert.ok(begin >= 0 && finish > begin);
const topSetup = integration.slice(begin, finish);
assert.match(topSetup, /new TopBarIslands\(/,
    'new top bar must use the three-island manager');
assert.doesNotMatch(topSetup, /new this\._vendor\.DashManager\(/,
    'do not recreate the old single full-width glass strip');
assert.match(integration, /this\._topPanelIslands\?\.updateAppearance\(\)/,
    'global Material Appearance must refresh all three island shaders');
const dynamicPanel = integration.indexOf(
    "'#panel.vliq-liquid-top-panel {"
);
assert.ok(dynamicPanel >= 0);
const dynamicPanelCss = integration.slice(dynamicPanel, dynamicPanel + 275);
assert.match(dynamicPanelCss, /background-color: transparent !important/,
    'dynamic CSS must keep the native full-width panel transparent');
assert.doesNotMatch(dynamicPanelCss, /background-color: rgba/,
    'global Appearance updates cannot repaint a full-width tint');

const installer = await readFile(new URL(
    '../gnome-shell/install.sh', import.meta.url
), 'utf8');
assert.match(installer, /"topBarIslands\.js"/,
    'split top bar must be included in hot-reload and Store ZIP packaging');
console.log('Top Bar: 3 rounded native glass islands, geometry, fullscreen, input ownership and teardown PASS.');
