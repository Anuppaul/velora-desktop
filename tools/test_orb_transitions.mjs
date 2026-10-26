import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Execute the *shipped* GJS class methods with minimal GNOME actor mocks.
// This exercises the real layout/animation contracts without a display.
async function loadClass(path, type, injections = {}) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const body = source
        .replace(/^import\s[\s\S]*?;\s*$/gm, '')
        .replace(/^export\s+default\s+class\s+/gm, 'class ')
        .replace(/^export\s+class\s+/gm, 'class ');
    const keys = Object.keys(injections);
    return new Function(...keys, body + '\nreturn ' + type + ';')(
        ...Object.values(injections)
    );
}

const slots = [
    {x: 350, y: 280}, {x: 410, y: 350}, {x: 470, y: 420},
];
const sourceApps = ['One', 'Two', 'Three'];
const OrbRuntime = await loadClass(
    '../gnome-shell/velora@wonderer.tech/orbThemeRuntime.js',
    'VeloraRuntime', {
        Extension: class {},
        GLib: {get_monotonic_time: () => 1000000},
        Clutter: {AnimationMode: {EASE_OUT_QUAD: 1, EASE_IN_QUAD: 2}},
        collectOrbApps: () => sourceApps,
        effectiveRingGap: (_, gap) => gap,
        arcForPosition: () => 360,
        slotsForGeometry: () => [slots, []],
        totalCapacity: lengths => lengths.reduce((a, b) => a + b, 0),
        allocateAcrossRings: n => [n, 0],
        selectGeometrySlots: (ring, n) => ring.slice(0, n),
        clamp: (n, low, high) => Math.max(low, Math.min(high, n)),
    }
);

function createRuntime() {
    const runtime = new OrbRuntime();
    runtime._settings = {
        get_string: key => ({
            'orb-app-source': 'all',
            'ring-mode': '2',
            'orb-geometry': 'orbit',
        })[key],
        get_int: key => ({
            'orb-size': 50, 'icon-size': 40, 'icon-gap': 6,
            'ring-gap': 65, 'animation-ms': 220,
        })[key] ?? 0,
        get_strv: () => [],
    };
    runtime._appSystem = {};
    runtime._shellSettings = {};
    runtime._orb = {get_position: () => [100, 100]};
    runtime._layer = {add_child(actor) {actor.parent = this;}};
    runtime._radialActors = [];
    runtime._closingActors = new Set();
    runtime._geometryActors = [];
    runtime._orbPageIndex = 0;
    runtime._menuOpen = false;
    runtime._dragging = false;
    for (const method of [
        '_cancelOpenTimer', '_cancelCloseTimer', '_cancelOrbAutoHideTimer',
        '_cancelOrbAutoFadeTimer', '_restoreOrbOpacity', '_revealOrb',
        '_destroyClosingActors', '_cancelAppPreviewHide', '_hideAppPreview',
        '_setOrbVisualPseudoClass', '_syncOrbPageIndicator',
        '_createGeometryLinks', '_hideOrbPageIndicator',
        '_destroyGeometryActors', '_hideTooltip', '_scheduleOrbAutoHide',
        '_scheduleOrbAutoFade',
    ])
        runtime[method] = () => {};
    runtime._monitorAt = () => ({x: 0, y: 0, width: 1280, height: 720});
    runtime._createAppButton = () => ({
        x: 0, y: 0, opacity: 255, scale_x: 1, scale_y: 1,
        set_position(x, y) {this.x = x; this.y = y;},
        ease(options) {this.animation = options;},
        remove_all_transitions() {},
        show() {},
        destroy() {this.destroyed = true;},
        get_parent() {return this.parent;},
    });
    return runtime;
}

const runtime = createRuntime();
runtime._openMenu();
assert.equal(runtime._radialActors.length, 3);
for (const [i, actor] of runtime._radialActors.entries()) {
    assert.equal(actor.x, slots[i].x, 'fixed native slot x');
    assert.equal(actor.y, slots[i].y, 'fixed native slot y');
    assert.equal(actor.translation_x, 125 - slots[i].x - 20);
    assert.equal(actor.translation_y, 125 - slots[i].y - 20);
    assert.equal(actor.animation.translation_x, 0);
    assert.equal(actor.animation.translation_y, 0);
    assert.equal('x' in actor.animation, false, 'never animate layout x');
    assert.equal('y' in actor.animation, false, 'never animate layout y');
}
const pageSession = runtime._orbPageSession;
runtime._closeMenu(false);
for (const actor of runtime._closingActors) {
    assert.equal('x' in actor.animation, false, 'native closing transform');
    assert.equal('y' in actor.animation, false, 'no closing relayout');
    assert.equal(actor.animation.translation_x, 105 - actor.x);
    assert.equal(actor.animation.translation_y, 105 - actor.y);
}

const paging = createRuntime();
paging._orbPageSession = pageSession;
paging._openMenu(true);
for (const actor of paging._radialActors) {
    assert.equal(actor.opacity, 255, 'no blank page during switch');
    assert.equal(actor.scale_x, 1);
    assert.equal(actor.scale_y, 1);
    assert.equal(actor.translation_x, 0);
    assert.equal(actor.translation_y, 0);
    assert.equal(actor.animation, undefined, 'paging does not rerun radial entrance');
}

// Check that the native Overview shader radius does not toggle while the
// first Apps grid is opening or when switching between Overview states.
const Backdrop = await loadClass(
    '../gnome-shell/velora@wonderer.tech/appGridBackdrop.js',
    'AppGridBackdropManager', {
        Main: {
            layoutManager: {overviewGroup: {
                visible: true, mapped: true,
                add_style_class_name() {}, remove_style_class_name() {},
            }},
            overview: {visible: true},
        },
    }
);
const backdrop = new Backdrop();
const blurChanges = [];
backdrop._enabled = true;
backdrop._layer = {
    visible: false, show() {this.visible = true;},
    hide() {this.visible = false;},
};
backdrop._updateBlur = radius => blurChanges.push(radius);
for (const phase of ['showing', 'shown', null, 'hiding']) {
    backdrop._syncVisibility(phase);
    assert.equal(backdrop._layer.visible, true);
}
assert.deepEqual(blurChanges, [], 'no mid-transition blur invalidation');

// Expanding an All Apps page must initialize only its new shader batches;
// previously the first new batch re-applied appearance to the already visible
// Orb face, invalidating its texture on the very frame the menu appeared.
let clock = 5000000;
const updatedEffects = [];
const OrbGlass = await loadClass(
    '../gnome-shell/velora@wonderer.tech/orbGlass.js',
    'OrbGlassManager', {
        GLib: {get_monotonic_time: () => clock},
        frameDue: (now, last, fps) =>
            !last || now < last || now - last >= 1000000 / fps,
        VELORA_GLASS_ROLES: {orbCard: {tintStrength: 0}},
        VELORA_GLASS_ADAPTERS: {orb: {multiRegion: true}},
        applyVeloraGlassRole: effect => updatedEffects.push(effect.id),
        global: {stage: {width: 1280, height: 720}},
    }
);
const glass = new OrbGlass({
    vendor: {setSizeIfChanged() {this.writes++;}, writes: 0},
    settings: {get_double: () => 1},
    readAppearance: () => ({r: 255, g: 255, b: 255, blur: 7}),
});
glass._appearance = {r: 255, g: 255, b: 255, blur: 7};
glass._root = {visible: true, queue_redraw() {}, hide() {this.visible = false;}};
glass._batches = [{effect: {id: 0}}];
glass._createBatch = function(index) {
    const batch = {effect: {id: index}};
    this._batches.push(batch);
    return batch;
};
glass._ensureBatchCount(4);
assert.deepEqual(updatedEffects, [1, 2, 3], 'do not reset visible glass batch');
updatedEffects.length = 0;
glass.updateAppearance();
assert.deepEqual(updatedEffects, [0, 1, 2, 3], 'appearance settings still refresh every batch');

// For a moving expanded grid, bypass the stationary 30 FPS budget.
glass._lastRegionPassUs = clock;
glass._expandedRegionsActive = true;
glass._regionMotionActive = false;
glass._buttons = new Set();
glass._orbFace = null;
glass._syncRegions();
assert.equal(glass._vendor.writes, 0, 'stationary grid skips extra scan');
glass._regionMotionActive = true;
glass._syncRegions();
assert.equal(glass._vendor.writes, 1, 'moving grid runs on this frame');
console.log('Orb native transitions, glass expansion, and Overview blur tests passed.');
