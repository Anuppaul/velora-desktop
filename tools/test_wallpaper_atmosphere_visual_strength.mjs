import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Not a screenshot/GPU benchmark: numeric reproduction of the shipped
// static fragment's calibrated color equations at representative pixels.
// The source checks keep this test tied to the same shader coefficients.
const dir = '../gnome-shell/velora@wonderer.tech/';
const [config, shader] = await Promise.all([
    readFile(new URL(dir + 'wallpaperAtmosphereConfig.js',
        import.meta.url), 'utf8'),
    readFile(new URL(dir + 'wallpaperAtmosphereEffect.js',
        import.meta.url), 'utf8'),
]);
const presets = new Function(
    config.replace(/^export\s+/gm, '') +
    '\nreturn ATMOSPHERE_PRESETS;')();
const map = new Map(presets.map(p => [p.id,p.values]));
assert.deepEqual(map.get('natural'),[38,24,22,2,34]);
assert.deepEqual(map.get('cinematic'),[78,70,34,4,72]);
assert.deepEqual(map.get('atmosphere'),[62,52,54,3,56]);

const src = shader.slice(
    shader.indexOf('export const ATMOSPHERE_FRAGMENT'),
    shader.indexOf('const CACHE_KEY')
);
const constants = [
    /1\.0 \+ 0\.27 \* filmicStrength/,
    /0\.68 \* filmicStrength/,
    /1\.0 \+ 0\.35 \* adaptive/,
    /0\.42 \* clamp\(va_vignette/,
    /0\.62 \* clamp\(va_ambient/,
    /0\.22 \* adaptive/,
    /protectHighlights/,
    /vec4\(color \* original\.a, original\.a\)/,
];
for (const expected of constants)
    assert.match(src, expected, 'calibrated source coefficient changed');
assert.equal((src.match(/texture2D\(cogl_sampler0, uv\)/g)??[]).length,
    1, 'one input wallpaper sample, not a new offscreen feedback loop');
const clamp = v => Math.min(1,Math.max(0,v));
const mix=(a,b,t)=>a*(1-t)+b*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const rms=(a,b)=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/3);

// Mirror of the static GPU shading algebra, grain excluded (zero-mean,
// intended to be subtle rather than the source of visible differences).
function shade(original, uv, values) {
    const [filmicStrength,vignette,ambient,,adaptive]=values.map(v=>v/100);
    const luma=original[0]*.2126+original[1]*.7152+
        original[2]*.0722;
    let graded=original.map(c=>mix(luma,c,1+.27*filmicStrength));
    const curve=graded.map(c=>c*c*(3-2*c));
    graded=graded.map((c,i)=>mix(c,curve[i],.68*filmicStrength));
    const shadow=1-smooth(.05,.52,luma);
    const highlight=smooth(.42,.91,luma);
    let color=graded.map((c,i)=>c+
        filmicStrength*shadow*[-.014,.006,.045][i]+
        filmicStrength*highlight*[.024,.01,-.02][i]);
    const contrast=color.map(c=>(c-.5)*(1+.35*adaptive)+.5);
    const guard=1-.65*smooth(.78,1,luma);
    color=color.map((c,i)=>mix(c,contrast[i],guard));
    const dark=1-smooth(.035,.28,luma);
    color=color.map(c=>c+dark*.06*adaptive);
    color=color.map((c,i)=>Math.max(c,original[i]*(1-.22*adaptive)));
    const protectHighlights=smooth(.86,1,luma)*.72;
    color=color.map((c,i)=>mix(c,original[i],protectHighlights));
    const length=Math.hypot((uv[0]-.5)*1.88,(uv[1]-.5)*1.70);
    const edge=smooth(.38,1.25,length);
    color=color.map(c=>c*(1-edge*.42*vignette));
    const warmth=clamp(.5+(color[0]-color[2])*.90);
    const lightRoom=1-.55*smooth(.75,1,luma);
    const strength=.62*ambient*lightRoom*(1-.22*edge);
    color=color.map((c,i)=>c*mix(1,
        mix([.84,.96,1.12][i],[1.13,1.02,.86][i],warmth),strength));
    return color.map(clamp);
}
const warm=[.86,.65,.35],bright=[.96,.96,.96];
const midtone=[.43,.57,.53],almostBlack=[.06,.06,.09];
const center=[.5,.5],corner=[0,0];
const natural=map.get('natural'),atmosphere=map.get('atmosphere'),
    cinematic=map.get('cinematic');

// Premium but no longer near-invisible: central warm-color treatment and
// vignetted neutral wallpaper corners must have measurable distinction.
assert.ok(rms(shade(warm,center,natural),warm)>.05);
assert.ok(rms(shade(warm,center,atmosphere),warm)>.08,
    'Atmosphere color must be directly distinguishable from Original');
assert.ok(rms(shade(warm,center,cinematic),warm)>.09);
const cornerDistances=[natural,atmosphere,cinematic].map(
    p=>rms(shade(midtone,corner,p),midtone)
);
assert.ok(cornerDistances[0]>.04 &&
    cornerDistances[1]>.10 &&
    cornerDistances[2]>.13 &&
    cornerDistances[0]<cornerDistances[1] &&
    cornerDistances[1]<cornerDistances[2],
'Natural < Atmosphere < Cinematic visual depth');
assert.ok(rms(shade(bright,corner,atmosphere),bright)>.15,
    'bright wallpaper has unmistakable corner depth');
assert.ok(rms(shade(bright,center,atmosphere),bright)<.06,
    'center highlights stay open instead of flat white');
const dark=shade(almostBlack,center,cinematic);
assert.ok(dark.every((channel,i)=>channel >= almostBlack[i]*.80),
    'cinematic black wallpaper retains deep-shadow detail instead of crushing');
assert.ok(rms(dark,almostBlack)<.04);
console.log('Atmosphere visible palette difference, ordered preset depth, protected highlights and dark wallpaper details PASS.');
