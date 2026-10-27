import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Real requested rendering path: Browser → Super → native Overview/App Grid
// remains on-screen → Calendar. The Date Menu must blur/refract the same
// native OverviewGroup scene (icons and background) shown behind the popup,
// not only wallpaper and never a full-size desktop Browser clone.
//
// These tests EXECUTE the shipped popup methods in a lightweight GNOME
// actor mock. They cannot replace on-device GNOME Shell 50 visual tests.
const popup = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/popupGlass.js',
    import.meta.url
), 'utf8');

function shipped(name, next, env={}) {
    const start = popup.indexOf('    ' + name + ' {');
    assert.ok(start >= 0, 'missing shipped method ' + name);
    const end = popup.indexOf('\n    ' + next + ' {', start);
    assert.ok(end > start, 'missing following method ' + next);
    const fragment = popup.slice(start, end);
    return new Function(...Object.keys(env),
        'return ({' + fragment + '})[' + JSON.stringify(
            name.slice(0, name.indexOf('('))
        ) + '];')(...Object.values(env));
}

const overviewGroup = {
    name: 'real-gnome-overviewGroup-with-app-grid-icons',
    visible: true,
    mapped: true,
    width: 3840,
    height: 1080,
};
const Main = {
    overview: {visible: false, visibleTarget: false},
    layoutManager: {overviewGroup},
};
const finiteRect = rect =>
    Array.isArray(rect) && rect.length === 4 &&
    rect.every(Number.isFinite) && rect[2] > 1 && rect[3] > 1;
const visible = shipped('_syncOverviewSceneVisibility()',
    '_syncOverviewSceneGeometry(monitorX, monitorY)', {Main});
const geometry = shipped('_syncOverviewSceneGeometry(monitorX, monitorY)',
    '_syncOverviewWindowCapture()', {finiteRect, global: {
        stage: {width:3840,height:1080},
    }});
const capture = shipped('_syncOverviewWindowCapture()',
    'syncFrame()', {Main});

const changes = [];
const clone = {
    source: overviewGroup,
    visible: false,
    width: 1, height: 1, x:0,y:0,
    translation_x:0,translation_y:0,
    scale_x:1,scale_y:1,
    show() {this.visible=true;changes.push('overview-show');},
    hide() {this.visible=false;changes.push('overview-hide');},
    set_size(w,h) {
        this.width=w;this.height=h;changes.push('size');
    },
    set_scale(x,y) {
        this.scale_x=x;this.scale_y=y;changes.push('scale');
    },
};
let sourceBounds = [0,0,3840,1080];
const vendor = {
    getTransformedRect: source => {
        assert.equal(source,overviewGroup);
        return sourceBounds;
    },
    setSizeIfChanged(actor,w,h) {
        if (actor.width!==w || actor.height!==h)
            actor.set_size(w,h);
    },
    setTranslationIfChanged(actor,x,y) {
        if (actor.translation_x!==x||actor.translation_y!==y) {
            actor.translation_x=x;actor.translation_y=y;
            changes.push('translate');
        }
    },
};
let browserVisible = true;
let sourceRedraws = 0;
const dateSurface = {
    _isDateMenu:true,
    _overviewSceneSource:overviewGroup,
    _overviewSceneClone:clone,
    _lastOverviewSceneGeometryKey:'',
    _vendor:vendor,
    _sceneManager: {
        windowClonesContainer:{visible:false},
        setWindowCaptureEnabled(enabled){
            if(browserVisible!==enabled) {
                browserVisible=enabled;
                return true;
            }
            return false;
        },
    },
    _setSceneWindowCapture(enabled){
        if (browserVisible === enabled) return false;
        browserVisible = enabled;
        return true;
    },
    _syncOverviewSceneVisibility:visible,
    _overviewWindowCaptureEnabled:false,
    _lastSceneSyncUs:100,_lastFullSyncUs:200,_fullSyncDirty:false,
    _root:{queue_redraw(){sourceRedraws++;}},
    _effect:{queue_repaint(){sourceRedraws++;}},
    _dateInnerRoot:{queue_redraw(){sourceRedraws++;}},
};

// Normal desktop with an open Browser must capture that actual webpage.
assert.equal(capture.call(dateSurface),false);
assert.equal(clone.visible,false);
assert.equal(browserVisible,true);

// Enter native Overview with the Super key. The real App Grid actor is
// already visible/mapped; the same source is used inside Calendar glass.
Main.overview.visibleTarget=true;
assert.equal(capture.call(dateSurface),true);
assert.equal(clone.visible,true);
assert.equal(clone.source,Main.layoutManager.overviewGroup);
assert.equal(browserVisible,false);
assert.equal(sourceRedraws,3);
assert.equal(dateSurface._lastSceneSyncUs,0);
assert.equal(dateSurface._lastFullSyncUs,0);
assert.equal(dateSurface._fullSyncDirty,true);
const afterTransition=changes.length;
for(let i=0;i<30;i++)
    assert.equal(capture.call(dateSurface),false);
assert.equal(changes.length,afterTransition,
    'no redraw loop while App Grid is stationary');

// GNOME switches visibleTarget→visible once Overview is shown.
Main.overview.visibleTarget=false;
Main.overview.visible=true;
assert.equal(capture.call(dateSurface),false);
assert.equal(clone.visible,true);

// First monitor: source scene must fill stage exactly without shifting.
assert.equal(geometry.call(dateSurface,0,0),true);
assert.equal(clone.width,3840);
assert.equal(clone.height,1080);
assert.equal(clone.translation_x,0);
assert.equal(clone.translation_y,0);
assert.equal(clone.scale_x,1);
assert.equal(clone.scale_y,1);
assert.equal(geometry.call(dateSurface,0,0),false,
    'stable scene has no layout writes');

// Second monitor: subtract monitor origin, not source-clone window x/y.
assert.equal(geometry.call(dateSurface,1920,0),true);
assert.equal(clone.translation_x,-1920);
assert.equal(clone.translation_y,0);
assert.equal(geometry.call(dateSurface,1920,0),false);

// GNOME overview opens with a transform: clone match its stage rectangle
// using source native content dimensions, no screen-sized browser actor.
sourceBounds=[48,22,3456,972];
assert.equal(geometry.call(dateSurface,1920,0),true);
assert.equal(clone.translation_x,48-1920);
assert.equal(clone.translation_y,22);
assert.ok(Math.abs(clone.scale_x-.9)<.00001);
assert.ok(Math.abs(clone.scale_y-.9)<.00001);

// After Overview exits, return to the actual desktop Browser+wallpaper.
Main.overview.visible=false;
Main.overview.visibleTarget=false;
assert.equal(capture.call(dateSurface),true);
assert.equal(clone.visible,false);
assert.equal(browserVisible,true);
assert.equal(geometry.call(dateSurface,1920,0),false);

// GNOME's actor can remain mapped/allocated after closing Overview.
// Never show old App Grid material when Main.overview is not visible.
overviewGroup.visible=true;overviewGroup.mapped=true;
assert.equal(capture.call(dateSurface),false);
assert.equal(clone.visible,false);

// When native Overview actor is unmapped, fallback to wallpaper even if
// overview.visibleTarget temporarily stays true during transitions.
overviewGroup.mapped=false;Main.overview.visibleTarget=true;
assert.equal(capture.call(dateSurface),true,
    'unmapped Overview transition hides the old Browser source');
assert.equal(browserVisible,false);
assert.equal(clone.visible,false,
    'unmapped native scene falls back to wallpaper instead of a stale image');
overviewGroup.mapped=true;
assert.equal(capture.call(dateSurface),true);
assert.equal(clone.visible,true);

// Quick Settings must now behave identically to the Calendar in both
// visible App Grid and ordinary Browser desktop contexts.
const quickClone = {
    visible:false,
    show(){this.visible=true;},
    hide(){this.visible=false;},
};
let quickCapture=true;
const quick = {
    ...dateSurface,
    _isDateMenu:false,
    _isQuickSettings:true,
    _overviewSceneClone:quickClone,
    _overviewSceneSource:overviewGroup,
    _setSceneWindowCapture(enabled){
        const changed=quickCapture!==enabled;
        quickCapture=enabled;
        return changed;
    },
    _syncOverviewSceneVisibility:visible,
};
Main.overview.visible=false;Main.overview.visibleTarget=false;
assert.equal(capture.call(quick),false);
assert.equal(quickCapture,true);
Main.overview.visibleTarget=true;
assert.equal(capture.call(quick),true);
assert.equal(quickCapture,false);
assert.equal(quickClone.visible,true,
    'Quick Settings refracts the real Overview instead of wallpaper');
Main.overview.visibleTarget=false;
assert.equal(capture.call(quick),true);
assert.equal(quickCapture,true);
assert.equal(quickClone.visible,false);

// SOURCE hierarchy and rendering guards: only overviewGroup is cloned.
// It is a sibling of popup roots, never the full stage/UI group that
// contains the popup itself (which would produce recursive paint).
const attach = popup.slice(
    popup.indexOf('        let overviewSceneClone = null;'),
    popup.indexOf('        const breaker = ')
);
assert.match(attach,/Main\.layoutManager\.overviewGroup/);
assert.match(attach,/new Clutter\.Clone\(\{\s*source: overview/);
assert.match(attach,/ancestor === overview/);
assert.doesNotMatch(attach,/source: Main\.layoutManager\.uiGroup|source: global\.stage/);
assert.match(attach,/overviewSceneClone\.hide\(\)/);
assert.match(attach,/liquidBox\.add_child\(overviewSceneClone\)/);
// The clone is inserted ABOVE the shared wallpaper mirror, but BEFORE
// the existing single glass effect is created.
const overviewAttachAt=popup.indexOf('liquidBox.add_child(overviewSceneClone)');
const effectAt=popup.indexOf("const effect = new this._vendor.LiquidEffect({");
assert.ok(overviewAttachAt > 0 && overviewAttachAt < effectAt);
assert.match(popup,/this\._overviewSceneSource = overviewSceneSource/);
assert.match(popup,/const overviewGeometryChanged = !shaderOnly &&\s*this\._syncOverviewSceneGeometry\(monitorX, monitorY\)/);
assert.match(popup,/sceneDue =\s*geometryChanged \|\|\s*rootChanged \|\|\s*overviewGeometryChanged/);
assert.match(popup,/this\._overviewSceneClone = null;/);
assert.match(popup,/this\._overviewSceneSource = null;/);

// No CPU screenshot, extra liquid shader/material, polling timer or opaque
// overlay is introduced in the new rendering-path helpers.
const helpers = popup.slice(
    popup.indexOf('    _syncOverviewSceneVisibility() {'),
    popup.indexOf('    syncFrame() {')
);
assert.doesNotMatch(helpers, /Shell\.Screenshot|screenshot_area|GLib\.timeout_add|setTimeout|new LiquidEffect|new Shell\.BlurEffect|new Clutter\.Clone/);
console.log('Calendar and Quick Settings use actual Browser desktop/App Grid backdrops, correct geometry, and no recursive capture PASS.');
