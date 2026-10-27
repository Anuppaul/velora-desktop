import {
    ATMOSPHERE_KEYS,
    ATMOSPHERE_PRESETS,
    readAtmosphereProfile,
} from './wallpaperAtmosphereConfig.js';

// This is the only UI that writes Atmosphere keys. Opening Settings never
// rewrites a user's existing wallpaper preferences, colors or image URI.
export function addWallpaperAtmospherePreferences(
    page, settings, Adw, Gtk
) {
    const intro = new Adw.PreferencesGroup({
        title: 'Velora Atmosphere',
        description:
            'Premium GPU-native wallpaper treatment. Original keeps GNOME untouched. Desktop, glass wallpaper and App Grid share the same grading without changing your wallpaper file.',
    });
    page.add(intro);

    const presetRow = new Adw.ComboRow({
        title: 'Wallpaper style',
        subtitle:
            'Original is untouched. Natural adds depth; Cinematic is dramatic; Atmosphere is rich and luminous.',
        model: Gtk.StringList.new(
            ATMOSPHERE_PRESETS.map(preset => preset.label)
        ),
    });
    intro.add(presetRow);

    let syncingPreset = false;
    const syncPreset = () => {
        const style = settings.get_string('wallpaper-style');
        const index = ATMOSPHERE_PRESETS.findIndex(
            preset => preset.id === style
        );
        const value = index < 0 ? 0 : index;
        if (presetRow.selected !== value) {
            syncingPreset = true;
            presetRow.selected = value;
            syncingPreset = false;
        }
    };
    syncPreset();
    presetRow.connect('notify::selected', () => {
        if (syncingPreset ||
            presetRow.selected >= ATMOSPHERE_PRESETS.length)
            return;

        const preset = ATMOSPHERE_PRESETS[presetRow.selected];
        if (!preset)
            return;
        const alreadyActive =
            settings.get_string('wallpaper-style') === preset.id;
        if (alreadyActive)
            return;

        // All five effect levels and their named preset commit as a single
        // native GSettings batch: no half-configured first compositor frame.
        // Original and Custom do not overwrite prior custom slider values.
        settings.delay();
        try {
            if (preset.values) {
                for (let i = 0; i < ATMOSPHERE_KEYS.length; i++) {
                    const key = ATMOSPHERE_KEYS[i];
                    if (settings.get_int(key) !== preset.values[i])
                        settings.set_int(key, preset.values[i]);
                }
            }
            settings.set_string('wallpaper-style', preset.id);
        } finally {
            settings.apply();
        }
    });
    settings.connect('changed::wallpaper-style', syncPreset);

    const controls = new Adw.PreferencesGroup({
        title: 'Fine Tune',
        description:
            'Choose a visible style, then fine tune it. Named presets use the latest calibrated strengths even if older slider values were saved; adjusting any control creates Custom. The original wallpaper image stays untouched.',
    });
    page.add(controls);

    const labels = [
        [
            'Filmic Color',
            'Subtle cinematic tonality without exaggerated saturation.',
        ],
        [
            'Soft Vignette',
            'Gentle corner depth, with the wallpaper center remaining clear.',
        ],
        [
            'Ambient Light',
            'Subtle warm/cool lighting based on existing wallpaper colors.',
        ],
        [
            'Micro-Grain',
            'Fine, static crystalline film texture; no animation or noise image.',
        ],
        [
            'Adaptive Contrast',
            'Retain readable details in bright and dark wallpaper areas.',
        ],
    ];

    for (let i = 0; i < ATMOSPHERE_KEYS.length; i++) {
        const key = ATMOSPHERE_KEYS[i];
        const [title, subtitle] = labels[i];
        const row = new Adw.SpinRow({
            title, subtitle,
            digits: 0,
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                page_increment: 5,
                // A named style now resolves its calibrated canonical
                // values immediately after upgrading PR #62, without
                // changing the stored Custom values in GSettings.
                value: readAtmosphereProfile(settings).values[i],
            }),
        });
        let syncing = false;
        const sync = () => {
            const next = readAtmosphereProfile(settings).values[i];
            if (row.value === next)
                return;
            syncing = true;
            row.value = next;
            syncing = false;
        };
        row.connect('notify::value', () => {
            if (syncing)
                return;
            const value = Math.max(
                0, Math.min(100, Math.round(row.value))
            );
            if (settings.get_int(key) === value)
                return;
            // A manual slider adjustment is the only thing that changes
            // a selected named style into Custom. GSettings driven
            // sync() above never triggers this branch.
            const previousStyle = settings.get_string('wallpaper-style');
            const effective = readAtmosphereProfile(settings).values;
            settings.delay();
            try {
                // When converting an older named preset to Custom, copy
                // all its *visible* upgraded intensities, not stale
                // pre-upgrade GSettings integers. Otherwise the other
                // four controls would silently jump backward at once.
                if (previousStyle !== 'custom') {
                    for (let j = 0; j < ATMOSPHERE_KEYS.length; j++) {
                        const other = ATMOSPHERE_KEYS[j];
                        if (settings.get_int(other) !== effective[j])
                            settings.set_int(other, effective[j]);
                    }
                }
                settings.set_int(key, value);
                if (previousStyle !== 'custom')
                    settings.set_string('wallpaper-style', 'custom');
            } finally {
                settings.apply();
            }
        });
        settings.connect('changed::' + key, sync);
        settings.connect('changed::wallpaper-style', sync);
        controls.add(row);
    }

    // Renderer instrumentation comes from GNOME Shell (not a fabricated
    // success badge): it reports effects ATTACHED to real wallpaper
    // actors, which is useful when installing/hot-swapping the extension.
    // Actor attachment is not proof of correct GPU pixels; direct
    // Original/Atmosphere comparisons are still required.
    const renderer = new Adw.PreferencesGroup({
        title: 'Live Wallpaper Renderer',
        description:
            'Shows how many real wallpaper sources currently have the Atmosphere shader attached. If this remains “Not initialized”, reload Velora and check GNOME Shell logs.',
    });
    page.add(renderer);

    const statusRow = new Adw.ActionRow({
        title: 'Shader attachment',
        subtitle: settings.get_string('wallpaper-runtime-status'),
    });
    renderer.add(statusRow);
    settings.connect('changed::wallpaper-runtime-status', () => {
        statusRow.subtitle = settings.get_string('wallpaper-runtime-status');
    });

    const reset = new Adw.PreferencesGroup({
        title: 'Wallpaper Safety',
        description:
            'Original instantly detaches Velora wallpaper effects and restores the native look. All GNOME wallpaper files, picture URI, color scheme and glass settings are left alone.',
    });
    page.add(reset);

    const resetRow = new Adw.ActionRow({
        title: 'Return to Original',
        subtitle:
            'Disable wallpaper grading without resetting saved Custom levels.',
    });
    const resetButton = new Gtk.Button({
        label: 'Original',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    resetButton.connect('clicked', () => {
        if (settings.get_string('wallpaper-style') !== 'original')
            settings.set_string('wallpaper-style', 'original');
    });
    resetRow.add_suffix(resetButton);
    resetRow.activatable_widget = resetButton;
    reset.add(resetRow);

    return {presetRow, controls, statusRow};
}
