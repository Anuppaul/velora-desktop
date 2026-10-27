import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Regression for Velora's *one* adaptive icy-blue edge, within the existing
// LiquidEffect shader. Tests its source-level SDF/alpha/contrast contract and
// a numeric reproduction of its documented coefficients. These assertions
// are not a replacement for live GNOME Shell 50 compositor screenshots.
const base = '../gnome-shell/velora@wonderer.tech/';
const shader = await readFile(
    new URL(base + 'vendor/liquid-glass/shaders/glass.frag', import.meta.url),
    'utf8'
);
const css = await readFile(
    new URL(base + 'runtime.css', import.meta.url), 'utf8'
);

const start = shader.indexOf('vec3 veloraAdaptiveCardEdgeColor(');
const end = shader.indexOf('// [NEW] Adjust color saturation, contrast, brightness', start);
assert.ok(start > 0 && end > start);
const helpers = shader.slice(start, end);
const blend = shader.indexOf('litColor = mix(litColor, edgeBlue, edgeCoverage);');
const premultiply = shader.indexOf('vec3 finalRgb   = litColor * alpha');
const earlierExit = shader.indexOf('if (early_exit_enabled > 0.5 && debug_view < 0.5 && -d >= interiorThreshold)');
assert.ok(blend > earlierExit && premultiply > blend,
    'the new rim must be applied only at full-path edges before premultiplied-alpha');
assert.equal(shader.split('veloraAdaptiveCardEdgeCoverage(d);').length - 1, 1,
    'one actual rim per glass region, not layered strokes');

assert.match(helpers, /vec3\(0\.76, 0\.88, 1\.00\)/,
    'icy blue on dark surfaces');
assert.match(helpers, /vec3\(0\.24, 0\.49, 0\.75\)/,
    'steel blue on bright surfaces');
assert.match(helpers, /dot\(backdrop, vec3\(0\.2126, 0\.7152, 0\.0722\)\)/);
assert.match(helpers, /dot\(body, vec3\(0\.2126, 0\.7152, 0\.0722\)\)/);
assert.match(helpers, /float lightBackdrop = smoothstep\(0\.32, 0\.75, contextLuma\)/);
assert.match(helpers, /smoothstep\(0\.12, 1\.48, depth\)/);
assert.match(helpers, /smoothstep\(0\.70, 3\.10, depth\)/);
assert.match(helpers, /hairline \* 0\.46 \+ innerFeather \* 0\.08/);
assert.match(shader, /if \(surface_light_enabled > 0\.5 &&\s*d > -3\.10 && d < edgeFeather\)/,
    'no accidental edge treatment on application windows or full-screen FBO');
assert.match(shader, /edgeCoverage \*= mix\(\s*1\.0,\s*0\.87,/,
    'Frosted has a calmer optical contour without losing contrast');
assert.match(shader, /float insideMask = 1\.0 - outsideTransition;/);
assert.match(shader, /vec3 finalRgb\s*=\s*litColor \* alpha \+ shadowColor \* shadowContribution;/);
assert.doesNotMatch(helpers, /texture2D|sampler2D|cogl_sampler|time|frame|new Texture/i,
    'contrast adaptation must reuse already-sampled color, no fetches/no animated grain');
assert.doesNotMatch(shader.slice(blend - 600, premultiply), /cogl_color_out\s*=/,
    'no separate quad or unmasked compositing for blue rim');

// The existing native preview remains a single refractive material: a
// separate CSS border/veil must not silently return.
const preview = css.match(/\.velora-app-preview-card\.velora-liquid-shell-card\s*\{([^}]*)\}/)?.[1];
assert.ok(preview);
assert.match(preview, /background-color:\s*transparent\s*!important/);
assert.match(preview, /border-color:\s*transparent\s*!important/);

// Numerical contrast check using the shader's exact color and SDF constants.
const clamp = x => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};
const rgbLuma = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const mix = (a, b, t) => a * (1 - t) + b * t;
function opticalEdge(backdrop, body, frost, signedDistance = -0.2) {
    const context = mix(
        rgbLuma(backdrop),
        rgbLuma(body),
        smoothstep(0.15, 0.75, clamp(frost)) * 0.82
    );
    const lightBackdrop = smoothstep(0.32, 0.75, context);
    const color = [0.76, 0.88, 1.0].map((v, i) =>
        mix(v, [0.24, 0.49, 0.75][i], lightBackdrop)
    );
    const depth = Math.max(-signedDistance, 0);
    const hairline = 1 - smoothstep(0.12, 1.48, depth);
    const feather = 1 - smoothstep(0.70, 3.10, depth);
    const coverage = Math.min(
        0.56, Math.max(0, hairline * 0.46 + feather * 0.08)
    ) * mix(1, 0.87, clamp(frost));
    return {
        color,
        coverage,
        final: body.map((v, i) => mix(v, color[i], coverage)),
    };
}
const white = [0.98, 0.98, 0.98];
const black = [0.05, 0.06, 0.075];
const whiteEdge = opticalEdge(white, white, 0);
const blackEdge = opticalEdge(black, black, 0);
assert.ok(rgbLuma(white) - rgbLuma(whiteEdge.final) > 0.17,
    'white wallpaper still gets a clearly distinguishable darker blue edge');
assert.ok(rgbLuma(blackEdge.final) - rgbLuma(black) > 0.25,
    'dark wallpaper still gets a distinguishable pale blue edge');
assert.ok(whiteEdge.color[0] < blackEdge.color[0],
    'light/dark backgrounds must select contrasting bluish shades');
assert.ok(whiteEdge.coverage <= 0.56 && blackEdge.coverage <= 0.56,
    'inside color mix stays bounded');
const frosted = opticalEdge(black, [0.93, 0.95, 0.98], 0.88);
assert.ok(rgbLuma([0.93, 0.95, 0.98]) - rgbLuma(frosted.final) > 0.10,
    'bright frosted-matte card stays visibly edged over dark wallpaper');
assert.ok(opticalEdge(white, white, 0, -3.1).coverage < 0.0001,
    'no accidental inner plate beyond the 3.1px contour');

// Shader keeps original quick-settings glass regions, exact 16:9 running
// window previews and zero extra actors/passes (CI also runs their own tests).
assert.match(shader, /multi_region_mode > 0\.5/);
assert.match(shader, /vec4\(finalRgb, finalAlpha\) \* cogl_color_in/);
console.log('Contrast-adaptive ice-blue glass edge on bright/dark wallpaper, bounded SDF, no extra layer PASS.');
