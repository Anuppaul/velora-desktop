import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(
    new URL('../gnome-shell/velora@wonderer.tech/popupGlass.js', import.meta.url),
    'utf8'
);
const css = await readFile(
    new URL('../gnome-shell/velora@wonderer.tech/runtime.css', import.meta.url),
    'utf8'
);

// Test the shipped ownership predicate rather than a reimplementation.
const start = source.indexOf('    _isPanelHoverMenu(menu) {');
const end = source.indexOf('\n    _panelHoverSwitchEnabled() {', start);
assert.ok(start >= 0 && end > start, 'panel-hover ownership predicate exists');
const methodText = source.slice(start, end);
const isPanelHoverMenu = new Function(
    'return ({' + methodText + '})._isPanelHoverMenu;'
)();

const context = {kind: 'native app right-click'};
const indicator = {kind: 'panel indicator'};
for (const menuCollection of [[indicator], new Set([indicator])]) {
    const manager = {_panelMenuManager: {_menus: menuCollection}};
    assert.equal(isPanelHoverMenu.call(manager, indicator), true);
    assert.equal(isPanelHoverMenu.call(manager, context), false,
        'right-click app menu is not a panel-hover transition');
}
assert.equal(isPanelHoverMenu.call({_panelMenuManager: null}, context), false);
assert.equal(isPanelHoverMenu.call({_panelMenuManager: {_menus: []}}, null), false);

const patched = source.slice(
    source.indexOf('        this._patchedOpen = function (...args) {'),
    source.indexOf('        this._patchedDestroy = function (...args) {')
);
assert.match(patched,
    /animation ===\s*BoxPointer\.PopupAnimation\.FADE\s*&&\s*manager\._isPanelHoverMenu\(this\)/,
    'FADE alone must not defer right-click glass');
assert.match(patched,
    /if \(\s*manager\._enabled\s*\)\s*manager\.attach\(this\);\s*return manager\._originalOpen\.apply/,
    'native context menus attach the real glass BEFORE GNOME opens');
assert.match(patched, /manager\._scheduleDeferredAttach\(this\)/,
    'panel-hover debounce remains available');
assert.match(patched, /manager\._scheduleIdleAttach\(this\)/,
    'confirmed panel-hover behavior remains intact');
assert.match(source, /if \(prototype\.open === this\._patchedOpen\)\s*prototype\.open = this\._originalOpen/,
    'global adapter must restore GNOME prototype when disabled');

assert.match(css,
    /\.velora-liquid-popup-content\.popup-menu-content\s*\{/,
    'context popup paints native content transparently over one glass effect');
assert.match(css,
    /\.velora-liquid-popup-shell\s*\{/,
    'native BoxPointer arrow chrome is cleared, preserving existing layout');

console.log('Native app/Dock right-click: first-frame glass; panel hover debounce; cleanup PASS.');
