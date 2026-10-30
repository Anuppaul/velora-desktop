import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const src = (await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/terminalBlurMask.js', import.meta.url
), 'utf8')).replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '');

class MockGLSLEffect {
    constructor() {
        this.snippets = [];
        this.uniforms = new Map();
        this.repaintCount = 0;
        this.forceBadUniform = false;
        this.vfunc_build_pipeline();
    }
    add_glsl_snippet(hook, declarations, code, replaced) {
        assert.equal(hook, 'FRAGMENT');
        assert.equal(replaced, false);
        this.snippets.push({declarations, code});
    }
    get_uniform_location(name) {
        return this.forceBadUniform ? -1 :
            ['velora_mask_size', 'velora_mask_radius',
                'velora_mask_inset'].indexOf(name);
    }
    set_uniform_float(index, count, value) {
        assert.ok(index >= 0);
        assert.equal(value.length, count);
        assert.ok(value.every(Number.isFinite));
        this.uniforms.set(index, value);
    }
    queue_repaint() {this.repaintCount++;}
}
const cacheKey = '__veloraPtyxisBlurOutputMaskClassV1';
const previousCache = globalThis[cacheKey];
delete globalThis[cacheKey];
let registrations = 0;
const instantiateModule = new Function('Cogl', 'GObject', 'Shell',
    src + '\nreturn {TerminalBlurOutputMask, MASK_CODE, EDGE_INSET, clampCornerRadius};'
);
const mockGObject = {registerClass(meta, ctor) {
    assert.equal(meta.GTypeName, 'VeloraPtyxisBlurOutputMaskV1');
    registrations++;
    if (registrations !== 1)
        throw new Error('native GType was registered twice during hot-swap');
    return ctor;
}};
const mockCogl = {SnippetHook: {FRAGMENT: 'FRAGMENT'}};
const mockShell = {GLSLEffect: MockGLSLEffect};
const api = instantiateModule(mockCogl, mockGObject, mockShell);
const reloaded = instantiateModule(mockCogl, mockGObject, mockShell);
assert.equal(reloaded.TerminalBlurOutputMask, api.TerminalBlurOutputMask,
    'Shell runtime revision must reuse the same GObject GType');
assert.equal(registrations, 1, 'only one native GType registration per session');
const effect = new api.TerminalBlurOutputMask();
assert.equal(effect.snippets.length, 1);
assert.match(effect.snippets[0].declarations, /uniform vec2 velora_mask_size/);
assert.match(effect.snippets[0].code, /cogl_color_out \*= coverage/);
assert.match(effect.snippets[0].code,
    /smoothstep\(-0\.6, 0\.6, signedDistance\)/);

effect.updateFrame(800, 600, 12);
assert.deepEqual(effect.uniforms.get(0), [800, 600]);
assert.deepEqual(effect.uniforms.get(1), [12]);
assert.deepEqual(effect.uniforms.get(2), [1.5]);
assert.equal(effect.repaintCount, 1);
effect.updateFrame(800, 600, 12);
assert.equal(effect.repaintCount, 1, 'do not upload on every compositor frame');
effect.updateFrame(740, 540, 12);
assert.deepEqual(effect.uniforms.get(0), [740, 540]);
effect.updateFrame(740, 540, 0);
assert.deepEqual(effect.uniforms.get(1), [0]);
assert.equal(effect.repaintCount, 3);

assert.equal(api.clampCornerRadius(800, 600, 12), 12);
assert.equal(api.clampCornerRadius(8, 8, 40), 2.5);
assert.equal(api.clampCornerRadius(0, 0, 12), null);
assert.throws(
    () => effect.updateFrame(0, 0, 12),
    /Invalid rounded-output mask geometry/
);
const unsupported = new api.TerminalBlurOutputMask();
unsupported.forceBadUniform = true;
assert.throws(
    () => unsupported.updateFrame(800, 600, 12),
    /Rounded-output mask shader uniforms unavailable/,
    'shader incompatibility must disable blur instead of showing leaked pixels'
);

// Independent mathematical reference for the shader's rounded-rectangle SDF.
// It tests exact boundary geometry, not a fabricated GPU screenshot.
function coverage(x, y, width, height, radius, inset = api.EDGE_INSET) {
    const halfX = width * 0.5 - inset;
    const halfY = height * 0.5 - inset;
    const dx = Math.abs(x - width * 0.5) - (halfX - radius);
    const dy = Math.abs(y - height * 0.5) - (halfY - radius);
    const distance = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
        + Math.min(Math.max(dx, dy), 0) - radius;
    const t = Math.max(0, Math.min(1, (distance + 0.6) / 1.2));
    return 1 - t * t * (3 - 2 * t);
}
assert.ok(coverage(400, 300, 800, 600, 12) > 0.99);
for(const [x,y] of [[0,0],[800,0],[0,600],[800,600],
                    [400,0],[400,600],[0,300],[800,300]]) {
    assert.equal(coverage(x, y, 800, 600, 12), 0,
        'blur must not paint outside frame edges or rounded corners');
}
assert.equal(coverage(400, 300, 800, 600, 0), 1);
if (previousCache === undefined)
    delete globalThis[cacheKey];
else
    globalThis[cacheKey] = previousCache;
console.log(
    'Ptyxis GNOME50 rounded output mask: GLSL uniforms, resize, ' +
    'rounded-frame SDF and fail-closed shader errors PASS.'
);
