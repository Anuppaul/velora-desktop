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

// Filmic color: stronger but restrained photographic tonality rather than
// PR #62's visually imperceptible 0.18 * 14% saturation adjustment.
// Saturation expands modestly (never hard grayscale or neon colors); a
// shoulder-preserving S-curve separates shadows and midtones with the
// original wallpaper hue intact. At Velora Atmosphere (62%) these changes
// are intentionally apparent in a direct Original/Atmosphere comparison.
float filmicStrength = clamp(va_filmic, 0.0, 1.0);
vec3 filmic = mix(vec3(luma), color, 1.0 + 0.27 * filmicStrength);
vec3 sCurve = filmic * filmic * (3.0 - 2.0 * filmic);
filmic = mix(filmic, sCurve, 0.68 * filmicStrength);
float shadowWeight = 1.0 - smoothstep(0.05, 0.52, luma);
float highlightWeight = smoothstep(0.42, 0.91, luma);
// Cool photographic shadows / natural warm highlights. Both are bounded
// by luminance so white wallpapers do not turn into blue-white glows.
filmic += filmicStrength * shadowWeight * vec3(-0.014, 0.006, 0.045);
filmic += filmicStrength * highlightWeight * vec3(0.024, 0.010, -0.020);
color = filmic;

// Adaptive contrast: a perceptible but softly rolled-off tonal expansion.
// Preserve whites using the highlight guard and lift very deep shadows
// instead of crushing them to black.
float adaptive = clamp(va_adaptive, 0.0, 1.0);
vec3 contrastColor = (color - vec3(0.5)) * (1.0 + 0.35 * adaptive)
    + vec3(0.5);
float highlightGuard = 1.0 - 0.65 * smoothstep(0.78, 1.0, luma);
color = mix(color, contrastColor, highlightGuard);
float darkDetail = 1.0 - smoothstep(0.035, 0.28, luma);
color += vec3(darkDetail * 0.060 * adaptive);
// Shadow safety floor: cinematic S-curves and adaptive contrast must not
// turn details in dark wallpapers into undifferentiated black regions.
color = max(color, original.rgb / max(original.a, 0.0001)
    * (1.0 - 0.22 * adaptive));
// Prevent filmic highlights/ambient color from flattening near-white
// gradients into clipped pure white, while allowing a visible vignette.
float protectHighlights = smoothstep(0.86, 1.0, luma) * 0.72;
color = mix(color, original.rgb / max(original.a, 0.0001),
    protectHighlights);

// Shaped vignette with a wide, clean central plateau; 52% intensity now
// gives up to ~22% corner depth rather than the old barely visible ~2%.
// Keep it in the same fragment pass: no second screen overlay.
vec2 centered = (uv - vec2(0.5)) * vec2(1.88, 1.70);
float outerEdge = smoothstep(0.38, 1.25, length(centered));
color *= 1.0 - outerEdge * 0.42 * clamp(va_vignette, 0.0, 1.0);

// Ambient color adapts to the existing wallpaper pixel (no CPU sampling):
// restrained cool-blue shading for cooler pictures, warm-gold for warmer
// pictures. Vignette is computed above so edges receive a softer glow.
float warmth = clamp(0.5 + (color.r - color.b) * 0.90, 0.0, 1.0);
vec3 ambientColor = mix(
    vec3(0.84, 0.96, 1.12),
    vec3(1.13, 1.02, 0.86),
    warmth
);
float ambientRoom = 1.0 - 0.55 * smoothstep(0.75, 1.0, luma);
float ambientStrength = 0.62 * clamp(va_ambient, 0.0, 1.0)
    * ambientRoom * (1.0 - 0.22 * outerEdge);
color *= mix(vec3(1.0), ambientColor, ambientStrength);

// Very fine deterministic 1px grain. It does NOT animate, re-sample the
// wallpaper, write a texture or request another compositor frame. Retain
// a conservative ceiling here: visibility should come from COLOR/LIGHT,
// not from grain making text or wallpaper details dirty.
float dust = va_static_noise(uv * max(va_resolution, vec2(1.0)));
color += vec3(dust * 0.18 * clamp(va_grain, 0.0, 1.0));

color = clamp(color, vec3(0.0), vec3(1.0));
// Offscreen Cogl uses premultiplied-alpha compositing; preserve the wallpaper
// transparency/cross-fade and never leak a colored square into empty pixels.
cogl_color_out = vec4(color * original.a, original.a) * cogl_color_in;
`;

// The V1 GObject class from PR #62 is immutable inside a running GNOME
// Shell process. Using a new GTypeName/cache key is REQUIRED for this new
// GLSL code to take effect on Velora live hot-swaps without logout.
const CACHE_KEY = Symbol.for('velora.atmosphere.effect.class.v2');

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
        {GTypeName: 'VeloraAtmosphereShaderEffectV2'},
        WallpaperAtmosphereEffect
    );
    globalThis[CACHE_KEY] = Effect;
    return Effect;
}
