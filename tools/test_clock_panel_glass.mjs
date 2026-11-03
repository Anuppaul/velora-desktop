import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// These tests exercise the real native PanelGlassSurface used by VLIQ's panel,
// together with the shipped Clock integration methods. No 104px preview card
// path is involved: the same bounded, damage-budgeted panel shader is reused.
const panelText = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/panelGlass.js', import.meta.url
), 'utf8');
const panelSource = panelText
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace('export class PanelGlassSurface', 'class PanelGlassSurface');
const integrationText = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/liquidGlassDock.js', import.meta.url
), 'utf8');
const methods = integrationText.match(
    /^    attachClockWidgetGlass\(target\) \{[\s\S]*?(?=^    attachPreviewGlass\(target\) \{)/m
)?.[0];
assert.ok(methods, 'Clock must have its own native-panel renderer methods');
assert.doesNotMatch(methods, /_previewGlassManager|attachWidget/,
    'Clock must not use the clipped preview renderer');

let signalId = 0;
const stageSignals = new Map();
const stage = {
    width: 1920, height: 1080,
    connect(name, handler) {
        assert.equal(name, 'before-update');
        const id = ++signalId;
        stageSignals.set(id, handler);
        return id;
    },
    disconnect(id) {stageSignals.delete(id);},
    tick() {for (const handler of stageSignals.values()) handler();},
};

class Actor {
    constructor() {
        this.parent = null;
        this.children = [];
        this.x = 0;
        this.y = 0;
        this.width = 1;
        this.height = 1;
        this.opacity = 255;
        this.visible = true;
        this.mapped = true;
        this.classes = new Set();
        this.classAdds = 0;
        this.classRemoves = 0;
    }
    add_child(child) {
        child.parent?.remove_child(child);
        this.children.push(child);
        child.parent = this;
    }
    remove_child(child) {
        this.children = this.children.filter(x => x !== child);
        if (child.parent === this) child.parent = null;
    }
    insert_child_below(child, sibling) {
        const index = this.children.indexOf(sibling);
        assert.ok(index >= 0, 'glass must be placed below the clock actor');
        child.parent?.remove_child(child);
        this.children.splice(index, 0, child);
        child.parent = this;
    }
    set_no_layout() {}
    set_clip_to_allocation() {}
    set_size(w, h) {this.width = w; this.height = h;}
    get_size() {return [this.width, this.height];}
    set_position(x, y) {this.x = x; this.y = y;}
    set_opacity(value) {this.opacity = value;}
    show() {this.visible = true;}
    hide() {this.visible = false;}
    get_parent() {return this.parent;}
    get_transformed_position() {
        const [px, py] = this.parent?.get_transformed_position?.() ?? [0, 0];
        return [this.x + px, this.y + py];
    }
    get_transformed_size() {return [this.width, this.height];}
    add_style_class_name(name) {this.classAdds++; this.classes.add(name);}
    remove_style_class_name(name) {this.classRemoves++; this.classes.delete(name);}
    add_effect(effect) {this.effect = effect;}
    queue_redraw() {}
    destroy() {
        this.parent?.remove_child(this);
        this.destroyed = true;
    }
}
class Effect {
    constructor() {
        this._shadersLoaded = false;
        this._diagCompositedPaintCount = 0;
        this._uniformValues = new Map();
        this._uniforms = {set: (key, value) =>
            this._uniformValues.set(key, value)};
    }
    setPadding(n) {this.padding = n;}
    setShadowMaxRadius(n) {this.shadowMaxRadius = n;}
    setIsDock(value) {this.isDock = value;}
    setMultiRegionMode(value) {this.multi = value;}
    setCornerRadius(value) {this.cornerRadius = value;}
    setSurfaceLightEnabled(value) {this.surfaceLight = value;}
    setLiveGeometryHook(callback) {this.paintHook = callback;}
    setResolution(w, h) {this.resolution = [w, h];}
    setGlassGeometry(x, y, w, h) {this.geometry = [x, y, w, h];}
}
class Scene {
    constructor() {this.syncs = 0;}
    setCullRect(rect) {this.cullRect = rect;}
    applyBgCloneClip(rect) {this.clip = rect;}
    sync() {this.syncs++;}
    destroy() {this.destroyed = true;}
}
const vendor = {
    root: '/fake-panel-vendor',
    UnpickableActor: Actor,
    LiquidEffect: Effect,
    WindowCloneManager: Scene,
    setSizeIfChanged(actor, w, h) {actor.set_size(w, h);},
    setTranslationIfChanged(actor, x, y) {
        actor.translation_x = x;
        actor.translation_y = y;
    },
};
const settings = {get_double: () => 1};
const appearance = {
    r: 255, g: 255, b: 255, opacity: 0.03, blur: 9,
};
let us = 1000000;
const PanelGlassSurface = new Function(
    'GLib', 'frameDue', 'VLIQ_GLASS_ROLES',
    'applyVLIQGlassRole', 'console', 'global',
    panelSource + '\nreturn PanelGlassSurface;'
)(
    {get_monotonic_time: () => us},
    (now, last, fps) => now - last >= 1000000 / fps,
    {dock: {}},
    (effect, role, options) => {
        effect.appearance = options;
        effect.setCornerRadius(options.cornerRadius);
    },
    {warn() {}},
    {stage}
);
const integrationClass = new Function(
    'PanelGlassSurface', 'global', 'console', 'appearance',
    'return class ClockPanelIntegration {\n' +
    'constructor() {\n' +
    '  this._vendor = null; this._settings = null;\n' +
    '  this._clockPanelGlass = null; this._clockPanelTarget = null;\n' +
    '  this._clockPanelFrameId = 0;\n' +
    '  this._calendarPanelGlass = null; this._calendarPanelTarget = null;\n' +
    '  this._calendarPanelFrameId = 0; this._calendarPanelReadyReported = false;\n' +
    '}\n' +
    '_readSharedCardAppearance() {return appearance;}\n' +
    methods + '\n}'
)(
    PanelGlassSurface, {stage}, {log() {}, warn() {}}, appearance
);
const group = new Actor();
const card = new Actor();
card.width = 296;
card.height = 148;
card.set_position(460, 160);
group.add_child(card);
const instance = new integrationClass();
instance._vendor = vendor;
instance._settings = settings;
assert.equal(instance.attachClockWidgetGlass(card), true);
assert.equal(stageSignals.size, 1, 'one stage frame hook for the clock');
const surface = instance._clockPanelGlass;
assert.ok(surface instanceof PanelGlassSurface,
    'Clock shares VLIQ native panel surface');
assert.equal(surface._material.parent, group,
    'native panel effect paints as a sibling below Clock');
assert.equal(group.children.indexOf(surface._material),
    group.children.indexOf(card) - 1);
assert.deepEqual(surface._material.get_size(), [296, 148],
    'glass bounds must match the complete card, not a 104px-margined subrect');
assert.equal(surface._effect.cornerRadius, 24);
assert.equal(surface._effect.shadowMaxRadius, 0);
assert.equal(surface._effect.padding, 0);
assert.equal(surface._effect.surfaceLight, true,
    'Clock must retain the global Dock glass Fresnel, sheen and specular lighting');
for (const uniform of ['ao_intensity', 'shadow_radius', 'shadow_intensity'])
    assert.equal(surface._effect._uniformValues.get(uniform), 0);
assert.equal(surface._effect._uniformValues.get('vliq_clock_straight_edge_guard'),
    1, 'straight-edge sheen is removed on the Clock only, not the global glass');

surface._material.mapped = true;
us += 50000;
stage.tick();
surface._effect.paintHook();
assert.deepEqual(surface._effect.resolution, [296, 148]);
assert.deepEqual(surface._effect.geometry, [0, 0, 296, 148],
    'full card LiquidEffect geometry, not clipped preview lens');
assert.ok(surface._sceneManager.syncs >= 1);
assert.deepEqual(surface._sceneManager.cullRect, [460, 160, 296, 148]);

assert.equal(card.classes.has('vliq-clock-panel-glass-ready'), false,
    'CSS fallback must remain until a real GPU composite completed');
surface._effect._shadersLoaded = true;
surface._effect._diagCompositedPaintCount = 1;
stage.tick();
assert.equal(card.classes.has('vliq-clock-panel-glass-ready'), true,
    'native glass becomes visible after the first real composite');

// This was the second repeated-rendering bug: every before-update stage
// callback re-added the SAME CSS glass-ready class and rewrote identical
// coordinates, invalidating GNOME's stylesheet and repainting the card.
let clockBoundsWrites = 0;
const originalClockBounds = surface.setBounds.bind(surface);
surface.setBounds = (...args) => {
    clockBoundsWrites++;
    return originalClockBounds(...args);
};
const clockAdds = card.classAdds;
const clockRemoves = card.classRemoves;
const clockSceneBefore = surface._sceneManager.syncs;
for (let i = 0; i < 8; i++) {
    us += 50000;
    stage.tick();
}
assert.equal(clockBoundsWrites, 0,
    'unchanged clock must not rewrite bounds on every compositor frame');
assert.equal(card.classAdds, clockAdds,
    'unchanged clock must not repeatedly add glass-ready class');
assert.equal(card.classRemoves, clockRemoves,
    'unchanged clock must not repeatedly remove glass-ready class');
assert.ok(surface._sceneManager.syncs > clockSceneBefore,
    'stable clock still receives live scene updates through syncFrame()');

appearance.opacity = 0.08;
appearance.blur = 17;
instance.updateClockWidgetGlass(card);
assert.equal(surface._effect.appearance.tintStrength, 0.08,
    'clock tint follows global Appearance setting');
assert.equal(surface._effect.appearance.baseBlur, 17,
    'clock blur follows global Appearance setting');
assert.equal(surface._effect._uniformValues.has('vliq_frost_amount'), false,
    'never override global MaterialSettings Frosted uniform');

// Calendar is a SECOND bounded glass surface. Turning it on must never
// destroy, displace or reconfigure the original Clock material.
const calendarCard = new Actor();
calendarCard.set_size(326, 342);
calendarCard.set_position(52, 220);
group.add_child(calendarCard);
assert.equal(instance.attachCalendarWidgetGlass(calendarCard), true);
assert.equal(stageSignals.size, 2,
    'Calendar and Clock each own one bounded render lifecycle');
const calendarGlass = instance._calendarPanelGlass;
assert.ok(calendarGlass instanceof PanelGlassSurface);
assert.deepEqual(calendarGlass._material.get_size(), [326, 342],
    'calendar native panel surface may be taller than a normal panel');
assert.equal(calendarGlass._effect.cornerRadius, 24);
assert.equal(calendarGlass._effect.surfaceLight, true);
calendarGlass._material.mapped = true;
us += 50000;
stage.tick();
calendarGlass._effect.paintHook();
assert.deepEqual(calendarGlass._effect.resolution, [326, 342]);
assert.deepEqual(calendarGlass._effect.geometry, [0, 0, 326, 342]);
assert.deepEqual(calendarGlass._sceneManager.cullRect,
    [52, 220, 326, 342]);
assert.equal(instance.updateCalendarWidgetGlass(calendarCard), true);
assert.equal(calendarGlass._effect.appearance.tintStrength, 0.08);
assert.equal(calendarGlass._effect.appearance.baseBlur, 17);
calendarGlass._effect._shadersLoaded = true;
calendarGlass._effect._diagCompositedPaintCount = 1;
us += 50000;
stage.tick();
assert.ok(calendarCard.classes.has('vliq-calendar-panel-glass-ready'));
let calendarBoundsWrites = 0;
const originalCalendarBounds = calendarGlass.setBounds.bind(calendarGlass);
calendarGlass.setBounds = (...args) => {
    calendarBoundsWrites++;
    return originalCalendarBounds(...args);
};
const calendarAdds = calendarCard.classAdds;
const calendarRemoves = calendarCard.classRemoves;
for (let i = 0; i < 8; i++) {
    us += 50000;
    stage.tick();
}
assert.equal(calendarBoundsWrites, 0,
    'unchanged calendar cannot rewrite native glass bounds per frame');
assert.equal(calendarCard.classAdds, calendarAdds,
    'unchanged calendar must not re-add readiness CSS every frame');
assert.equal(calendarCard.classRemoves, calendarRemoves,
    'unchanged calendar must not re-remove readiness CSS every frame');
assert.ok(instance._clockPanelGlass === surface,
    'calendar must not replace the clock material');
calendarCard.visible = false;
stage.tick();
assert.equal(calendarGlass._material.opacity, 0,
    'calendar glass must not remain over other windows');
assert.equal(surface._material.opacity, 255,
    'hiding calendar must not affect the Clock');
const calendarHideRemove = calendarCard.classRemoves;
for (let i = 0; i < 4; i++) {
    us += 50000;
    stage.tick();
}
assert.equal(calendarCard.classRemoves, calendarHideRemove,
    'hidden calendar must not repeatedly invalidate its CSS fallback');
calendarCard.visible = true;
us += 50000;
stage.tick();
assert.equal(calendarBoundsWrites, 1,
    'calendar must restore glass opacity once after being unhidden');
assert.ok(calendarCard.classes.has('vliq-calendar-panel-glass-ready'));
card.visible = false;
stage.tick();
assert.equal(surface._material.opacity, 0,
    'clock glass must hide with desktop clock, not overlay apps');
assert.equal(card.classes.has('vliq-clock-panel-glass-ready'), false);
card.visible = true;
stage.tick();
assert.equal(surface._material.opacity, 255,
    'glass reappears on desktop without logout');
instance.detachClockWidgetGlass(card);
assert.equal(stageSignals.size, 1,
    'Calendar must remain active after Clock is detached');
assert.equal(surface._material, null);
assert.equal(card.classes.has('vliq-clock-panel-glass-ready'), false);
instance.detachCalendarWidgetGlass(calendarCard);
assert.equal(stageSignals.size, 0, 'both widget stage hooks cleaned');
assert.equal(calendarGlass._material, null);

// The existing shared shader already clips rim highlights to opposite
// corners. This is what keeps horizontal edge streaks gone while global
// optical sheen and refraction remain enabled.
const shader = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/vendor/liquid-glass/shaders/glass.frag',
    import.meta.url
), 'utf8');
assert.match(shader, /float finalRimLight = rimShape \* cornerGlint/,
    'clock must reuse corner-clipped optical rim');
assert.match(shader, /specularLight \*= specMask \* cornerGlint/,
    'global specular highlights must remain corner-clipped');
assert.match(shader, /uniform float vliq_clock_straight_edge_guard;/,
    'clock-only shader uniform must exist');
assert.match(shader, /float clockStraightEdge = edgeBand \* \(1\.0 - cornerGlint\);/,
    'clock straight-edge sheen must be masked without removing broad interior sheen');
assert.match(shader, /sheenColor \*= 1\.0 - clamp\(vliq_clock_straight_edge_guard/,
    'existing global glass surfaces must retain their original sheen at default zero');

const css = await readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
assert.match(css,
    /\.vliq-clock-card\.vliq-clock-panel-glass-ready[\s\S]*?background-color:\s*transparent/,
    'only ready native-panel material reveals itself, never a static faux panel');
console.log('Clock native panel LiquidEffect: geometry, rendering, mode, fallback, hide and cleanup PASS.');
