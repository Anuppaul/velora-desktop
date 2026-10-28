import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/popupGlass.js', import.meta.url
), 'utf8');

function shippedMethod(name, nextName) {
    const start = source.indexOf('    ' + name + '(');
    const end = source.indexOf('    ' + nextName + '(', start + 1);
    assert.ok(start >= 0 && end > start, name + ' exists in shipped source');
    return source.slice(start, end);
}

const methodNames = [
    ['_findNativePopupMenu', '_watchNativePopupActor'],
    ['_watchNativePopupActor', '_unwatchNativePopup'],
    ['_unwatchNativePopup', '_installNativePopupDiscovery'],
    ['_installNativePopupDiscovery', '_uninstallNativePopupDiscovery'],
    ['_uninstallNativePopupDiscovery', '_isPanelHoverMenu'],
];

const listeners = new Map();
function emitter() {
    let nextId = 0;
    const signals = new Map();
    return {
        connect(name, fn) {
            const id = ++nextId;
            signals.set(id, {name, fn});
            return id;
        },
        disconnect(id) {
            assert.ok(signals.delete(id), 'disconnect only a live signal');
        },
        emit(name, ...args) {
            for (const {name: signalName, fn} of [...signals.values()]) {
                if (name === signalName)
                    fn(this, ...args);
            }
        },
        count() {return signals.size;},
    };
}

const root = Object.assign(emitter(), {
    children: [],
    get_children() {return this.children;},
    add(actor) {
        this.children.push(actor);
        this.emit('child-added', actor);
    },
});
const Main = {layoutManager: {uiGroup: root}};
const methodSource = methodNames.map(([name, next]) =>
    shippedMethod(name, next)
).join('\n');
const actions = new Function('Main',
    'return ({' + methodSource + '});'
)(Main);

const attached = [];
const manager = Object.assign({
    _enabled: true,
    _discoveredPopups: new Map(),
    _uiGroupDiscoveryId: 0,
    attach(menu) {attached.push(menu); return {};},
}, actions);

function nativePopup() {
    const actor = Object.assign(emitter(), {
        get_first_child() {return null;},
    });
    const menu = Object.assign(emitter(), {
        box: {name: 'native-content'},
        actor,
        _boxPointer: actor,
        isOpen: false,
    });
    actor._delegate = menu;
    return {actor, menu};
}

const first = nativePopup();
root.children.push(first.actor);
manager._installNativePopupDiscovery();
assert.equal(manager._discoveredPopups.size, 1);
assert.equal(attached.length, 0, 'no preallocation for closed menu');
manager._watchNativePopupActor(first.actor);
assert.equal(first.menu.count(), 1, 'no duplicate menu listener');

first.menu.isOpen = true;
first.menu.emit('open-state-changed', true);
assert.deepEqual(attached, [first.menu],
    'subclass bypassing base open still receives real glass at open-state');

const gtkActor = Object.assign(emitter(), {
    get_first_child() {return null;},
});
root.add(gtkActor);
assert.equal(manager._discoveredPopups.size, 1,
    'GTK/DING process actors are never intercepted');

const second = nativePopup();
root.add(second.actor);
assert.equal(manager._discoveredPopups.size, 2,
    'dynamic right-click BoxPointer gets discovered without polling');
second.menu.isOpen = true;
second.menu.emit('open-state-changed', true);
assert.deepEqual(attached, [first.menu, second.menu]);

second.actor.emit('destroy');
assert.equal(manager._discoveredPopups.size, 1);
assert.equal(second.menu.count(), 0, 'destroyed native popup signal cleaned up');

manager._uninstallNativePopupDiscovery();
assert.equal(root.count(), 0, 'no permanent uiGroup signal after disable');
assert.equal(first.menu.count(), 0, 'all menu open listeners removed');
assert.equal(first.actor.count(), 0, 'destroy signal removed');
assert.equal(manager._discoveredPopups.size, 0);

const third = nativePopup();
root.add(third.actor);
third.menu.emit('open-state-changed', true);
assert.equal(attached.length, 2, 'disabled plugin cannot attach glass');

assert.match(source, /this\._installNativePopupDiscovery\(\);/,
    'runtime setup enables native menu discovery');
assert.match(source, /this\._uninstallNativePopupDiscovery\(\);/,
    'runtime cleanup restores native menu lifecycle');

console.log('GNOME native right-click PopupMenu discovery, first open, no closed-menu allocation, GTK isolation and full cleanup PASS.');
