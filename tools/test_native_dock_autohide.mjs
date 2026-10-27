import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Execute shipped runtime methods with GNOME/Ubuntu Dock mock actors.
// Real desktop input and compositor rendering still need on-device checks.
const source = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/liquidGlassDock.js',
    import.meta.url
), 'utf8');
function shipped(name, scope = {}) {
    const start = source.indexOf('    ' + name + '(');
    assert.ok(start >= 0, 'missing method ' + name);
    const rest = source.slice(start + 5);
    const next = rest.match(/\n    [_a-zA-Z][\w]*\(/);
    assert.ok(next, 'missing next method after ' + name);
    const method = source.slice(start, start + 5 + next.index);
    return new Function(...Object.keys(scope),
        'return ({' + method + '})["' + name + '"];')(
        ...Object.values(scope));
}
const clampNumber = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const STATE = {HIDDEN: 0, SHOWING: 1, SHOWN: 2, HIDING: 3};
const St = {Side: {LEFT: 1, RIGHT: 2, TOP: 3, BOTTOM: 4}};
const Main = {layoutManager: {monitors:
    [{x: 0, y: 0, width: 1920, height: 1080}]}};
class ActorBox {
    init_rect(x, y, w, h) {
        Object.assign(this, {x1:x, y1:y, x2:x+w, y2:y+h});
    }
}
const Clutter = {ActorBox};
const slide = shipped('_readNativeDockSlide');
const state = shipped('_readNativeDockState', {NATIVE_DOCK_STATE: STATE});
const normalize = shipped('_normalizeLegacyNativeDockState', {
    NATIVE_DOCK_STATE: STATE, NATIVE_DOCK_SLIDE_EPSILON: 0.002,
});
const position = shipped('_applyDockVerticalOffset', {
    clampNumber, NATIVE_DOCK_SLIDE_EPSILON: 0.002,
});
const target = shipped('_syncNativeIntellihideTarget', {
    Clutter, St, Main, clampNumber, NATIVE_DOCK_STATE: STATE,
});

// Missing/null GNOME/GJS property must NOT coerce to 0/HIDDEN.
const sample = {nativeSlider: {slide_x: null, slideX: 1}};
assert.equal(slide(sample), 1);
sample.nativeSlider.slideX = 0.4;
assert.equal(slide(sample), 0.4);
sample.nativeSlider.slide_x = undefined;
sample.nativeSlider.slideX = undefined;
sample.nativeSlider.get_property = () => 0.7;
assert.equal(slide(sample), 0.7);
sample.nativeSlider.get_property = () => null;
assert.ok(Number.isNaN(slide(sample)),
    'missing GObject property must never fabricate a hidden slide');
sample.nativeSlider.get_property = () => undefined;
assert.ok(Number.isNaN(slide(sample)));

const legacy = {nativeDock: {
    dockState: null, _dockState: STATE.SHOWN,
    _slider: {slide_x: 1},
}};
assert.equal(state.call({_readNativeDockSlide: slide}, legacy), STATE.SHOWN);
legacy.nativeDock._dockState = STATE.HIDDEN;
normalize.call({_readNativeDockSlide: slide}, legacy);
assert.equal(legacy.nativeDock._dockState, STATE.SHOWN);
legacy.nativeDock.dockState = STATE.HIDDEN;
legacy.nativeDock._dockState = STATE.HIDDEN;
normalize.call({_readNativeDockSlide: slide}, legacy);
assert.equal(legacy.nativeDock._dockState, STATE.HIDDEN,
    'modern public state must not be overwritten');

// Null optional slide once made shown Dock look hidden on every refresh.
const visual = {translation_y:0};
let actualSlide = 1, panel = false, offset = 24;
const offsetCtx = {
    _readNativeDockSlide: () => actualSlide,
    _dockIsPanelMode: () => panel,
    _readDockVerticalOffset: () => offset,
    _syncPanelBackdropGeometry: () => {},
};
const entry = {nativeDock:{dash:{},_box:visual},nativeBox:visual};
position.call(offsetCtx, entry);
assert.equal(visual.translation_y, -24);
actualSlide = 0.5;
position.call(offsetCtx, entry);
assert.equal(visual.translation_y, -12);
actualSlide = 0;
position.call(offsetCtx, entry);
assert.equal(visual.translation_y, 0);
actualSlide = 1;
position.call(offsetCtx, entry, 0);
assert.equal(visual.translation_y, 0, 'explicit zero is still valid');
position.call(offsetCtx, entry);
assert.equal(visual.translation_y, -24, 'omitted != hidden');
panel = true;
position.call(offsetCtx, entry);
assert.equal(visual.translation_y, 0, 'panel ignores offset');

// Intellihide must track the fully-shown native static box, never the
// partially hidden translated dock child. At zero offset native owns it.
const nativeBox = new ActorBox();
nativeBox.init_rect(120,960,480,82);
let movingY=960;
const box={width:480,height:82,
    get_transformed_position:()=>[120,movingY]};
const updates=[];
const intellihide={updateTargetBox(rect) {
    updates.push({ref:rect,x1:rect.x1,y1:rect.y1,
        x2:rect.x2,y2:rect.y2});
}};
const dock={_staticBox:nativeBox,_box:box,
    _position:St.Side.BOTTOM,_monitor:Main.layoutManager.monitors[0]};
const targetEntry={nativeDock:dock,nativeBox:box,nativeIntellihide:intellihide,
    nativeIntellihideTargetBox:null,nativeIntellihideRectKey:''};
let dockOffset=0, panelMode=false;
const targetCtx={
    _dockIsPanelMode:()=>panelMode,
    _readDockVerticalOffset:()=>dockOffset,
    _readNativeDockSlide:()=>1,
    _readNativeDockState:()=>STATE.SHOWN,
};
assert.equal(target.call(targetCtx,targetEntry),true);
assert.equal(updates.at(-1).ref,nativeBox);
assert.equal(targetEntry.nativeIntellihideRectKey,'native');
const n=updates.length;
movingY=1200;
assert.equal(target.call(targetCtx,targetEntry),true);
assert.equal(updates.length,n,'hidden allocation does not move target');
dockOffset=24;
target.call(targetCtx,targetEntry);
assert.deepEqual([updates.at(-1).x1,updates.at(-1).y1,
    updates.at(-1).x2,updates.at(-1).y2],[120,936,600,1018]);
const updated=updates.length;
for (const p of [0,0.5,1]) {
    movingY=960+500*(1-p);
    target.call(targetCtx,targetEntry);
}
assert.equal(updates.length,updated,'native reveal has no target churn');
nativeBox.init_rect(90,900,700,105);
target.call(targetCtx,targetEntry);
assert.deepEqual([updates.at(-1).x1,updates.at(-1).y1,
    updates.at(-1).x2,updates.at(-1).y2],[90,876,790,981]);
dockOffset=0;
target.call(targetCtx,targetEntry);
assert.equal(updates.at(-1).ref,nativeBox,'restore native target');
panelMode=true;
target.call(targetCtx,targetEntry);
assert.equal(targetEntry.nativeIntellihideRectKey,'native');
const legacyNoBox={...targetEntry,
    nativeDock:{...dock,_staticBox:null},
    nativeBox:{width:0,height:0,get_transformed_position:()=>[10,12]},
    nativeIntellihideRectKey:''};
panelMode=false;
assert.equal(target.call(targetCtx,legacyNoBox),false,
    'zero-sized missing native actor is not a valid overlap rectangle');

// Changed native settings: one idle reconciliation after all GNOME handlers,
// no duplicate hover/show animation or continuous polling.
let nextSource=0;
const laters=new Map();
const GLib={PRIORITY_DEFAULT_IDLE:200,SOURCE_REMOVE:false,
    idle_add(_p,fn){laters.set(++nextSource,fn);return nextSource;}};
const queue=shipped('_queueNativeDockAutoHideRefresh',{GLib});
const events=[];
const e={nativeBox:{sync_hover(){events.push('hover');}},
    nativeIntellihide:{forceUpdate(){events.push('overlap');}}};
const ctx={_enabled:true,_dockAutoHideRefreshId:0,_nativeDashEntries:[e],
    _findNativeDashToDock(){events.push('bind');},
    _applyDockVerticalOffset(){events.push('offset');},
    _syncNativeIntellihideTarget(){events.push('target');},
    _syncNativeDockVisualState(){events.push('glass');}};
queue.call(ctx);queue.call(ctx);queue.call(ctx);
assert.equal(laters.size,1);
assert.equal(ctx._dockAutoHideRefreshId,1);
assert.equal(laters.get(1)(),GLib.SOURCE_REMOVE);
assert.deepEqual(events,['bind','offset','target','hover','overlap','glass']);
assert.equal(ctx._dockAutoHideRefreshId,0);
ctx._enabled=false;
queue.call(ctx);
assert.equal(laters.size,1);

const watchers=source.slice(source.indexOf('    _setupDashToDockModeWatch() {'),
    source.indexOf('    _dockIsFixedMode() {'));
for (const key of ['autohide','intellihide','manualhide','dock-position',
    'require-pressure-to-show','pressure-threshold','dock-fixed']) {
    assert.ok(
        watchers.includes("'" + key + "'") ||
        watchers.includes("'changed::" + key + "'"),
        'missing native key ' + key
    );
}
assert.match(watchers,/GLib\.source_remove\(this\._dockAutoHideRefreshId\)/);
assert.match(watchers,/_dashToDockSettings\.disconnect\(\s*this\._dashToDockVisibilityId/);
assert.doesNotMatch(watchers,/\._animateIn\(|\._animateOut\(|\.showDock\(|\.hideDock\(/);
console.log('Ubuntu Dock native slide, legacy state, stable intellihide, panel and coalesced autohide PASS.');
