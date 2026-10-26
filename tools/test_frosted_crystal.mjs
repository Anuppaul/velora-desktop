import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the shipped canonical settings bridge, vendored material bindings,
// and the existing LiquidEffect blur setter without a live GNOME compositor.
// No second copy of either implementation is tested or shipped.
const root = '../gnome-shell/velora@wonderer.tech/';
const file = async name => readFile(new URL(root + name, import.meta.url), 'utf8');
const integration = await file('liquidGlassDock.js');
const materialSource = await file('vendor/liquid-glass/dist/rendering/material.js');
const effectSource = await file('vendor/liquid-glass/dist/liquidEffect.js');
const shader = await file('vendor/liquid-glass/shaders/glass.frag');
const canonicalSchema = await file('schemas/org.gnome.shell.extensions.velora.gschema.xml');
const vendorSchema = await file(
    'vendor/liquid-glass/schemas/org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com.gschema.xml'
);
const prefs = await file('prefs.js');
const begin = integration.indexOf('    _applyFrostedCrystalSettings() {');
const end = integration.indexOf('\n    async enable() {', begin);
assert.ok(begin >= 0 && end > begin);
const method = integration.slice(begin, end);
const bridge = new Function('clampNumber',
    'return ({' + method + '});')(
        (value, min, max) => Math.max(min, Math.min(max, value))
    );

const values = new Map([
    ['velora-frost-amount', 0],
    ['velora-frost-grain', 0.55],
    ['velora-frost-edge-glow', 0.52],
    // Saved, user-customized Liquid v10 optics must be left unchanged.
    ['glass-displacement-scale', 36],
    ['glass-chroma-strength', 3.4],
    ['glass-rim-intensity', 0.22],
]);
const handlers = new Map();
let nextId = 0;
const vendor = {
    settings_schema: {has_key: key => values.has(key)},
    get_double(key) {
        // The real vendored schema contains many unrelated numeric Liquid
        // optics. This focused mock supplies their defaults without hiding
        // missing Frosted keys (which must always be explicitly present).
        if (!values.has(key)) {
            if (key.startsWith('velora-frost-'))
                throw new Error('Missing Frosted key: ' + key);
            return 1.0;
        }
        return values.get(key);
    },
    set_double(key, value) {
        if (!values.has(key))
            throw new Error('Missing GSettings key: ' + key);
        if (values.get(key) === value)
            return;
        values.set(key, value);
        for (const [name, callback] of handlers.values())
            if (name === 'changed::' + key)
                callback();
    },
    connect(name, handler) {
        const id = ++nextId;
        handlers.set(id, [name, handler]);
        return id;
    },
    disconnect(id) {handlers.delete(id);},
    get_int: key => key === 'glass-blur-downscale' ? 2 : 1,
    get_boolean: () => false,
};
const controls = {
    'glass-style': 'liquid',
    'frost-density': 78,
    'frost-grain': 55,
    'frost-edge-glow': 52,
};
const canonical = {
    get_string: key => {
        if (key !== 'glass-style')
            throw new Error('Unexpected string key ' + key);
        return controls[key];
    },
    get_int: key => {
        if (!Object.hasOwn(controls, key))
            throw new Error('Unexpected int key ' + key);
        return controls[key];
    },
};
const instance = {
    _settings: vendor,
    _veloraSettings: canonical,
    _applyFrostedCrystalSettings: bridge._applyFrostedCrystalSettings,
};

// MaterialSettings must apply uniforms on creation and live setting changes.
const MaterialSettings = new Function(
    materialSource.replace(/^export\s+/gm, '') +
    '\nreturn MaterialSettings;'
)();
const uniformValues = new Map();
const uniform = {set: (key, value) => uniformValues.set(key, value)};
const blur = {setBlurMethod() {}, setDownscale() {}};
const events = [];
const material = new MaterialSettings(
    vendor, uniform, blur, () => {},
    (amount, initial) => events.push([amount, initial])
);
material.initialize();
assert.equal(uniformValues.get('velora_frost_amount'), 0);
assert.equal(events.at(-1)[1], true);
instance._applyFrostedCrystalSettings();
assert.equal(values.get('velora-frost-amount'), 0);
assert.equal(values.get('velora-frost-grain'), 0.55);

// The first user switch should update ALL live effects; original settings
// are not rewritten. Density and edge glow can be adjusted while enabled.
controls['glass-style'] = 'frosted';
instance._applyFrostedCrystalSettings();
assert.equal(values.get('velora-frost-amount'), 0.78);
assert.equal(uniformValues.get('velora_frost_amount'), 0.78);
assert.equal(uniformValues.get('velora_frost_grain'), 0.55);
assert.equal(events.at(-1)[1], false);
controls['frost-density'] = 34;
controls['frost-grain'] = 77;
controls['frost-edge-glow'] = 19;
instance._applyFrostedCrystalSettings();
assert.equal(uniformValues.get('velora_frost_amount'), 0.34);
assert.equal(uniformValues.get('velora_frost_grain'), 0.77);
assert.equal(uniformValues.get('velora_frost_edge_glow'), 0.19);
assert.equal(values.get('glass-displacement-scale'), 36);
assert.equal(values.get('glass-chroma-strength'), 3.4);
assert.equal(values.get('glass-rim-intensity'), 0.22);

controls['glass-style'] = 'liquid';
instance._applyFrostedCrystalSettings();
assert.equal(uniformValues.get('velora_frost_amount'), 0);
assert.equal(values.get('glass-displacement-scale'), 36);
assert.equal(values.get('glass-rim-intensity'), 0.22);

// Retest after switching back, including independently retained user choices.
controls['glass-style'] = 'frosted';
instance._applyFrostedCrystalSettings();
assert.equal(uniformValues.get('velora_frost_amount'), 0.34);
material.clear();
assert.equal(handlers.size, 0, 'material must disconnect mode listeners');

// Test the actual LiquidEffect.blur method, not a reimplementation. Frost
// adds blur only if the user has blur ON; Liquid restores the exact base.
const blurBegin = effectSource.indexOf('    _applyVeloraBlurRadius() {');
const blurEnd = effectSource.indexOf('\n    /**', blurBegin);
assert.ok(blurBegin >= 0 && blurEnd > blurBegin);
const methods = new Function(
    'return ({' + effectSource.slice(blurBegin, blurEnd) + '});'
)();
const blurRadii = [];
const fx = {
    _blur: {setBlurRadius: radius => blurRadii.push(radius)},
    _requestedBlurRadius: null,
    _frostAmount: 0,
    ...methods,
};
fx.setBlurRadius(7);
assert.equal(blurRadii.at(-1), 7);
fx._frostAmount = 0.78;
fx._applyVeloraBlurRadius();
assert.ok(Math.abs(blurRadii.at(-1) - 16.36) < 0.0001);
fx._frostAmount = 0;
fx._applyVeloraBlurRadius();
assert.equal(blurRadii.at(-1), 7, 'Liquid blur restored exactly');
fx._frostAmount = 0.78;
fx.setBlurRadius(0);
assert.equal(blurRadii.at(-1), 0, 'explicit blur off is respected');
fx._frostAmount = 0;
fx._applyVeloraBlurRadius();
assert.equal(blurRadii.at(-1), 0);

// Test wiring and safety contracts: no hidden second layer/GL pass,
// Liquid has an identity path, all shader paths use same matte+grain.
for (const uniformName of [
    'velora_frost_amount', 'velora_frost_grain', 'velora_frost_edge_glow',
])
    assert.match(shader, new RegExp('uniform float ' + uniformName + ';'));
assert.match(shader, /if \(frost < 0\.0001\)\s*return color;/);
assert.match(shader, /flatRgb = veloraCrystalBody\(flatRgb\)/);
assert.match(shader, /vec3 baseColor = veloraCrystalBody\(insideBaseColor\)/);
assert.equal(
    shader.match(/veloraCrystalGrain\(pixel_coord\)/g)?.length,
    2,
    'flat/full paths must share the same static grain implementation'
);
assert.doesNotMatch(shader, /sampler2D velora_/);
assert.match(canonicalSchema, /<key name="glass-style" type="s">/);
assert.match(canonicalSchema, /<default>'liquid'<\/default>/);
for (const key of ['frost-density', 'frost-grain', 'frost-edge-glow'])
    assert.match(canonicalSchema, new RegExp('<key name="' + key + '"'));
for (const key of [
    'velora-frost-amount', 'velora-frost-grain', 'velora-frost-edge-glow',
])
    assert.match(vendorSchema, new RegExp('<key name="' + key + '"'));
assert.match(prefs, /model: Gtk\.StringList\.new\(\[\s*'Liquid Glass',\s*'Frosted Crystal'/);
assert.match(prefs, /settings\.set_string\(\s*'glass-style'/);
assert.match(prefs, /changed::glass-style/);
assert.match(integration, /this\._applyFrostedCrystalSettings\(\)/);
assert.match(integration, /'frost-density',\s*'frost-grain',\s*'frost-edge-glow'/);
assert.doesNotMatch(method, /glass-displacement-scale|glass-chroma-strength|glass-rim-intensity/);

console.log('Liquid/Frosted live picker, persistable modes, matte shader, user optics and reversible blur PASS.');
