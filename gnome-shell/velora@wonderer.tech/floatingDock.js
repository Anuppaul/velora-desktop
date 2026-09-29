import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {collectDockApps} from './apps.js';

const DOCK_PADDING_TOP = 16;
const DOCK_PADDING_RIGHT = 24;
const DOCK_PADDING_BOTTOM = 14;
const DOCK_PADDING_LEFT = 24;
const DOCK_REVEAL_PX = 7;
const DOCK_HOVER_SCALE = 0.95;
const GLASS_FILTER_INSET = 0;
const GLASS_RADIUS = 16;
const GLASS_BLUR_RADIUS = 11;
const GLASS_REFRACTION_PX = 10;
const GLASS_CHROMA_PX = 1.35;
const GLASS_BEVEL_PX = 14;
const GLASS_SATURATION = 1.5;
const GLASS_BRIGHTNESS = 1.1;

const GLASS_SHADER_SOURCE = `
uniform sampler2D cogl_sampler;
uniform float u_width;
uniform float u_height;
uniform float u_radius;
uniform float u_bevel;
uniform float u_refraction;
uniform float u_chroma;
uniform float u_saturation;
uniform float u_brightness;

float veloraRoundedRectSdf(vec2 p, vec2 halfSize, float radius) {
    vec2 q = abs(p) - (halfSize - vec2(radius));
    return length(max(q, vec2(0.0))) +
        min(max(q.x, q.y), 0.0) - radius;
}

vec2 veloraRoundedRectNormal(vec2 p, vec2 halfSize, float radius) {
    const float eps = 0.75;
    float dx = veloraRoundedRectSdf(
        p + vec2(eps, 0.0), halfSize, radius
    ) - veloraRoundedRectSdf(
        p - vec2(eps, 0.0), halfSize, radius
    );
    float dy = veloraRoundedRectSdf(
        p + vec2(0.0, eps), halfSize, radius
    ) - veloraRoundedRectSdf(
        p - vec2(0.0, eps), halfSize, radius
    );
    vec2 n = vec2(dx, dy);
    return n / max(length(n), 0.0001);
}

void main() {
    vec2 uv = cogl_tex_coord_in[0].st;
    vec2 safeSize = vec2(max(u_width, 1.0), max(u_height, 1.0));
    vec2 halfSize = safeSize * 0.5;
    vec2 p = (uv - vec2(0.5)) * safeSize;
    float radius = min(u_radius, min(halfSize.x, halfSize.y) - 1.0);
    float sdf = veloraRoundedRectSdf(p, halfSize, radius);
    float mask = 1.0 - smoothstep(-0.65, 0.65, sdf);
    float edge = smoothstep(-u_bevel, 0.0, sdf) * mask;
    edge = edge * edge * (3.0 - 2.0 * edge);

    vec2 normal = veloraRoundedRectNormal(p, halfSize, radius);
    vec2 pixel = vec2(1.0) / safeSize;
    vec2 refractedUv = clamp(
        uv - normal * (u_refraction * edge) * pixel,
        pixel * 0.75,
        vec2(1.0) - pixel * 0.75
    );
    vec2 chromaShift = normal * (u_chroma * edge) * pixel;

    vec4 redSample = texture2D(
        cogl_sampler,
        clamp(refractedUv - chromaShift, vec2(0.0), vec2(1.0))
    );
    vec4 greenSample = texture2D(cogl_sampler, refractedUv);
    vec4 blueSample = texture2D(
        cogl_sampler,
        clamp(refractedUv + chromaShift, vec2(0.0), vec2(1.0))
    );

    vec3 rgb = vec3(redSample.r, greenSample.g, blueSample.b);
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3(luma), rgb, u_saturation) * u_brightness;

    vec2 lightDir = normalize(vec2(-0.72, -1.0));
    float directionalRim = pow(max(dot(normal, lightDir), 0.0), 2.2);
    float rim = edge * (0.035 + 0.105 * directionalRim);
    rgb += vec3(rim);

    float alpha = greenSample.a * mask;
    cogl_color_out = vec4(rgb * mask, alpha) * cogl_color_in;
}
`;

export class FloatingDockController {
    constructor(params) {
        this._settings = params.settings;
        this._appSystem = params.appSystem;
        this._shellSettings = params.shellSettings;
        this._layer = params.layer;
        this._showPreview = params.showPreview;
        this._hidePreview = params.hidePreview;
        this._cancelPreviewHide = params.cancelPreviewHide;
        this._schedulePreviewHide = params.schedulePreviewHide;
        this._isPreviewVisible = params.isPreviewVisible;
        this._showTooltip = params.showTooltip;
        this._hideTooltip = params.hideTooltip;

        this._root = null;
        this._glassFilter = null;
        this._glassOverlay = null;
        this._glassSpecular = null;
        this._box = null;
        this._buttons = [];
        this._hideTimeoutId = 0;
        this._hidden = false;
        this._blurEffect = null;
        this._refractionEffect = null;
    }

    setEnabled(enabled) {
        if (enabled)
            this.enable();
        else
            this.disable();
    }

    enable() {
        if (this._root)
            return;

        this._root = new St.Widget({
            name: 'velora-floating-liquid-dock',
            style_class: 'velora-glass-container',
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._root.set_pivot_point(0.5, 0.5);

        this._glassFilter = new St.Widget({
            style_class: 'velora-glass-filter',
            reactive: false,
        });
        this._glassOverlay = new St.Widget({
            style_class: 'velora-glass-overlay',
            reactive: false,
        });
        this._glassSpecular = new St.Widget({
            style_class: 'velora-glass-specular',
            reactive: false,
        });
        this._box = new St.BoxLayout({
            style_class: 'velora-glass-content',
        });

        this._root.add_child(this._glassFilter);
        this._root.add_child(this._glassOverlay);
        this._root.add_child(this._glassSpecular);
        this._root.add_child(this._box);
        this._layer.add_child(this._root);

        this._root.connect('notify::hover', () => {
            if (this._root.get_hover()) {
                this._cancelHide();
                this._reveal(true);
            } else {
                this._scheduleHide();
            }
        });

        this.refresh();

        this._root.opacity = 0;
        this._root.scale_x = 0.97;
        this._root.scale_y = 0.97;
        this._root.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    disable() {
        this._cancelHide();
        this._hideTooltip?.();
        this._hidePreview?.(true);

        this._clearGlassEffects();

        this._root?.destroy();
        this._root = null;
        this._glassFilter = null;
        this._glassOverlay = null;
        this._glassSpecular = null;
        this._box = null;
        this._buttons = [];
        this._blurEffect = null;
        this._refractionEffect = null;
        this._hidden = false;
    }

    destroy() {
        this.disable();

        this._isPreviewVisible = null;
        this._settings = null;
        this._appSystem = null;
        this._shellSettings = null;
        this._layer = null;
    }

    refresh() {
        if (!this._root || !this._box)
            return;

        this._hideTooltip?.();
        this._hidePreview?.(true);

        for (const child of this._box.get_children())
            child.destroy();

        this._buttons = [];

        const apps = collectDockApps(
            this._appSystem,
            this._shellSettings
        );

        if (apps.length === 0) {
            this._root.hide();
            return;
        }

        this._root.show();

        const position = this._settings.get_string(
            'floating-dock-position'
        );
        const vertical =
            position === 'left' || position === 'right';
        const iconSize = this._settings.get_int(
            'floating-dock-icon-size'
        );
        const gap = this._settings.get_int(
            'floating-dock-gap'
        );

        this._box.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        this._box.set_style('spacing: ' + gap + 'px;');

        for (const app of apps) {
            const button = this._createAppButton(
                app,
                iconSize,
                position
            );
            this._box.add_child(button);
            this._buttons.push(button);
        }

        const count = this._buttons.length;
        const contentWidth = vertical
            ? iconSize
            : count * iconSize +
              Math.max(0, count - 1) * gap;
        const contentHeight = vertical
            ? count * iconSize +
              Math.max(0, count - 1) * gap
            : iconSize;

        const width =
            contentWidth +
            DOCK_PADDING_LEFT +
            DOCK_PADDING_RIGHT;
        const height =
            contentHeight +
            DOCK_PADDING_TOP +
            DOCK_PADDING_BOTTOM;

        this._box.set_position(
            DOCK_PADDING_LEFT,
            DOCK_PADDING_TOP
        );
        this._box.set_size(
            contentWidth,
            contentHeight
        );

        this._root.set_size(width, height);
        this._layoutGlassLayers(width, height);
        this._syncOverlay();
        this._syncBlur();
        this.reposition(false);

        if (
            this._settings.get_boolean(
                'floating-dock-auto-hide'
            )
        ) {
            this._scheduleHide();
        }
    }

    syncSettings() {
        if (!this._root)
            return;

        this.refresh();

        if (
            !this._settings.get_boolean(
                'floating-dock-auto-hide'
            )
        ) {
            this._reveal(false);
        }
    }

    _layoutGlassLayers(width, height) {
        if (
            !this._glassFilter ||
            !this._glassOverlay ||
            !this._glassSpecular
        ) {
            return;
        }

        this._glassFilter.set_position(
            GLASS_FILTER_INSET,
            GLASS_FILTER_INSET
        );
        this._glassFilter.set_size(
            Math.max(
                1,
                width - GLASS_FILTER_INSET * 2
            ),
            Math.max(
                1,
                height - GLASS_FILTER_INSET * 2
            )
        );

        for (const actor of [
            this._glassOverlay,
            this._glassSpecular,
        ]) {
            actor.set_position(0, 0);
            actor.set_size(width, height);
        }

        this._syncRefractionUniforms();
    }

    reposition(animate = false) {
        if (!this._root)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const position = this._settings.get_string(
            'floating-dock-position'
        );
        const offset = this._settings.get_int(
            'floating-dock-edge-offset'
        );
        const width = this._root.width;
        const height = this._root.height;

        let x;
        let y;

        switch (position) {
        case 'top':
            x =
                monitor.x +
                (monitor.width - width) / 2;
            y = monitor.y + offset;
            break;
        case 'left':
            x = monitor.x + offset;
            y =
                monitor.y +
                (monitor.height - height) / 2;
            break;
        case 'right':
            x =
                monitor.x +
                monitor.width -
                width -
                offset;
            y =
                monitor.y +
                (monitor.height - height) / 2;
            break;
        case 'bottom':
        default:
            x =
                monitor.x +
                (monitor.width - width) / 2;
            y =
                monitor.y +
                monitor.height -
                height -
                offset;
            break;
        }

        if (this._hidden) {
            const hidden = this._hiddenPosition(
                position,
                monitor,
                x,
                y,
                width,
                height
            );
            x = hidden.x;
            y = hidden.y;
        }

        this._root.remove_all_transitions();

        if (animate) {
            this._root.ease({
                x: Math.round(x),
                y: Math.round(y),
                duration: 160,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._root.set_position(
                Math.round(x),
                Math.round(y)
            );
        }
    }

    _createAppButton(
        app,
        iconSize,
        dockPosition
    ) {
        const running =
            app.get_state() !== Shell.AppState.STOPPED;
        const textureSize = Math.max(
            12,
            Math.round(iconSize * 0.82)
        );

        const content = new St.Widget({
            style_class:
                'velora-floating-dock-icon-content',
            layout_manager: new Clutter.FixedLayout(),
        });
        content.set_size(iconSize, iconSize);

        const icon =
            app.create_icon_texture(textureSize);
        icon.set_position(
            Math.round(
                (iconSize - textureSize) / 2
            ),
            Math.round(
                (iconSize - textureSize) / 2
            ) - 1
        );
        content.add_child(icon);

        if (
            running &&
            this._settings.get_boolean(
                'show-running-indicator'
            )
        ) {
            const dotSize = Math.max(
                3,
                Math.round(iconSize * 0.08)
            );
            const dot = new St.Widget({
                style_class:
                    'velora-floating-dock-running-dot',
                reactive: false,
            });
            dot.set_size(dotSize, dotSize);
            dot.set_position(
                Math.round(
                    (iconSize - dotSize) / 2
                ),
                iconSize - dotSize - 2
            );
            content.add_child(dot);
        }

        const button = new St.Button({
            style_class: 'velora-floating-dock-icon',
            accessible_name: app.get_name(),
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: content,
        });

        button.set_size(iconSize, iconSize);
        button.set_pivot_point(0.5, 0.5);

        const previewSide =
            this._previewSideForDock(
                dockPosition
            );

        button.connect('notify::hover', () => {
            if (button.get_hover()) {
                this._cancelHide();
                this._cancelPreviewHide?.();

                button.ease({
                    scale_x: DOCK_HOVER_SCALE,
                    scale_y: DOCK_HOVER_SCALE,
                    duration: 400,
                    mode:
                        Clutter.AnimationMode
                            .EASE_OUT_BACK,
                });

                const previewShown =
                    this._showPreview?.(
                        app,
                        button,
                        previewSide
                    ) ?? false;

                if (previewShown) {
                    this._hideTooltip?.();
                } else if (
                    this._settings.get_boolean(
                        'show-tooltips'
                    )
                ) {
                    this._showTooltip?.(
                        app.get_name(),
                        button
                    );
                }
            } else {
                this._hideTooltip?.();
                this._schedulePreviewHide?.();

                button.ease({
                    scale_x: 1,
                    scale_y: 1,
                    duration: 400,
                    mode:
                        Clutter.AnimationMode
                            .EASE_OUT_BACK,
                });

                this._scheduleHide();
            }
        });

        button.connect('clicked', () => {
            this._hideTooltip?.();
            this._cancelPreviewHide?.();
            this._hidePreview?.(true);
            Main.overview.hide();
            app.activate();
        });

        return button;
    }

    _previewSideForDock(position) {
        switch (position) {
        case 'top':
            return 'bottom';
        case 'left':
            return 'right';
        case 'right':
            return 'left';
        case 'bottom':
        default:
            return 'top';
        }
    }

    _scheduleHide() {
        this._cancelHide();

        if (
            !this._root ||
            !this._settings.get_boolean(
                'floating-dock-auto-hide'
            ) ||
            this._root.get_hover() ||
            this._buttons.some(
                button => button.get_hover()
            ) ||
            this._isPreviewVisible?.()
        ) {
            return;
        }

        const delay = this._settings.get_int(
            'floating-dock-hide-delay'
        );

        if (delay <= 0) {
            this._hideToEdge();
            return;
        }

        this._hideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._hideTimeoutId = 0;

                if (!this._root)
                    return GLib.SOURCE_REMOVE;

                if (
                    this._root.get_hover() ||
                    this._buttons.some(
                        button => button.get_hover()
                    ) ||
                    this._isPreviewVisible?.()
                ) {
                    this._scheduleHide();
                    return GLib.SOURCE_REMOVE;
                }

                this._hideToEdge();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelHide() {
        if (!this._hideTimeoutId)
            return;

        GLib.source_remove(this._hideTimeoutId);
        this._hideTimeoutId = 0;
    }

    _hideToEdge() {
        if (!this._root || this._hidden)
            return;

        this._hidden = true;
        this.reposition(true);
    }

    _reveal(animate = true) {
        if (!this._root)
            return;

        if (!this._hidden) {
            this.reposition(animate);
            return;
        }

        this._hidden = false;
        this.reposition(animate);
    }

    _hiddenPosition(
        position,
        monitor,
        x,
        y,
        width,
        height
    ) {
        switch (position) {
        case 'top':
            return {
                x,
                y:
                    monitor.y -
                    height +
                    DOCK_REVEAL_PX,
            };
        case 'left':
            return {
                x:
                    monitor.x -
                    width +
                    DOCK_REVEAL_PX,
                y,
            };
        case 'right':
            return {
                x:
                    monitor.x +
                    monitor.width -
                    DOCK_REVEAL_PX,
                y,
            };
        case 'bottom':
        default:
            return {
                x,
                y:
                    monitor.y +
                    monitor.height -
                    DOCK_REVEAL_PX,
            };
        }
    }

    _clearGlassEffects() {
        if (!this._glassFilter)
            return;

        for (const effect of [
            this._refractionEffect,
            this._blurEffect,
        ]) {
            if (!effect)
                continue;

            try {
                this._glassFilter.remove_effect(effect);
            } catch {
                // Actor/effect may already be detached during hot reload.
            }
        }

        this._refractionEffect = null;
        this._blurEffect = null;
    }

    _createRefractionEffect() {
        const effect = new Clutter.ShaderEffect({
            shader_type: Clutter.ShaderType.FRAGMENT_SHADER,
        });

        if (!effect.set_shader_source(GLASS_SHADER_SOURCE))
            throw new Error('GNOME rejected the liquid-glass shader source');

        return effect;
    }

    _setRefractionFloat(name, value) {
        if (!this._refractionEffect)
            return;

        const uniform = new GObject.Value();
        uniform.init(GObject.TYPE_FLOAT);
        uniform.set_float(value);
        this._refractionEffect.set_uniform_value(name, uniform);
    }

    _syncRefractionUniforms() {
        if (!this._refractionEffect || !this._glassFilter)
            return;

        const width = Math.max(1, this._glassFilter.width);
        const height = Math.max(1, this._glassFilter.height);
        const radius = Math.min(
            GLASS_RADIUS,
            Math.max(1, Math.min(width, height) / 2 - 1)
        );

        try {
            this._setRefractionFloat('u_width', width);
            this._setRefractionFloat('u_height', height);
            this._setRefractionFloat('u_radius', radius);
            this._setRefractionFloat('u_bevel', GLASS_BEVEL_PX);
            this._setRefractionFloat(
                'u_refraction',
                GLASS_REFRACTION_PX
            );
            this._setRefractionFloat('u_chroma', GLASS_CHROMA_PX);
            this._setRefractionFloat(
                'u_saturation',
                GLASS_SATURATION
            );
            this._setRefractionFloat(
                'u_brightness',
                GLASS_BRIGHTNESS
            );
            this._refractionEffect.queue_repaint();
        } catch (error) {
            logError(
                error,
                'Velora Desktop: liquid-glass uniforms unavailable'
            );
        }
    }

    _syncBlur() {
        if (!this._glassFilter)
            return;

        this._clearGlassEffects();

        if (
            !this._settings.get_boolean(
                'floating-dock-blur'
            )
        ) {
            return;
        }

        try {
            this._blurEffect = new Shell.BlurEffect({
                brightness: 1.0,
                mode: Shell.BlurMode.BACKGROUND,
                radius: GLASS_BLUR_RADIUS,
            });
            this._glassFilter.add_effect(this._blurEffect);
        } catch (error) {
            this._blurEffect = null;
            logError(
                error,
                'Velora Desktop: background blur unavailable'
            );
            return;
        }

        try {
            // The web reference bends its backdrop with an SVG displacement
            // map. GNOME cannot execute that browser filter, so process the
            // compositor-native background blur with an offscreen fragment
            // shader instead: rounded edge refraction, RGB dispersion,
            // saturation, brightness and a restrained directional rim.
            this._refractionEffect = this._createRefractionEffect();
            this._glassFilter.add_effect(this._refractionEffect);
            this._syncRefractionUniforms();
        } catch (error) {
            // Keep the native background blur as a fully usable fallback.
            this._refractionEffect = null;
            logError(
                error,
                'Velora Desktop: liquid-glass refraction unavailable'
            );
        }
    }

    _syncOverlay() {
        if (!this._glassOverlay)
            return;

        // The reference dock preset uses frost=0.05. Keep that value near
        // Velora's default opacity while allowing a restrained film range.
        const opacity =
            this._settings.get_int(
                'floating-dock-opacity'
            ) / 100;
        const alpha = Math.max(
            0.005,
            Math.min(
                0.075,
                0.005 + 0.06 * opacity
            )
        );

        this._glassOverlay.set_style(
            'background-color: rgba(255,255,255,' +
            alpha.toFixed(3) +
            ');'
        );
    }
}
