import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base = '../gnome-shell/velora@wonderer.tech/';
const read = name => readFile(new URL(base + name, import.meta.url), 'utf8');
const [configSource, managerSource, effectSource, schema,
    integration, appGrid, install] = await Promise.all([
    read('wallpaperAtmosphereConfig.js'),
    read('wallpaperAtmosphere.js'),
    read('wallpaperAtmosphereEffect.js'),
    read('schemas/org.gnome.shell.extensions.velora.gschema.xml'),
    read('liquidGlassDock.js'),
    read('appGridBackdrop.js'),
    readFile(new URL('../gnome-shell/install.sh', import.meta.url), 'utf8'),
]);

const config = new Function(
    configSource.replace(/^export\s+/gm, '') +
    '\nreturn {ATMOSPHERE_KEYS, ATMOSPHERE_PRESETS, readAtmosphereProfile};'
)();
assert.deepEqual(config.ATMOSPHERE_KEYS, [
    'wallpaper-filmic', 'wallpaper-vignette', 'wallpaper-ambient',
    'wallpaper-grain', 'wallpaper-adaptive-contrast',
]);
assert.deepEqual(config.ATMOSPHERE_PRESETS.map(x => x.id), [
    'original', 'natural', 'cinematic', 'atmosphere', 'custom',
]);
assert.deepEqual(config.ATMOSPHERE_PRESETS
    .find(x => x.id === 'atmosphere').values, [62,52,54,3,56]);
assert.match(schema, /<key name="wallpaper-style" type="s">\s*<default>'original'<\/default>/);
for (const key of config.ATMOSPHERE_KEYS)
    assert.match(schema, new RegExp('<key name="' + key + '"'));
const defaultValues = Object.fromEntries(
    config.ATMOSPHERE_KEYS.map((key,i) => [key,[62,52,54,3,56][i]])
);

class Emitter {
    constructor() {this._subs = new Map();this._id = 0;}
    connect(event, handler) {
        const id = ++this._id;
        this._subs.set(id,{event,handler});
        return id;
    }
    disconnect(id){this._subs.delete(id);}
    emit(event,...args){
        for (const {event:e,handler} of [...this._subs.values()])
            if(e===event) handler(this,...args);
    }
}
class BackgroundContent extends Emitter {
    constructor(loaded=true){super();this.background=loaded?{}:null;}
    load(){this.background={};this.emit('notify::background');}
}
class BackgroundActor extends Emitter {
    constructor({loaded=true,name='background'}={}){
        super();this._name=name;
        this.content=new BackgroundContent(loaded);
        this.effects=new Map();this.adds=0;this.removes=0;
    }
    get_name(){return this._name;}
    add_effect_with_name(name, effect){
        assert.equal(this.effects.has(name),false,'no duplicate wallpaper effect');
        this.effects.set(name,effect);this.adds++;
    }
    remove_effect(effect){
        for (const [name,item] of this.effects)
            if(item===effect){this.effects.delete(name);this.removes++;return;}
    }
}
class Actor extends Emitter {
    constructor(name){super();this.name=name;this.children=[];}
    get_name(){return this.name;}
    get_children(){return [...this.children];}
    add_child(child){this.children.push(child);this.emit('child-added',child);}
    remove_child(child){
        this.children=this.children.filter(c=>c!==child);
        this.emit('child-removed',child);
    }
}
const desktop = new Actor('gnome-real-background-group');
const uiGroup = new Actor('uiGroup');
const native = new BackgroundActor();
const notWallpaper = new Actor('native-panel-icon');
desktop.add_child(native);
desktop.add_child(notWallpaper);
const unloaded = new BackgroundActor({loaded:false});
desktop.add_child(unloaded);
const Meta = {BackgroundActor,BackgroundContent};
const Main={layoutManager:{_backgroundGroup:desktop,uiGroup}};
const idleTasks=new Map();
let idleId=0;
function drainIdles() {
    let ticks=0;
    while(idleTasks.size){
        assert.ok(++ticks<100, 'status refresh must be bounded');
        const [id,cb]=idleTasks.entries().next().value;
        idleTasks.delete(id);
        assert.equal(cb(), false);
    }
}
const GLib={
    PRIORITY_DEFAULT_IDLE:200,
    SOURCE_REMOVE:false,
    idle_add(_p,cb){const id=++idleId;idleTasks.set(id,cb);return id;},
    source_remove(id){idleTasks.delete(id);},
};
let registerCount=0;
let shaderClass=null;
class FakeEffect {
    constructor(){this.profiles=[];}
    configure(values){this.profiles.push([...values]);}
}
const source=managerSource.replace(/^import[\s\S]*?;\s*$/gm,'')
    .replace(/^export\s+/gm,'');
const Type=new Function('GLib','Meta','Main','ATMOSPHERE_KEYS',
    'readAtmosphereProfile','getAtmosphereEffectClass',
    source+'\nreturn WallpaperAtmosphereManager;'
)(
    GLib,Meta,Main,config.ATMOSPHERE_KEYS,config.readAtmosphereProfile,
    () => {
        if (!shaderClass) {
            shaderClass = FakeEffect;
            registerCount++;
        }
        return shaderClass;
    }
);
class Settings extends Emitter {
    constructor(){super();this.data=new Map(Object.entries({
        'wallpaper-style':'original',
        'wallpaper-runtime-status':'Not initialized — install or reload Velora',
        ...defaultValues,
    }));}
    get_string(k){return this.data.get(k);}
    get_int(k){return this.data.get(k);}
    set_string(k,v){this.change(k,v);}
    change(key,value){this.data.set(key,value);this.emit('changed',key);}
}
const settings=new Settings();
const manager=new Type(settings);
manager.setup();
assert.equal(manager._actors.size,2,
    'watch only real Meta.BackgroundActors, never UI icons');
assert.equal(native.effects.size,0,
    'Original does not even register a shader/effect');
assert.equal(unloaded.effects.size,0);
assert.equal(registerCount,0);
drainIdles();
assert.match(settings.get_string('wallpaper-runtime-status'),
    /Original: no Atmosphere GPU effect attached/,
    'live status makes disabled Original mode explicit');

// The Liquid Glass shared wallpaper mirror can be created AFTER Atmosphere
// startup. Its children must be graded once, using the same profile.
const mirrorGroup=new Actor('lg-bg-mirror-source');
const mirror=new BackgroundActor({name:'lg-bg-mirror'});
mirrorGroup.add_child(mirror);
uiGroup.add_child(mirrorGroup);
assert.equal(mirror.effects.size,0);

// App Grid native blurred wallpaper is an independent background source.
const overviewWidget=new Actor('GNOME-overview-monitor-background');
const gridBg=new BackgroundActor();
overviewWidget.add_child(gridBg);
assert.equal(manager.watchContainer(overviewWidget),true);
assert.equal(manager.watchContainer(overviewWidget),false);
assert.equal(gridBg.effects.size,0);
drainIdles();
assert.match(settings.get_string('wallpaper-runtime-status'),
    /Original: no Atmosphere GPU effect attached/,
    'mirror/App Grid bookkeeping may update diagnostic once without shaders');

// Batch five setting changes into ONE native idle reconfiguration.
settings.change('wallpaper-filmic',18);
settings.change('wallpaper-vignette',10);
settings.change('wallpaper-style','atmosphere');
assert.equal(idleTasks.size,1,
    'multiple GSettings changes produce one apply idle');
drainIdles();
assert.match(settings.get_string('wallpaper-runtime-status'),
    /Shader attached to 3\/3 loaded wallpaper sources/,
    'live UI reports verified actor attachments after apply');
assert.equal(registerCount,1,
    'single effect class for all independent wallpaper actors');
assert.equal(native.effects.size,1);
assert.equal(mirror.effects.size,1);
assert.equal(gridBg.effects.size,1);
assert.equal(unloaded.effects.size,0,'never render a null background');
const effectOf=actor=>actor.effects.get('velora-atmosphere-wallpaper');
for(const actor of [native,mirror,gridBg])
    assert.deepEqual(effectOf(actor).profiles.at(-1),[62,52,54,3,56],
        'named Atmosphere must upgrade from stale pre-PR #62 slider values');
assert.notEqual(effectOf(native),effectOf(mirror),
    'separate native paint sources own distinct instances');

// A wallpaper can be inserted before GNOME assigned its Meta.Background.
// The effect attaches ONLY when real contents become loaded.
unloaded.content.load();
assert.equal(unloaded.effects.size,1);
assert.equal(registerCount,1);
drainIdles();
assert.match(settings.get_string('wallpaper-runtime-status'),
    /Shader attached to 4\/4 loaded wallpaper sources/);

// While a *named* preset is active, stale saved sliders may change but the
// visible preset stays canonical. Switching to Custom intentionally uses
// the saved values, with no duplicate GObject class.
settings.change('wallpaper-ambient',11);
drainIdles();
assert.equal(native.adds,1);
assert.deepEqual(effectOf(native).profiles.at(-1),[62,52,54,3,56]);
settings.change('wallpaper-style','custom');
drainIdles();
assert.deepEqual(effectOf(native).profiles.at(-1),[18,10,11,3,56]);

// A GNOME wallpaper change replaces the background actor; old effects and
// event watchers must be cleaned without ever editing the picture file.
desktop.remove_child(native);
assert.equal(native.effects.size,0);
assert.equal(native.removes,1);
const replacement=new BackgroundActor();
desktop.add_child(replacement);
assert.equal(replacement.effects.size,1);

// Turning Original ON is a true zero-GPU mode, without resetting controls.
settings.change('wallpaper-style','original');
drainIdles();
for(const actor of [replacement,unloaded,mirror,gridBg])
    assert.equal(actor.effects.size,0);
assert.equal(registerCount,1);
assert.equal(settings.get_int('wallpaper-filmic'),18);
assert.equal(settings.get_int('wallpaper-ambient'),11);
assert.match(settings.get_string('wallpaper-runtime-status'),
    /Original: no Atmosphere GPU effect attached/);

// Watchers track mirror source removal and monitor/App Grid rebuilds.
uiGroup.remove_child(mirrorGroup);
assert.equal(manager._containers.has(mirrorGroup),false);
manager.unwatchContainer(overviewWidget);
assert.equal(manager._containers.has(overviewWidget),false);

// Cleanup removes all signal connections and source tracking. Disabling
// Velora must NEVER delete actual GNOME/Meta background actors.
manager.cleanup();
assert.equal(manager._actors.size,0);
assert.equal(manager._containers.size,0);
assert.equal(desktop.get_children().length,3);
assert.equal(uiGroup.get_children().length,0);
assert.match(settings.get_string('wallpaper-runtime-status'),
    /Inactive: Velora Atmosphere runtime stopped/);

// Packaging and runtime integration must be real, not just mock tests.
assert.match(integration,/new WallpaperAtmosphereManager\(this\._veloraSettings\)/);
assert.match(integration,/new AppGridBackdropManager\(\{\s*atmosphereManager:/);
assert.match(integration,/cleanup\(\s*'wallpaperAtmosphereManager'/);
assert.match(appGrid,/this\._atmosphereManager\?\.watchContainer\(widget\)/);
assert.match(appGrid,/this\._atmosphereManager\?\.unwatchContainer\(widget\)/);
for(const path of [
    'wallpaperAtmosphere.js','wallpaperAtmosphereEffect.js',
    'wallpaperAtmosphereConfig.js','wallpaperAtmospherePreferences.js',
]) assert.match(install,new RegExp('"' + path.replace(/\./g,'\\.') + '"'));
assert.match(effectSource,/vfunc_build_pipeline/);
assert.match(effectSource,/vfunc_get_static_snippet/);
assert.match(effectSource,/Shell\.GLSLEffect \?\? Clutter\.ShaderEffect/);
assert.doesNotMatch(effectSource,/GLib\.timeout_add|Shell\.Screenshot|new Gio\.File/);
console.log('Atmosphere visible named presets from old saved values, Original safety, real source count/status, wallpaper loading, Custom fidelity and cleanup PASS.');
