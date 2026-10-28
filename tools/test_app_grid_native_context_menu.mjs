import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const src = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/popupGlass.js', import.meta.url
), 'utf8');

const a = src.indexOf('    attach(menu) {', src.indexOf('export class PopupGlassManager'));
const b = src.indexOf('    detach(menu) {', a);
assert.ok(a >= 0 && b > a);
const fn = new Function('PopupGlassSurface',
    'return ({' + src.slice(a, b) + '}).attach;'
)(class {
    constructor(_manager, menu) {this.menu = menu;}
    attach() {return true;}
});
const events = [];
const manager = {
    _enabled: true,
    _surfaces: new Map(),
    _cancelDeferredAttach() {events.push('cancel');},
    _syncStageLoopState() {events.push('sync');},
    describeMenu() {return 'test';},
};
function actor(styleClass, hasMethod = true) {
    return {
        ...(hasMethod ? {
            has_style_class_name(name) {
                return styleClass.split(/\s+/).includes(name);
            },
        } : {}),
        get_style_class_name() {return styleClass;},
    };
}
const appMenu = {actor: actor('app-well-menu')};
assert.equal(fn.call(manager, appMenu), null);
assert.deepEqual(events, ['cancel']);
assert.equal(manager._surfaces.size, 0, 'no glass actor allocated');

const appMenuFallback = {actor: actor('popup-menu app-well-menu', false)};
assert.equal(fn.call(manager, appMenuFallback), null,
    'GJS compatibility fallback recognizes app-well class token');
assert.equal(manager._surfaces.size, 0);

const date = {actor: actor('datemenu-popover')};
assert.ok(fn.call(manager, date), 'other Shell popup glass remains active');
assert.equal(manager._surfaces.size, 1);
assert.deepEqual(events, ['cancel', 'cancel', 'cancel', 'sync']);

assert.match(src, /if \(prototype\.open === this\._patchedOpen\)/,
    'GNOME PopupMenu prototype is still restored on cleanup');
console.log('App Grid context menu native position opt-out and other popup glass PASS.');
