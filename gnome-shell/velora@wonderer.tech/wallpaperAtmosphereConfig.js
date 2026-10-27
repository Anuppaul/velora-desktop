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
        values: Object.freeze([38, 24, 22, 2, 34]),
    }),
    Object.freeze({
        id: 'cinematic',
        label: 'Velora Cinematic',
        description: 'Richer tones, pronounced yet restrained vignette.',
        values: Object.freeze([78, 70, 34, 4, 72]),
    }),
    Object.freeze({
        id: 'atmosphere',
        label: 'Velora Atmosphere',
        description: 'Balanced filmic depth, soft ambient color and static grain.',
        values: Object.freeze([62, 52, 54, 3, 56]),
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

    const savedValues = ATMOSPHERE_KEYS.map(key => {
        let value = 0;
        try {
            value = settings.get_int(key);
        } catch {}
        return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    });

    // A named style is defined by its CANONICAL preset, not by sliders last
    // written by an earlier Velora release. PR #62 shipped intentionally
    // near-invisible presets: people with 'atmosphere' selected may still
    // have those old numbers saved. Resolving a named preset here makes
    // the new filmic profile visible immediately after upgrading, without
    // silently destroying the user's retained Custom settings. 'original'
    // does not allocate effects; 'custom' reads exactly the saved numbers.
    const preset = ATMOSPHERE_PRESETS.find(item => item.id === style);
    const values = preset?.values
        ? [...preset.values]
        : savedValues;

    return {
        style,
        // Switching to Original fully detaches GPU passes even when the
        // numeric sliders have retained the user's last preset/custom values.
        active: style !== 'original' && values.some(value => value > 0),
        values,
    };
}
