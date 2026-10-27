import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

// Exactly one compositor-native color pass per visible wallpaper source.
// The original wallpaper image remains owned by GNOME/Mutter; no screenshots,
// texture uploads, animated noise, or modifications to GNOME picture settings.
//
// Shell.GLSLEffect is supported by GNOME Shell 50. Clutter.ShaderEffect is
// the forward-compatible fallback. Neither effect is ever attached to
// Main.uiGroup, the entire stage or live application windows.
export const ATMOSPHERE_UNIFORMS = Object.freeze([
    'va_resolution',
    'va_filmic',
    'va_vignette',
    'va_ambient',
    'va_grain',
    'va_adaptive',
]);

export const ATMOSPHERE_DECLARATIONS = `
uniform vec2 va_resolution;
uniform float va_filmic;
uniform float va_vignette;
uniform float va_ambient;
uniform float va_grain;
uniform float va_adaptive;

float va_luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// 1-pixel, screen-static mineral grain; no time input, no new sampler.
float va_static_noise(vec2 pixel) {
    return fract(sin(dot(floor(pixel), vec2(12.9898, 78.233)))
        * 43758.5453) - 0.5;
}
`;

export const ATMOSPHERE_FRAGMENT = `
// The source actor is a native wallpaper, never a desktop/window composite.
vec2 uv = cogl_tex_coord_in[0].xy;
vec4 original = texture2D(cogl_sampler0, uv);
vec3 color = original.rgb / max(original.a, 0.0001);
float luma = va_luminance(color);

// Filmic grading: retain original hue, soften digital saturation and the
// harshest highlights, and add a little weight to deep shadows.
vec3 filmic = mix(color, vec3(luma), 0.18 * va_filmic);
float shadowWeight = 1.0 - smoothstep(0.06, 0.42, luma);
float highlightWeight = smoothstep(0.65, 1.0, luma);
filmic *= 1.0 - shadowWeight * 0.065 * va_filmic;
filmic = mix(filmic, vec3(luma), 0.055 * va_filmic * highlightWeight);
color = filmic;

// Adaptive contrast: gently separate midtone values without clipping
// shadow detail or blowing out whites. Per-pixel luma is sufficient here:
// wallpaper-image readback and CPU histograms are deliberately avoided.
vec3 contrastColor = mix(
    vec3(0.5), color,
    1.0 + 0.17 * va_adaptive * (1.0 - 0.55 * highlightWeight)
);
color = contrastColor;
float darkDetail = 1.0 - smoothstep(0.035, 0.26, luma);
color += vec3(darkDetail * 0.035 * va_adaptive);

// Soft per-monitor lens vignette. No hard corners, opaque radial gradient,
// second St.Widget, animated effect or blur radius change.
vec2 centered = (uv - vec2(0.5)) * vec2(1.85, 1.55);
float outerEdge = smoothstep(0.53, 1.30, length(centered));
color *= 1.0 - outerEdge * 0.27 * clamp(va_vignette, 0.0, 1.0);

// Adaptive local ambient color. Pixel warmth/coolness is inferred from
// the existing wallpaper sample: no additional scene capture.
float warmth = clamp(0.5 + (color.r - color.b) * 0.90, 0.0, 1.0);
vec3 ambientColor = mix(
    vec3(0.80, 0.90, 1.00),
    vec3(1.00, 0.94, 0.82),
    warmth
);
float ambientRoom = 1.0 - 0.68 * smoothstep(0.75, 1.0, luma);
color += ambientColor * 0.095 * clamp(va_ambient, 0.0, 1.0)
    * ambientRoom * (1.0 - 0.35 * outerEdge);

// Static dust: subtle monochrome texture instead of television-style
// color noise. Grain follows source pixels and never requests a new frame.
float dust = va_static_noise(uv * max(va_resolution, vec2(1.0)));
color += vec3(dust * 0.48 * clamp(va_grain, 0.0, 1.0));

color = clamp(color, vec3(0.0), vec3(1.0));
// Offscreen Cogl uses premultiplied-alpha compositing; preserve the wallpaper
// transparency/cross-fade and never leak a colored square into empty pixels.
cogl_color_out = vec4(color * original.a, original.a) * cogl_color_in;
`;

const CACHE_KEY = Symbol.for('velora.atmosphere.effect.class.v1');

export function getAtmosphereEffectClass() {
    // Velora can hot-reload runtime JS under a fresh module URI without
    // restarting GNOME Shell. GObject classes cannot be registered again
    // with the same GTypeName in one process; reuse the registered class.
    if (globalThis[CACHE_KEY])
        return globalThis[CACHE_KEY];

    const Base = Shell.GLSLEffect ?? Clutter.ShaderEffect;
    if (!Base)
        throw new Error('GNOME GLSL shader effects are unavailable');

    class WallpaperAtmosphereEffect extends Base {
        _init() {
            super._init();
            this._locations = new Map();
            for (const name of ATMOSPHERE_UNIFORMS) {
                this._locations.set(name,
                    Shell.GLSLEffect
                        ? this.get_uniform_location(name)
                        : name
                );
            }
            this._lastResolutionKey = '';
            this._lastProfile = '';
            this.configure([0, 0, 0, 0, 0]);
        }

        _set(name, values) {
            const location = this._locations.get(name);
            if (location === null || location === undefined ||
                location === -1)
                return;
            this.set_uniform_float(location, values.length, values);
        }

        configure(values) {
            const normalized = values.map(value => Math.min(
                1, Math.max(0, Number.isFinite(value) ? value / 100 : 0)
            ));
            const key = normalized.join(':');
            if (key === this._lastProfile)
                return;
            this._lastProfile = key;
            for (let i = 0; i < normalized.length; i++)
                this._set(ATMOSPHERE_UNIFORMS[i + 1], [normalized[i]]);
            this.queue_repaint();
        }

        vfunc_paint_target(node, paintContext) {
            const texture = this.get_texture();
            if (texture) {
                const w = texture.get_width();
                const h = texture.get_height();
                const key = w + ':' + h;
                if (key !== this._lastResolutionKey) {
                    this._lastResolutionKey = key;
                    this._set('va_resolution', [Math.max(1, w), Math.max(1, h)]);
                }
            }
            super.vfunc_paint_target(node, paintContext);
        }
    }

    if (Shell.GLSLEffect) {
        Object.defineProperty(WallpaperAtmosphereEffect.prototype,
            'vfunc_build_pipeline', {
                value() {
                    this.add_glsl_snippet(
                        Cogl.SnippetHook.FRAGMENT,
                        ATMOSPHERE_DECLARATIONS,
                        ATMOSPHERE_FRAGMENT,
                        true
                    );
                },
            });
    } else {
        Object.defineProperty(WallpaperAtmosphereEffect.prototype,
            'vfunc_get_static_snippet', {
                value() {
                    const snippet = Cogl.Snippet.new(
                        Cogl.SnippetHook.FRAGMENT,
                        ATMOSPHERE_DECLARATIONS,
                        null
                    );
                    snippet.set_replace(ATMOSPHERE_FRAGMENT);
                    return snippet;
                },
            });
    }

    const Effect = GObject.registerClass(
        {GTypeName: 'VeloraAtmosphereShaderEffectV1'},
        WallpaperAtmosphereEffect
    );
    globalThis[CACHE_KEY] = Effect;
    return Effect;
}
