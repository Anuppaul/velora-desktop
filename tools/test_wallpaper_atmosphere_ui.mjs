import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base = '../gnome-shell/velora@wonderer.tech/';
const [uiSource,configSource,effectSource,prefs] = await Promise.all([
    'wallpaperAtmospherePreferences.js',
    'wallpaperAtmosphereConfig.js',
    'wallpaperAtmosphereEffect.js',
    'prefs.js',
].map(path=>readFile(new URL(base+path,import.meta.url),'utf8')));

const config = new Function(configSource.replace(/^export\s+/gm,'')+
    '\nreturn {ATMOSPHERE_KEYS,ATMOSPHERE_PRESETS,readAtmosphereProfile};')();
const ui = new Function('ATMOSPHERE_KEYS','ATMOSPHERE_PRESETS',
    uiSource.replace(/^import[\s\S]*?;\s*$/gm,'')
        .replace(/^export\s+/gm,'')+
    '\nreturn addWallpaperAtmospherePreferences;'
)(config.ATMOSPHERE_KEYS,config.ATMOSPHERE_PRESETS);

class Actor {
    constructor(o={}) {Object.assign(this,o);this.listeners=new Map();}
    connect(ev,fn) {
        const fns=this.listeners.get(ev)??[];
        fns.push(fn);this.listeners.set(ev,fns);
        return fns.length;
    }
    emit(ev){for(const fn of this.listeners.get(ev)??[])fn();}
}
class Group extends Actor {
    constructor(o){super(o);this.rows=[];}
    add(row){this.rows.push(row);}
}
class Combo extends Actor {
    constructor(o){super(o);this._selected=0;}
    get selected(){return this._selected;}
    set selected(v){this._selected=v;this.emit('notify::selected');}
}
class Spin extends Actor {
    constructor(o){super(o);this._value=o.adjustment.value;}
    get value(){return this._value;}
    set value(v){this._value=v;this.emit('notify::value');}
}
class Row extends Actor {add_suffix(b){this.suffix=b;}}
class Button extends Actor {click(){this.emit('clicked');}}
const Adw={
    PreferencesGroup:Group,ComboRow:Combo,SpinRow:Spin,
    ActionRow:Row,
};
const Gtk={
    StringList:{new:values=>values},
    Adjustment:class{constructor(o){Object.assign(this,o);}},
    Button,
    Align:{CENTER:0},
};
class Settings {
    constructor(){
        this.data=new Map([
            ['wallpaper-style','original'],
            ...config.ATMOSPHERE_KEYS.map((k,i)=>
                [k,[14,8,6,2,14][i]]),
        ]);
        this.listeners=new Map();
        this.changes=[];
        this.pending=new Set();
        this.delayed=false;
    }
    get_string(k){return this.data.get(k);}
    get_int(k){return this.data.get(k);}
    connect(ev,fn){
        const fns=this.listeners.get(ev)??[];
        fns.push(fn);this.listeners.set(ev,fns);return fns.length;
    }
    write(key,value){
        if(this.data.get(key)===value)return;
        this.data.set(key,value);
        this.changes.push([key,value]);
        if(this.delayed)this.pending.add(key);
        else this._emit(key);
    }
    set_string(k,v){this.write(k,v);}
    set_int(k,v){this.write(k,v);}
    _emit(key){
        for(const fn of this.listeners.get('changed::'+key)??[])
            fn(this,key);
    }
    delay(){assert.equal(this.delayed,false);this.delayed=true;}
    apply(){
        assert.equal(this.delayed,true);this.delayed=false;
        for(const key of this.pending)this._emit(key);
        this.pending.clear();
    }
}
const settings=new Settings();
const page={groups:[],add(group){this.groups.push(group);}};
const {presetRow,controls}=ui(page,settings,Adw,Gtk);
assert.equal(settings.changes.length,0,
    'opening Wallpaper Prefs NEVER changes wallpaper or style');
assert.equal(settings.get_string('wallpaper-style'),'original');
assert.equal(presetRow.selected,0);
assert.equal(controls.rows.length,5);
const values=()=>config.ATMOSPHERE_KEYS.map(k=>settings.get_int(k));

// Presets are atomic native GSettings writes, not five fast GPU flashes.
presetRow.selected=1; // Natural
assert.equal(settings.get_string('wallpaper-style'),'natural');
assert.deepEqual(values(),[10,5,3,1,8]);
assert.equal(settings.delayed,false);
assert.equal(presetRow.selected,1);
assert.equal(page.groups.length,3);

presetRow.selected=2; // Cinematic
assert.equal(settings.get_string('wallpaper-style'),'cinematic');
assert.deepEqual(values(),[22,13,5,2,16]);
presetRow.selected=3; // Atmosphere
assert.equal(settings.get_string('wallpaper-style'),'atmosphere');
assert.deepEqual(values(),[14,8,6,2,14]);

// A user's manual changes choose Custom, but external/native changes
// reflect in spin rows and do not create a second GSettings write.
const prior = settings.changes.length;
controls.rows[2].value=17;
assert.equal(settings.get_int('wallpaper-ambient'),17);
assert.equal(settings.get_string('wallpaper-style'),'custom');
assert.equal(presetRow.selected,4);
assert.equal(settings.changes.length,prior+2);

settings.set_int('wallpaper-grain',5);
assert.equal(controls.rows[3].value,5);
assert.equal(settings.get_string('wallpaper-style'),'custom');
assert.ok(settings.changes.length===prior+3,
    'programmatic sync must not rewrite an unchanged key');

// Original detaches the shader but retains five last-used custom values.
const saved=values();
presetRow.selected=0;
assert.equal(settings.get_string('wallpaper-style'),'original');
assert.deepEqual(values(),saved);
assert.equal(config.readAtmosphereProfile(settings).active,false);
const reset=page.groups[2].rows[0];
assert.equal(reset.title,'Return to Original');
assert.match(reset.subtitle,/without resetting saved Custom levels/);

// Selecting Custom from Original leaves saved knobs intact.
presetRow.selected=4;
assert.equal(settings.get_string('wallpaper-style'),'custom');
assert.deepEqual(values(),saved);
assert.equal(config.readAtmosphereProfile(settings).active,true);
reset.suffix.click();
assert.equal(settings.get_string('wallpaper-style'),'original');
assert.deepEqual(values(),saved);

// At zero intensity across all channels even Custom creates no shader.
for(const key of config.ATMOSPHERE_KEYS) settings.set_int(key,0);
settings.set_string('wallpaper-style','custom');
assert.equal(config.readAtmosphereProfile(settings).active,false);
settings.set_string('wallpaper-style','original');

// Shader/source-level GPU contracts.
const shaderDecl=effectSource.slice(
    effectSource.indexOf('export const ATMOSPHERE_DECLARATIONS'),
    effectSource.indexOf('const CACHE_KEY')
);
for(const uniform of ['va_resolution','va_filmic','va_vignette',
    'va_ambient','va_grain','va_adaptive'])
    assert.ok(shaderDecl.includes('uniform '+(
        uniform==='va_resolution'?'vec2 ':'float ')+uniform+';'));
assert.equal((shaderDecl.match(/texture2D\(cogl_sampler0, uv\)/g)??[]).length,1,
    'one wallpaper texel per shader pixel, no second image sampler');
assert.match(shaderDecl,/floor\(pixel\)/);
assert.doesNotMatch(shaderDecl,
    /uniform\s+(?:float|vec[234])\s+(?:va_time|time|frameId)\b|\bgl_FragCoord\b/,
    'wallpaper grain cannot require a frame/time uniform or animated pixel source');
assert.match(shaderDecl,/vec4\(color \* original\.a, original\.a\) \* cogl_color_in/,
    'alpha must stay premultiplied during wallpaper crossfades');
assert.match(shaderDecl,/color = filmic;/);
assert.match(shaderDecl,/color = contrastColor;/);
assert.match(shaderDecl,/smoothstep\(0\.53, 1\.30, length\(centered\)\)/);

// GObject type is registered only ONCE across live runtime imports.
let typeRegistrations=0;
const units=[];
class Base {
    constructor(){this._init();}
    _init(){this.locations=new Map();}
    get_uniform_location(k){return k;}
    set_uniform_float(name,n,val){units.push([name,n,[...val]]);}
    queue_repaint(){}
    get_texture(){return {get_width:()=>1920,get_height:()=>1080};}
    vfunc_paint_target(){}
    add_glsl_snippet(hook,decl,frag,replace){
        assert.equal(hook,1);assert.equal(replace,true);
        assert.ok(decl.includes('va_grain'));assert.ok(frag.includes('va_static_noise'));
    }
}
const Shell={GLSLEffect:Base};
const Clutter={ShaderEffect:class{}};
const Cogl={SnippetHook:{FRAGMENT:1}};
const GObject={registerClass(options,klass){
    assert.equal(options.GTypeName,'VeloraAtmosphereShaderEffectV1');
    typeRegistrations++;return klass;
}};
const symbols=Object.getOwnPropertySymbols(globalThis);
const cacheKey=Symbol.for('velora.atmosphere.effect.class.v1');
const oldType=globalThis[cacheKey];
delete globalThis[cacheKey];
try{
    const module=new Function('Shell','Clutter','Cogl','GObject',
        effectSource.replace(/^import[\s\S]*?;\s*$/gm,'')
            .replace(/^export\s+/gm,'')+
        '\nreturn {getAtmosphereEffectClass, ATMOSPHERE_FRAGMENT};'
    )(Shell,Clutter,Cogl,GObject);
    const Effect=module.getAtmosphereEffectClass();
    assert.equal(module.getAtmosphereEffectClass(),Effect);
    assert.equal(typeRegistrations,1);
    const instance=new Effect();
    instance.configure([14,8,6,2,14]);
    assert.deepEqual(units.find(x=>x[0]==='va_filmic')?.[2],[0]);
    assert.deepEqual(units.findLast(x=>x[0]==='va_filmic')?.[2],[0.14]);
    assert.deepEqual(units.findLast(x=>x[0]==='va_grain')?.[2],[0.02]);
    instance.vfunc_build_pipeline();
    instance.vfunc_paint_target(null,null);
    assert.deepEqual(units.findLast(x=>x[0]==='va_resolution')?.[2],[1920,1080]);
} finally {
    if(oldType) globalThis[cacheKey]=oldType;
    else delete globalThis[cacheKey];
}
assert.match(prefs,/addWallpaperAtmospherePreferences\(\s*wallpaperPage, settings, Adw, Gtk/);
assert.match(prefs,/\s'Wallpaper',\s*'preferences-desktop-wallpaper-symbolic'/);

console.log('Atmosphere presets, no-write-on-open, Custom controls, Original safety, one static GPU shader, alpha and GObject hot reload PASS.');
