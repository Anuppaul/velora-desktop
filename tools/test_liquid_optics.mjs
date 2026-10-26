import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// The actual GJS source is evaluated with only its imports removed. This
// tests the shipped migration method rather than a second implementation.
async function loadSource(path) {
    return (await readFile(new URL(path, import.meta.url), 'utf8'))
        .replace(/^import[\s\S]*?;\s*$/gm, '')
        .replace(/^export\s+/gm, '');
}

const systemSource = await loadSource(
    '../gnome-shell/velora@wonderer.tech/glassMaterialSystem.js'
);
const roles = new Function(systemSource + '\nreturn VELORA_GLASS_ROLES;')();
const adapter = new Function(systemSource + '\nreturn VELORA_GLASS_ADAPTERS;')();

const runtimeSource = await loadSource(
    '../gnome-shell/velora@wonderer.tech/liquidGlassDock.js'
);
const Integration = new Function(
    'VELORA_GLASS_ROLES',
    runtimeSource + '\nreturn LiquidGlassIntegration;'
)(roles);

const optics = roles.innerCard.optics;
const seeded = new Map([
    ['glass-max-z', [118.0, 'max_z']],
    ['glass-displacement-scale', [42.0, 'displacement_scale']],
    ['glass-chroma-strength', [1.4, 'chroma_strength']],
    ['glass-specular-intensity', [0.55, 'specular_intensity']],
    ['glass-shininess', [62.0, 'shininess']],
    ['glass-rim-width', [2.8, 'rim_width']],
    ['glass-rim-intensity', [0.90, 'rim_intensity']],
    ['glass-rim-power', [2.3, 'rim_power']],
    ['glass-rim-light-color-intensity', [1.18, 'rim_light_color_intensity']],
    ['glass-sheen-intensity', [0.10, 'sheen_intensity']],
]);

function migrate(values, version = 8) {
    const writes = [];
    const original = new Map(values);
    const vendorSettings = {
        get_double: key => values.get(key),
        set_double(key, value) {
            writes.push([key, value]);
            values.set(key, value);
        },
    };
    const veloraSettings = {
        version,
        get_int: key => {
            if (key !== 'glass-optics-profile-version')
                throw new Error('Unexpected canonical get_int: ' + key);
            return veloraSettings.version;
        },
        set_int(key, value) {
            if (key !== 'glass-optics-profile-version')
                throw new Error('Unexpected canonical set_int: ' + key);
            veloraSettings.version = value;
        },
    };
    Integration.prototype._ensureFullGlassOpticsProfile.call({
        _settings: vendorSettings,
        _veloraSettings: veloraSettings,
    });
    return {values, original, writes, version: veloraSettings.version};
}

const baseline = new Map([...seeded].map(([key, [value]]) => [key, value]));
const migrated = migrate(baseline);
assert.equal(migrated.version, 9);
assert.equal(migrated.writes.length, seeded.size);
for (const [key, [, optic]] of seeded)
    assert.equal(migrated.values.get(key), optics[optic], key);

// Explicitly personalized controls must not be reset.
const customized = new Map([...seeded].map(([key, [value]]) => [key, value]));
customized.set('glass-max-z', 156);
customized.set('glass-rim-intensity', 0.37);
customized.set('glass-chroma-strength', 0.0);
const custom = migrate(customized);
assert.equal(custom.version, 9);
assert.equal(custom.values.get('glass-max-z'), 156);
assert.equal(custom.values.get('glass-rim-intensity'), 0.37);
assert.equal(custom.values.get('glass-chroma-strength'), 0.0);
assert.equal(custom.writes.length, seeded.size - 3);

// No operation is performed twice on an already migrated profile.
const repeated = migrate(migrated.values, 9);
assert.equal(repeated.writes.length, 0);
assert.equal(repeated.version, 9);

// User-requested stronger lens/glints without a new blur or capture pass.
// The previous 24 FPS scene cap and native compositor geometry are unchanged.
assert.ok(optics.displacement_scale > 42);
assert.ok(optics.max_z > 118);
assert.ok(optics.specular_intensity > 0.55);
assert.ok(optics.sheen_intensity > 0.10);
assert.ok(adapter.orb.hoverResponse > 0.38);
assert.equal(adapter.orb.sceneFpsCap, 24);
assert.equal(roles.innerCard.settingsOwnOptics, true);
assert.equal(roles.innerCard.blurMethod, 1);
assert.equal(roles.innerCard.blurMax, 7);

console.log('Liquid optics v9 migration, custom preferences and performance guards PASS.');
