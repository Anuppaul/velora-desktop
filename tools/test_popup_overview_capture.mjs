import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Reproduce the missed real-world sequence:
// Browser → Super/Overview → Calendar. GNOME can close Overview BEFORE
// opening Calendar, so checking only Main.overview.visible is insufficient.
// Exercise the actual shipped popup and vendor methods with GNOME mocks.
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
    assert.ok(begin >= 0, 'missing shipped method ' + signature);
    const end = source.indexOf(nextMarker, begin);
    assert.ok(end > begin, 'missing method end marker ' + signature);
    return source.slice(begin, end);
}
const nativeSource = extractMethod(
    clones, 'setWindowCaptureEnabled(enabled)', '\n    /**'
);
const nativeGate = new Function(
    'return ({' + nativeSource + '}).setWindowCaptureEnabled;'
)();
const popupWrapperSource = extractMethod(
    popup,
    '_setSceneWindowCapture(enabled, scene = this._sceneManager)',
    '\n    _syncOverviewWindowCapture() {'
);
const popupWrapper = new Function(
    'return ({' + popupWrapperSource + '})._setSceneWindowCapture;'
)();
const overview = {visible: false, visibleTarget: false};
const Main = {overview};
const popupCaptureSource = extractMethod(
    popup, '_syncOverviewWindowCapture()', '\n    syncFrame() {'
);
const syncOverview = new Function(
    'Main', 'return ({' + popupCaptureSource +
        '})._syncOverviewWindowCapture;'
)(Main);

function makeScene({oldVendor = false} = {}) {
    const events = [];
    const background = {visible: true, id: 'wallpaper-mirror'};
    const windows = {
        visible: true,
        show() {this.visible = true; events.push('windows-show');},
        hide() {this.visible = false; events.push('windows-hide');},
    };
    const scene = {
        _windowCaptureEnabled: true,
        windowClonesContainer: windows,
        bgClone: background,
        container: {queue_redraw() {events.push('scene-redraw');}},
    };
    if (!oldVendor)
        scene.setWindowCaptureEnabled = nativeGate;
    return {scene, events, background, windows};
}
function makeSurface({isDate = false, oldVendor = false} = {}) {
    const {scene, events, background, windows} = makeScene({oldVendor});
    const surface = {
        _isDateMenu: isDate,
        _sceneManager: scene,
        _setSceneWindowCapture: popupWrapper,
        _overviewWindowCaptureEnabled: null,
        _lastSceneSyncUs: 712,
        _lastFullSyncUs: 724,
        _fullSyncDirty: false,
        _root: {queue_redraw() {events.push('root-redraw');}},
        _effect: {queue_repaint() {events.push('effect-repaint');}},
        _dateInnerRoot: {queue_redraw() {events.push('inner-redraw');}},
    };
    return {surface, scene, events, background, windows};
}

// Calendar: even with Overview ALREADY CLOSED before its first paint,
// Browser's unscaled window is never an eligible backdrop source.
const date = makeSurface({isDate: true});
assert.equal(overview.visible, false);
assert.equal(overview.visibleTarget, false);
assert.equal(syncOverview.call(date.surface), true);
assert.equal(date.windows.visible, false,
    'Calendar never clones the Browser on a normal desktop');
assert.equal(date.background.visible, true, 'retain real wallpaper');
assert.deepEqual(date.events, [
    'windows-hide', 'scene-redraw', 'root-redraw',
    'effect-repaint', 'inner-redraw',
]);
assert.equal(date.surface._lastSceneSyncUs, 0);
assert.equal(date.surface._lastFullSyncUs, 0);
assert.equal(date.surface._fullSyncDirty, true);
const previous = date.events.length;

// Super/Overview visibility transitions cannot re-enable web content in
// Calendar, including the brief closing phase immediately before click.
overview.visibleTarget = true;
assert.equal(syncOverview.call(date.surface), false);
overview.visible = true;
overview.visibleTarget = false;
assert.equal(syncOverview.call(date.surface), false);
overview.visibleTarget = false;
overview.visible = false;
assert.equal(syncOverview.call(date.surface), false);
for (let i = 0; i < 120; i++)
    assert.equal(syncOverview.call(date.surface), false);
assert.equal(date.windows.visible, false);
assert.equal(date.events.length, previous,
    'no ongoing repaint loop after the one source change');

// A stale cached vendor JS module lacking the method shipped by the
// previous fix MUST still hide the cloned browser subtree. This is
// important for Velora's live hot-swap installer, whose module cache
// survives installation until GNOME Shell restarts.
const stale = makeSurface({isDate: true, oldVendor: true});
assert.equal(syncOverview.call(stale.surface), true);
assert.equal(stale.windows.visible, false);
assert.equal(stale.background.visible, true);
assert.deepEqual(stale.events.slice(0, 2), [
    'windows-hide', 'scene-redraw',
]);
const beforeOld = stale.events.length;
assert.equal(syncOverview.call(stale.surface), false);
assert.equal(stale.events.length, beforeOld);

// If an old vendored manager replaces its windowClonesContainer on a
// scene/monitor rebuild, our same stage check heals it before capture.
const replacement = {
    visible: true,
    show() {this.visible = true; stale.events.push('new-show');},
    hide() {this.visible = false; stale.events.push('new-hide');},
};
stale.scene.windowClonesContainer = replacement;
assert.equal(syncOverview.call(stale.surface), true);
assert.equal(replacement.visible, false);
assert.ok(stale.events.includes('new-hide'));
assert.equal(stale.background.visible, true);

// With the newer vendor cache, the same source manager's mode gate also
// suppresses the per-window clone sync (no expensive hidden browser work).
assert.match(clones,
    /sync\(\) \{\s*if \(!this\._windowCaptureEnabled\)/);

// Quick Settings and generic popup menus must retain their ORIGINAL
// live window glass when not in Overview. Only Calendar is wallpaper-only.
const quick = makeSurface({isDate: false});
assert.equal(syncOverview.call(quick.surface), false);
assert.equal(quick.windows.visible, true);
overview.visibleTarget = true;
assert.equal(syncOverview.call(quick.surface), true);
assert.equal(quick.windows.visible, false);
assert.equal(quick.background.visible, true);
overview.visibleTarget = false;
assert.equal(syncOverview.call(quick.surface), true);
assert.equal(quick.windows.visible, true);
assert.equal(syncOverview.call(quick.surface), false);

// Check that a real Date Menu is detected by *both* the GNOME style
// class and direct menu identity (GNOME 50 theming/hierarchy variants).
assert.match(popup, /popupClasses\.includes\('datemenu-popover'\)/);
assert.match(popup,
    /this\._menu === Main\.panel\?\.statusArea\?\.dateMenu\?\.menu/);

// The wallpaper-only policy must be established at scene CREATION,
// before any LiquidEffect pipeline can capture Browser content.
const createAt = popup.indexOf(
    "new this._vendor.WindowCloneManager("
);
const disableAt = popup.indexOf(
    'this._setSceneWindowCapture(false, sceneManager);'
);
const effectAt = popup.indexOf(
    'const effect = new this._vendor.LiquidEffect('
);
assert.ok(createAt >= 0 && createAt < disableAt && disableAt < effectAt,
    'Calendar disables Browser clones before its first material creation');

// The same policy is enforced on reopen and before each throttled frame,
// including when the scene actor was rebuilt by older cached vendor code.
assert.match(popup,
    /if \(this\._isDateMenu\)\s*this\._setSceneWindowCapture\(false\)/);
const frame = popup.slice(
    popup.indexOf('    syncFrame() {'),
    popup.indexOf('    _measure() {')
);
assert.ok(
    frame.indexOf('this._syncOverviewWindowCapture()') >= 0 &&
    frame.indexOf('this._syncOverviewWindowCapture()') <
        frame.indexOf('this._lastFullSyncUs > 0'),
    'Calendar must revalidate the backdrop before the FPS throttle'
);
const syncFull = popup.slice(
    popup.indexOf('    _sync(shaderOnly) {'),
    popup.indexOf('    _syncShaderGeometry() {')
);
assert.match(syncFull,
    /if \(!shaderOnly\)\s*this\._syncOverviewWindowCapture\(\)/,
    'never change Clutter actor visibility during paint-time shader sync');
assert.doesNotMatch(popupWrapperSource,
    /rebuildClones\(|new Clutter|GLib\.timeout_add|new Shell\.Screenshot/,
    'wallpaper-only switch must reuse current scene and remain event-driven');

// Keep the 16:9 preview, Liquid/Frosted shader, native shell components
// and Quick Settings unchanged. A popup-specific opt-out is sufficient.
assert.match(popup,
    /this\._dateInnerClone = dateInnerClone;/);
assert.match(popup,
    /this\._sceneManager\?\.applyBgCloneClip\?\.\(captureRect\)/);

console.log(
    'Calendar wallpaper-only after Browser/Super (including Overview already closed), cached vendor fallback, Quick Settings live windows, restore and no extra layers PASS.'
);
