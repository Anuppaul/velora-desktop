import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Reproduce: Browser foreground → Super (Overview) → Calendar.
// Mutter's window actor may remain individually visible even though its
// ancestor desktop windowGroup is hidden; the popup must never sample it.
// Execute the SHIPPED methods rather than a copy of their logic.
const popup = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/popupGlass.js',
    import.meta.url
), 'utf8');
const clones = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/vendor/liquid-glass/dist/capture/windowClones.js',
    import.meta.url
), 'utf8');

function extractMethod(source, signature, nextMarker) {
    const begin = source.indexOf('    ' + signature + ' {');
    assert.ok(begin >= 0, 'missing real method ' + signature);
    const end = source.indexOf(nextMarker, begin);
    assert.ok(end > begin, 'missing real end marker for ' + signature);
    return source.slice(begin, end);
}

const setCaptureCode = extractMethod(
    clones, 'setWindowCaptureEnabled(enabled)', '\n    /**'
);
const setCapture = new Function(
    'return ({' + setCaptureCode + '}).setWindowCaptureEnabled;'
)();
const Main = {overview: {visible: false, visibleTarget: false}};
const popupMethodCode = extractMethod(
    popup, '_syncOverviewWindowCapture()', '\n    syncFrame() {'
);
const syncOverview = new Function(
    'Main',
    'return ({' + popupMethodCode + '})._syncOverviewWindowCapture;'
)(Main);

// Native windows and wallpaper remain allocated across the Overview
// transition; only the dedicated scene window subtree toggles visibility.
const observations = [];
const mirror = {name: 'wallpaper-background-mirror', visible: true};
const windowContainer = {
    visible: true,
    show() {this.visible = true; observations.push('windows-show');},
    hide() {this.visible = false; observations.push('windows-hide');},
};
const sceneActor = {
    queue_redraw() {observations.push('scene-redraw');},
};
const scene = {
    _windowCaptureEnabled: true,
    windowClonesContainer: windowContainer,
    bgClone: mirror,
    container: sceneActor,
    setWindowCaptureEnabled: setCapture,
};
const glassRoot = {queue_redraw() {observations.push('root-redraw');}};
const effect = {queue_repaint() {observations.push('effect-repaint');}};
const inner = {queue_redraw() {observations.push('inner-redraw');}};
const popupSurface = {
    _sceneManager: scene,
    _overviewWindowCaptureEnabled: null,
    _lastSceneSyncUs: 712,
    _lastFullSyncUs: 723,
    _fullSyncDirty: false,
    _root: glassRoot,
    _effect: effect,
    _dateInnerRoot: inner,
};

// Browser on normal desktop: native live clones remain enabled.
assert.equal(syncOverview.call(popupSurface), false);
assert.equal(windowContainer.visible, true);
assert.equal(mirror.visible, true);
assert.deepEqual(observations, [],
    'normal Calendar still displays live background windows');

// Super opens Overview, before the user clicks the calendar clock.
Main.overview.visibleTarget = true;
assert.equal(syncOverview.call(popupSurface), true);
assert.equal(scene._windowCaptureEnabled, false);
assert.equal(windowContainer.visible, false,
    'do not render full-size Browser web contents in Calendar glass');
assert.equal(mirror.visible, true, 'wallpaper remains paintable');
assert.deepEqual(observations, [
    'windows-hide', 'scene-redraw', 'root-redraw',
    'effect-repaint', 'inner-redraw',
], 'source FBO and nested Date Material repaint exactly once');
assert.equal(popupSurface._lastSceneSyncUs, 0);
assert.equal(popupSurface._lastFullSyncUs, 0);
assert.equal(popupSurface._fullSyncDirty, true);
const cached = observations.length;
for (let i = 0; i < 120; i++)
    assert.equal(syncOverview.call(popupSurface), false);
assert.equal(observations.length, cached,
    'no repeated redraw or new polling when Overview is stationary');

// During Overview opening GNOME can flip visibleTarget / visible separately.
Main.overview.visible = true;
Main.overview.visibleTarget = false;
assert.equal(syncOverview.call(popupSurface), false);
assert.equal(windowContainer.visible, false);
assert.equal(observations.length, cached);

// Once Overview hides, restore the SAME live clone subtree, no rebuild
// or black-first-frame wallpaper loss.
Main.overview.visible = false;
assert.equal(syncOverview.call(popupSurface), true);
assert.equal(scene._windowCaptureEnabled, true);
assert.equal(windowContainer.visible, true);
assert.equal(scene.bgClone, mirror);
assert.equal(observations.at(-5), 'windows-show');
assert.equal(observations.at(-4), 'scene-redraw');
assert.equal(observations.at(-3), 'root-redraw');
assert.equal(observations.at(-2), 'effect-repaint');
assert.equal(observations.at(-1), 'inner-redraw');
assert.equal(syncOverview.call(popupSurface), false);

// If Calendar is first opened WHILE Super/Overview is already active,
// discard the Browser source before the first full scene capture/paint.
const startupEvents = [];
const newScene = {
    _windowCaptureEnabled: true,
    windowClonesContainer: {
        show() {startupEvents.push('show');},
        hide() {startupEvents.push('hide');},
    },
    container: {queue_redraw() {startupEvents.push('redraw');}},
    setWindowCaptureEnabled: setCapture,
};
Main.overview.visibleTarget = true;
const prewarm = {
    _sceneManager: newScene,
    _overviewWindowCaptureEnabled: null,
    _lastSceneSyncUs: 9,
    _lastFullSyncUs: 9,
    _fullSyncDirty: false,
};
assert.equal(syncOverview.call(prewarm), true);
assert.deepEqual(startupEvents, ['hide', 'redraw']);
assert.equal(prewarm._lastSceneSyncUs, 0);

// Fallback should be harmless if GNOME changes its Overview properties,
// vendor manager is missing, or an already-destroyed popup is syncing.
const disconnected = {
    _sceneManager: null,
    _overviewWindowCaptureEnabled: null,
};
assert.equal(syncOverview.call(disconnected), false);
assert.equal(disconnected._overviewWindowCaptureEnabled, false);

// The popup source must check before the FPS gate, and also on first full
// layout. NEVER mutate actor subtrees from the paint-time uniform path.
const syncFrame = popup.slice(
    popup.indexOf('    syncFrame() {'),
    popup.indexOf('    _measure() {')
);
const beforeThrottle = syncFrame.indexOf('this._syncOverviewWindowCapture()');
const afterThrottle = syncFrame.indexOf('this._lastFullSyncUs > 0');
assert.ok(beforeThrottle >= 0 && beforeThrottle < afterThrottle,
    'Overview changes bypass the scene-FPS throttle');
const syncFull = popup.slice(
    popup.indexOf('    _sync(shaderOnly) {'),
    popup.indexOf('    _syncShaderGeometry() {')
);
assert.match(syncFull,
    /if \(!shaderOnly\)\s*this\._syncOverviewWindowCapture\(\)/,
    'full layout gate is set before the first scene sync');
assert.match(clones,
    /sync\(\) \{\s*if \(!this\._windowCaptureEnabled\)/,
    'native clone sync must not wake hidden Browser/web content');
assert.match(clones,
    /if \(!this\._windowCaptureEnabled\)\s*this\.windowClonesContainer\?\.hide\?\.\(\);/,
    'a scene rebuild cannot flash web contents during Overview');
assert.doesNotMatch(setCaptureCode,
    /new Clutter|rebuildClones\(|texture2D|setTimeout|GLib\.timeout_add/,
    'mode switch has no new capture/repaint pipeline or polling timer');
assert.match(popup, /this\._overviewWindowCaptureEnabled = null;/,
    'Overview capture state is cleared when popup is destroyed');

console.log('Calendar after Super/Overview excludes stale Browser web capture, restores windows, and keeps wallpaper/glass/lifecycle PASS.');
