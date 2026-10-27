import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// One backdrop-selection rule across Calendar, Quick Settings and native
// panel/popup menus: visible GNOME Overview → Overview pixels; otherwise
// actual desktop windows above wallpaper. This exercises the SHIPPED code.
const root = '../gnome-shell/velora@wonderer.tech/';
const popup = await readFile(new URL(root + 'popupGlass.js', import.meta.url), 'utf8');
const clones = await readFile(new URL(
    root + 'vendor/liquid-glass/dist/capture/windowClones.js', import.meta.url
), 'utf8');

function method(source, signature, nextMarker) {
    const start = source.indexOf('    ' + signature + ' {');
    assert.ok(start >= 0, 'missing shipped method: ' + signature);
    const end = source.indexOf(nextMarker, start);
    assert.ok(end > start, 'method boundary changed: ' + signature);
    return source.slice(start, end);
}
const gateText = method(
    clones, 'setWindowCaptureEnabled(enabled)', '\n    /**'
);
const gate = new Function(
    'return ({' + gateText + '}).setWindowCaptureEnabled;'
)();
const wrapperText = method(
    popup,
    '_setSceneWindowCapture(enabled, scene = this._sceneManager)',
    '\n    _syncOverviewSceneVisibility() {'
);
const wrapper = new Function(
    'return ({' + wrapperText + '})._setSceneWindowCapture;'
)();
const Main = {overview: {visible: false, visibleTarget: false}};
const captureText = method(
    popup, '_syncOverviewWindowCapture()', '\n    syncFrame() {'
);
const capture = new Function(
    'Main', 'return ({' + captureText + '})._syncOverviewWindowCapture;'
)(Main);

function makeSurface({kind, oldVendor = false, missingOverview = false} = {}) {
    const events = [];
    const bg = {visible: true, name: 'shared-wallpaper-mirror'};
    const windows = {
        visible: true,
        show() {this.visible = true; events.push('windows-show');},
        hide() {this.visible = false; events.push('windows-hide');},
    };
    const scene = {
        _windowCaptureEnabled: true,
        windowClonesContainer: windows,
        bgClone: bg,
        container: {queue_redraw() {events.push('scene-redraw');}},
    };
    if (!oldVendor)
        scene.setWindowCaptureEnabled = gate;
    const clone = missingOverview ? null : {
        visible: false,
        show() {this.visible = true; events.push('overview-show');},
        hide() {this.visible = false; events.push('overview-hide');},
    };
    const surface = {
        _isDateMenu: kind === 'calendar',
        _isQuickSettings: kind === 'quick',
        _sceneManager: scene,
        _overviewSceneClone: clone,
        _overviewSceneSource: {
            visible: true,
            mapped: true,
        },
        _overviewWindowCaptureEnabled: null,
        _setSceneWindowCapture: wrapper,
        // Native scene-visibility logic is separately tested against
        // GJS/Clutter actors by test_calendar_overview_backdrop.mjs.
        _syncOverviewSceneVisibility() {
            const active = Boolean(
                !missingOverview &&
                (Main.overview.visible || Main.overview.visibleTarget)
            );
            if (!clone || clone.visible === active)
                return false;
            if (active) clone.show();
            else clone.hide();
            return true;
        },
        _lastSceneSyncUs: 77,
        _lastFullSyncUs: 88,
        _fullSyncDirty: false,
        _root: {queue_redraw() {events.push('root-redraw');}},
        _effect: {queue_repaint() {events.push('composite-redraw');}},
        _dateInnerRoot: {queue_redraw() {events.push('inner-redraw');}},
    };
    return {surface, scene, windows, clone, bg, events};
}

// A Browser on the desktop must remain visible THROUGH CALENDAR just as
// through Quick Settings and a generic popup. No wallpaper-only exception.
for (const kind of ['calendar', 'quick', 'generic']) {
    Main.overview.visible = false;
    Main.overview.visibleTarget = false;
    const {surface, scene, windows, clone, bg, events} =
        makeSurface({kind});

    assert.equal(capture.call(surface), false,
        kind + ': no transition on desktop when windows are already live');
    assert.equal(windows.visible, true,
        kind + ': actual live Browser background, not wallpaper-only');
    assert.equal(bg.visible, true);
    assert.equal(clone.visible, false);

    // Super → App Grid: remove desktop Browser and replace it with the
    // same actual GNOME Overview source for ALL popup types.
    Main.overview.visibleTarget = true;
    assert.equal(capture.call(surface), true);
    assert.equal(scene._windowCaptureEnabled, false);
    assert.equal(windows.visible, false);
    assert.equal(clone.visible, true);
    assert.equal(bg.visible, true);
    assert.deepEqual(events, [
        'windows-hide', 'scene-redraw', 'overview-show',
        'root-redraw', 'composite-redraw', 'inner-redraw',
    ], kind + ': one source switch, single FBO/composite invalidation');
    assert.equal(surface._lastSceneSyncUs, 0);
    assert.equal(surface._lastFullSyncUs, 0);
    assert.equal(surface._fullSyncDirty, true);

    const stableCount = events.length;
    for (let frame = 0; frame < 100; frame++)
        assert.equal(capture.call(surface), false);
    assert.equal(events.length, stableCount,
        kind + ': no repeated compositor work while App Grid is stationary');

    // The native state transitions visibleTarget → visible without
    // changing the actual scene source.
    Main.overview.visible = true;
    Main.overview.visibleTarget = false;
    assert.equal(capture.call(surface), false);
    assert.equal(clone.visible, true);

    // Close Overview: live Browser content belongs behind the popup AGAIN.
    // This transition must not leave Calendar stuck on wallpaper-only.
    Main.overview.visible = false;
    assert.equal(capture.call(surface), true);
    assert.equal(clone.visible, false);
    assert.equal(windows.visible, true,
        kind + ': restore desktop Browser as the actual backdrop');
    assert.equal(bg.visible, true);
    assert.equal(capture.call(surface), false);
}

// A renderer module cached before the new vendor gate existed must still
// be able to hide and restore the window clone subtree in ALL popup types.
const cached = makeSurface({kind: 'calendar', oldVendor: true});
Main.overview.visibleTarget = true;
assert.equal(capture.call(cached.surface), true);
assert.equal(cached.windows.visible, false);
assert.equal(cached.clone.visible, true);
const replacement = {
    visible: true,
    hide() {this.visible = false; cached.events.push('rebuilt-hide');},
    show() {this.visible = true; cached.events.push('rebuilt-show');},
};
cached.scene.windowClonesContainer = replacement;
assert.equal(capture.call(cached.surface), true);
assert.equal(replacement.visible, false,
    'GNOME monitor rebuild cannot bring back full-size Browser in App Grid');
Main.overview.visibleTarget = false;
assert.equal(capture.call(cached.surface), true);
assert.equal(replacement.visible, true,
    'old vendor fallback restores desktop context when Overview closes');
assert.equal(cached.bg.visible, true);

// Missing overviewGroup/actor uses wallpaper only WHILE Overview is active,
// never displays Browser in the wrong context or a black backdrop.
const missing = makeSurface({kind: 'quick', missingOverview: true});
Main.overview.visibleTarget = true;
assert.equal(capture.call(missing.surface), true);
assert.equal(missing.windows.visible, false);
assert.equal(missing.bg.visible, true);
Main.overview.visibleTarget = false;
assert.equal(capture.call(missing.surface), true);
assert.equal(missing.windows.visible, true);

// Exact regressions for the previous permanent wallpaper Calendar bug:
assert.doesNotMatch(captureText, /!this\._isDateMenu\s*&&/,
    'Calendar must follow the same real scene selection as Quick Settings');
assert.doesNotMatch(popup, /if \(this\._isDateMenu\)\s*this\._setSceneWindowCapture\(false/,
    'no unconditional wallpaper-only Calendar exception at construction/reopen');
assert.match(captureText, /const captureWindows = !overviewActive/);
assert.match(captureText, /this\._syncOverviewSceneVisibility\(\)/);
assert.match(clones, /sync\(\) \{\s*if \(!this\._windowCaptureEnabled\)/);
assert.doesNotMatch(wrapperText,
    /rebuildClones\(|new Clutter|GLib\.timeout_add|new Shell\.Screenshot/,
    'switch the sources in the existing renderer without costly new effects');

// Source selection before fixed-FPS throttling prevents stale web snapshots
// during Super transition, and is NOT invoked from paint-time actor writes.
const frame = popup.slice(
    popup.indexOf('    syncFrame() {'),
    popup.indexOf('    _measure() {')
);
assert.ok(
    frame.indexOf('this._syncOverviewWindowCapture()') >= 0 &&
    frame.indexOf('this._syncOverviewWindowCapture()') <
    frame.indexOf('this._lastFullSyncUs > 0')
);
const syncFull = popup.slice(
    popup.indexOf('    _sync(shaderOnly) {'),
    popup.indexOf('    _syncShaderGeometry() {')
);
assert.match(syncFull,
    /if \(!shaderOnly\)\s*this\._syncOverviewWindowCapture\(\)/);
assert.match(popup,
    /this\._sceneManager\?\.applyBgCloneClip\?\.\(captureRect\)/);

console.log('Unified Calendar, Quick Settings and PopupMenu: live Browser on desktop, real Overview on Super, wallpaper fallback, cached-vendor restoration PASS.');
