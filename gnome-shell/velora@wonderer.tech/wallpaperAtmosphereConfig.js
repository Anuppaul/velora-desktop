// Velora Atmosphere: one canonical preset catalog for GJS runtime and Prefs.
// Original is intentionally the default and does not overwrite a user's
// wallpaper or previously customized Atmosphere values.
export const ATMOSPHERE_KEYS = Object.freeze([
    'wallpaper-filmic',
    'wallpaper-vignette',
    'wallpaper-ambient',
    'wallpaper-grain',
    'wallpaper-adaptive-contrast',
]);

export const ATMOSPHERE_PRESETS = Object.freeze([
    Object.freeze({
        id: 'original',
        label: 'Original',
        description: 'Unmodified GNOME wallpaper. No Atmosphere GPU effect.',
        values: null,
    }),
    Object.freeze({
        id: 'natural',
        label: 'Velora Natural',
        description: 'Clean color grading, mild depth and delicate light.',
        values: Object.freeze([10, 5, 3, 1, 8]),
    }),
    Object.freeze({
        id: 'cinematic',
        label: 'Velora Cinematic',
        description: 'Richer tones, pronounced yet restrained vignette.',
        values: Object.freeze([22, 13, 5, 2, 16]),
    }),
    Object.freeze({
        id: 'atmosphere',
        label: 'Velora Atmosphere',
        description: 'Balanced filmic depth, soft ambient color and static grain.',
        values: Object.freeze([14, 8, 6, 2, 14]),
    }),
    Object.freeze({
        id: 'custom',
        label: 'Custom',
        description: 'Use your individually adjusted effect values.',
        values: null,
    }),
]);

export function readAtmosphereProfile(settings) {
    if (!settings)
        return {style: 'original', active: false, values: [0, 0, 0, 0, 0]};

    let style = 'original';
    try {
        style = settings.get_string('wallpaper-style');
    } catch {}

    if (!ATMOSPHERE_PRESETS.some(item => item.id === style))
        style = 'original';

    const values = ATMOSPHERE_KEYS.map(key => {
        let value = 0;
        try {
            value = settings.get_int(key);
        } catch {}
        return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    });

    return {
        style,
        // Switching to Original fully detaches GPU passes even when the
        // numeric sliders have retained the user's last preset/custom values.
        active: style !== 'original' && values.some(value => value > 0),
        values,
    };
}
