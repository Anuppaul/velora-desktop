// Velora Ptyxis real-background-blur output mask (GNOME Shell 50).
//
// Shell.BlurEffect(BACKGROUND) is not aware of Wayland client-side rounded
// corners. Clutter.Actor.set_clip() is only a rectangular paint boundary,
// not an alpha mask on the final GPU blur output.
//
// Apply this Shell.GLSLEffect as the *outermost* effect, with BlurEffect
// nested inside it; it removes pixels OUTSIDE the frame's rounded region
// after blur and before the background is blended into the compositor.
//
// One offscreen pass for the terminal window only. No global stage shader,
// screenshot, native window alpha changes, external binary or bundled font.
//
// This module is original Velora source, not copied from third-party
// rounded-corners extensions.
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

export const MASK_EFFECT_NAME = 'velora-ptyxis-rounded-output-mask';
export const DEFAULT_CORNER_RADIUS = 12;
export const EDGE_INSET = 1.5;

// GNOME Shell 50 uses Shell.GLSLEffect. The GLSL snippet is appended to
// CogI's fragment pipeline and changes only final premultiplied output alpha.
// Normal native Ptyxis text is a sibling ABOVE the masked blur actor and
// stays untouched.
export const MASK_DECLARATIONS = `
uniform vec2 velora_mask_size;
uniform float velora_mask_radius;
uniform float velora_mask_inset;
`;

export const MASK_CODE = `
    vec2 maskSize = max(velora_mask_size, vec2(1.0));
    vec2 coord = cogl_tex_coord_in[0].xy * maskSize;
    float inset = clamp(velora_mask_inset, 0.0,
                        0.45 * min(maskSize.x, maskSize.y));
    vec2 halfSize = maskSize * 0.5 - vec2(inset);
    float maxRadius = max(0.0, min(halfSize.x, halfSize.y));
    float corner = clamp(velora_mask_radius, 0.0, maxRadius);
    vec2 shifted = abs(coord - maskSize * 0.5);
    vec2 diff = shifted - (halfSize - vec2(corner));
    float signedDistance = length(max(diff, vec2(0.0)))
        + min(max(diff.x, diff.y), 0.0) - corner;
    float coverage = 1.0 - smoothstep(-0.6, 0.6, signedDistance);
    cogl_color_out *= coverage;
`;

export function clampCornerRadius(width, height, requested) {
    if (![width, height, requested].every(Number.isFinite) ||
        width < 2 || height < 2)
        return null;
    return Math.max(0, Math.min(
        requested, Math.max(0, Math.min(width, height) / 2 - EDGE_INSET)
    ));
}

export const TerminalBlurOutputMask = GObject.registerClass(
    {GTypeName: 'VeloraPtyxisBlurOutputMaskV1'},
    class TerminalBlurOutputMask extends Shell.GLSLEffect {
        _locations = null;
        _lastSize = null;

        vfunc_build_pipeline() {
            // Must register the snippet during GType class construction.
            // uniform locations are not available until super._init returns.
            this.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                MASK_DECLARATIONS,
                MASK_CODE,
                false
            );
        }

        updateFrame(width, height, requestedCornerRadius) {
            const radius = clampCornerRadius(
                width, height, requestedCornerRadius
            );
            if (radius === null)
                throw new Error('Invalid rounded-output mask geometry');

            if (
                this._lastSize &&
                this._lastSize[0] === width &&
                this._lastSize[1] === height &&
                this._lastSize[2] === radius
            ) {
                return;
            }

            if (!this._locations) {
                // GNOME Shell 50: call these ONLY after the constructor.
                this._locations = {
                    size: this.get_uniform_location('velora_mask_size'),
                    radius: this.get_uniform_location('velora_mask_radius'),
                    inset: this.get_uniform_location('velora_mask_inset'),
                };
                if (Object.values(this._locations).some(n =>
                    !Number.isInteger(n) || n < 0
                )) {
                    throw new Error('Rounded-output mask shader uniforms unavailable');
                }
            }

            this.set_uniform_float(this._locations.size, 2, [width, height]);
            this.set_uniform_float(this._locations.radius, 1, [radius]);
            this.set_uniform_float(this._locations.inset, 1, [EDGE_INSET]);
            this._lastSize = [width, height, radius];
            this.queue_repaint();
        }
    }
);
