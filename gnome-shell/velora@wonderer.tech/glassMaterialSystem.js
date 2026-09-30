import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Velora shared Liquid Glass material system.
//
// This module is the design-system layer above the generic vendored renderer.
// Surface adapters decide WHAT is glass (Date Menu cards, Quick Settings pods,
// notification cards, etc.); this file decides HOW Velora glass behaves.
//
// Keep visual constants here rather than scattering them across managers.
// Changing a role here intentionally updates every surface consuming that role.

export const GLASS_TEXT_PALETTE = Object.freeze({
    light: '#f7f8fc',
    dark: '#17191f',
});

export const GLASS_INTERACTION = Object.freeze({
    pressed: 1.0,
    engaged: 0.62,
    selected: 0.18,
    damping: 0.24,
    epsilon: 0.008,
});

const INNER_CARD_OPTICS = Object.freeze({
    max_z: 90.0,
    displacement_scale: 31.0,
    edge_smoothing: 0.82,
    profile_shape_n: 3.9,
    ior: 1.68,
    chroma_strength: 1.4,
    specular_intensity: 0.55,
    shininess: 62.0,
    rim_width: 2.8,
    rim_intensity: 0.90,
    rim_directional_power: 1.55,
    rim_power: 2.3,
    rim_light_color_intensity: 1.18,
    sheen_intensity: 0.10,
    light_angle_deg: 108.0,
    ao_intensity: 0.34,
    ao_radius: 1.3,
    shadow_radius: 0.0,
    shadow_intensity: 0.0,
});

const PREMIUM_CARD_ROLE = Object.freeze({
    optics: INNER_CARD_OPTICS,
    tintStrength: 0.026,
    blurScale: 0.85,
    blurMin: 4,
    blurMax: 7,
    contrastFloor: 1.04,
    multiRegion: true,
    surfaceLight: true,
    blurMethod: 1,
    interaction: GLASS_INTERACTION,
    text: GLASS_TEXT_PALETTE,
});

const CLEAN_POPUP_CHROME = Object.freeze({
    shadow: false,
    filterBorder: false,
    nativeBorder: false,
});

export const VELORA_GLASS_ROLES = Object.freeze({
    // Aliases intentionally point to the SAME frozen role object.
    // One material tune therefore updates every adopted Velora card surface.
    innerCard: PREMIUM_CARD_ROLE,
    quickMenuCard: PREMIUM_CARD_ROLE,
    notificationCard: PREMIUM_CARD_ROLE,
    shellCard: PREMIUM_CARD_ROLE,
    osdCard: PREMIUM_CARD_ROLE,
});

export const VELORA_GLASS_ADAPTERS = Object.freeze({
    dateMenu: Object.freeze({
        popupChrome: CLEAN_POPUP_CHROME,
    }),
    quickMenu: Object.freeze({
        enabled: true,
        animation: false,
        applyTo: 1,
        tintColor: '#ffffff',
        blurRadius: 6,
        baseColorStrength: 0.085,
        cornerRadius: 18.0,
        glassExpand: 0,
        xOffset: 0,
        yOffset: 0,
        brightness: 1.03,
        contrast: 1.06,
        saturation: 1.14,
        adaptiveText: true,
        adaptivePreference: 'auto',
        sampleIntervalMs: 900,

        // Date Menu and Quick Menu share the same one-rim popup policy.
        popupChrome: CLEAN_POPUP_CHROME,
        innerNativeBorder: false,
        innerNativeShadow: false,
    }),
    notificationBanner: Object.freeze({
        multiRegion: false,
        filterOpacityScale: 0.72,
        filterOpacityMax: 0.08,
        borderAlpha: 0.0,
    }),
    shellCard: Object.freeze({
        multiRegion: false,
        inheritGlobalTint: true,
        inheritGlobalBlur: true,
    }),
    osd: Object.freeze({
        multiRegion: false,
    }),

});

export function resolveShellAccentRgb(
    fallback = [1.0, 1.0, 1.0]
) {
    let probe = null;

    try {
        // Resolve the actual Shell theme token instead of mapping Ubuntu's
        // accent names to hardcoded RGB values. This follows Yaru/GNOME and
        // any future theme that provides -st-accent-color.
        probe = new St.Widget({
            reactive: false,
            style:
                'background-color: -st-accent-color; ' +
                'color: -st-accent-color;',
        });
        probe.set_size(1, 1);
        probe.opacity = 0;

        Main.layoutManager.uiGroup.add_child(probe);
        probe.ensure_style?.();

        const node = probe.get_theme_node?.();
        const bg = node?.get_background_color?.();
        const fg = node?.get_foreground_color?.();
        const color =
            bg && bg.alpha > 0
                ? bg
                : fg;

        if (color) {
            return [
                color.red / 255,
                color.green / 255,
                color.blue / 255,
            ];
        }
    } catch {
        // Theme token lookup is enhancement-only; caller keeps fallback.
    } finally {
        try {
            probe?.destroy?.();
        } catch {}
    }

    return fallback.slice();
}

export function clampGlass(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function resolveGlassInteractionTarget({
    pressed = false,
    engaged = false,
    selected = false,
} = {}, profile = GLASS_INTERACTION) {
    if (pressed)
        return profile.pressed;
    if (engaged)
        return profile.engaged;
    if (selected)
        return profile.selected;
    return 0.0;
}

export function stepGlassInteraction(
    previous,
    target,
    profile = GLASS_INTERACTION
) {
    let next =
        previous + (target - previous) * profile.damping;

    if (Math.abs(target - next) < profile.epsilon)
        next = target;

    return next;
}

export function resolveRoleBlur(baseBlur, role = VELORA_GLASS_ROLES.innerCard) {
    const blur = Number.isFinite(baseBlur) ? baseBlur : 7;
    return clampGlass(
        Math.round(blur * role.blurScale),
        role.blurMin,
        role.blurMax
    );
}

export function applyVeloraGlassRole(
    effect,
    role = VELORA_GLASS_ROLES.innerCard,
    {
        tintColor = [1, 1, 1],
        tintStrength = role.tintStrength,
        baseBlur = 7,
        blurRadius = null,
        cornerRadius = null,
        brightness = null,
        contrast = null,
        saturation = null,
        multiRegion = role.multiRegion,
    } = {}
) {
    if (!effect)
        return;

    const [r, g, b] = tintColor;

    effect.setTintColor?.(r, g, b);
    effect.setTintStrength?.(tintStrength);
    effect.setBlurRadius?.(
        blurRadius ?? resolveRoleBlur(baseBlur, role)
    );

    if (cornerRadius !== null)
        effect.setCornerRadius?.(cornerRadius);

    effect.setSurfaceLightEnabled?.(role.surfaceLight);
    effect.setBlurMethod?.(role.blurMethod);
    effect.setMultiRegionMode?.(multiRegion);

    if (brightness !== null)
        effect.setBrightness?.(brightness);
    if (contrast !== null)
        effect.setContrast?.(
            Math.max(role.contrastFloor ?? 0, contrast)
        );
    if (saturation !== null)
        effect.setSaturation?.(saturation);

    try {
        const uniforms = effect._uniforms;
        for (const [name, value] of Object.entries(role.optics))
            uniforms?.set?.(name, value);
        effect.queue_repaint?.();
    } catch {
        // The public renderer API remains sufficient if internals change.
    }
}
