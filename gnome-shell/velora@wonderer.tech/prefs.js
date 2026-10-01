import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {buildPreferences as buildLiquidGlassPreferences} from './vendor/liquid-glass/preferences/pages.js';

const LIQUID_GLASS_SCHEMA =
    'org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com';

function createLiquidGlassSettings(extensionDir) {
    const schemaDir = extensionDir
        .get_child('vendor')
        .get_child('liquid-glass')
        .get_child('schemas');

    const source = Gio.SettingsSchemaSource.new_from_directory(
        schemaDir.get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );
    const schema = source.lookup(LIQUID_GLASS_SCHEMA, true);
    if (!schema)
        throw new Error('Vendored Liquid Glass schema not found');

    return new Gio.Settings({settings_schema: schema});
}

function addSwitch(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

function addIntSpin(group, settings, key, title, subtitle, min, max, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
            value: settings.get_int(key),
        }),
        digits: 0,
    });

    let syncing = false;
    const sync = () => {
        syncing = true;
        row.value = settings.get_int(key);
        syncing = false;
    };

    row.connect('notify::value', () => {
        if (!syncing)
            settings.set_int(key, Math.round(row.value));
    });
    settings.connect('changed::' + key, sync);
    group.add(row);
    return row;
}

function addDoubleSpin(
    group,
    settings,
    key,
    title,
    subtitle,
    min,
    max,
    step,
    digits = 2
) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
            value: settings.get_double(key),
        }),
        digits,
    });

    let syncing = false;
    const sync = () => {
        syncing = true;
        row.value = settings.get_double(key);
        syncing = false;
    };

    row.connect('notify::value', () => {
        if (!syncing)
            settings.set_double(key, row.value);
    });
    settings.connect('changed::' + key, sync);
    group.add(row);
    return row;
}

export default class VeloraPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const advanced = createLiquidGlassSettings(this.dir);

        const page = new Adw.PreferencesPage({
            title: 'Velora',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);

        const glass = new Adw.PreferencesGroup({
            title: 'System Liquid Glass',
            description:
                'One material profile for GNOME Shell popups, notifications and supported system surfaces.',
        });
        page.add(glass);

        addIntSpin(
            glass, settings, 'glass-blur',
            'Blur', 'Dual Kawase blur radius', 0, 80, 1
        );
        addIntSpin(
            glass, settings, 'glass-opacity',
            'Tint strength', 'White/color tint mixed into the glass', 0, 100, 1
        );
        addIntSpin(
            glass, settings, 'glass-filter-opacity',
            'White filter', 'Neutral white veil above refraction, below content', 0, 20, 1
        );

        const tint = new Adw.EntryRow({
            title: 'Tint color',
            text: settings.get_string('glass-tint-color'),
        });
        tint.connect('changed', () => {
            const value = tint.text.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(value))
                settings.set_string('glass-tint-color', value);
        });
        settings.connect('changed::glass-tint-color', () => {
            const value = settings.get_string('glass-tint-color');
            if (tint.text !== value)
                tint.text = value;
        });
        glass.add(tint);

        addDoubleSpin(
            glass, advanced, 'glass-displacement-scale',
            'Refraction', 'Edge lens displacement strength', 0, 60, 0.5, 1
        );
        addDoubleSpin(
            glass, advanced, 'glass-chroma-strength',
            'Chromatic fringe', 'RGB dispersion at refractive edges (px)', 0, 8, 0.1, 1
        );
        addDoubleSpin(
            glass, advanced, 'glass-specular-intensity',
            'Specular', 'Directional highlight strength', 0, 2, 0.05, 2
        );
        addDoubleSpin(
            glass, advanced, 'glass-rim-intensity',
            'Rim light', 'Fresnel edge-light strength', 0, 2, 0.05, 2
        );
        addDoubleSpin(
            glass, advanced, 'glass-sheen-intensity',
            'Sheen', 'Soft surface sheen across the glass', 0, 1, 0.02, 2
        );

        const dateMenu = new Adw.PreferencesGroup({
            title: 'Date Menu calibration',
            description:
                'Micro-tune one reference surface first. These controls affect only the clock/calendar popup.',
        });
        page.add(dateMenu);

        addIntSpin(
            dateMenu, settings, 'date-menu-glass-blur',
            'Blur', 'Date Menu blur radius only', 0, 20, 1
        );
        addIntSpin(
            dateMenu, settings, 'date-menu-glass-opacity',
            'Tint', 'Date Menu tint strength percentage only', 0, 20, 1
        );
        addIntSpin(
            dateMenu, settings, 'date-menu-glass-filter-opacity',
            'White filter', 'Date Menu neutral white veil percentage', 0, 20, 1
        );

        const performance = new Adw.PreferencesGroup({
            title: 'Performance',
            description:
                'Caps expensive live scene synchronization; Shell geometry and interactions still follow the native frame clock.',
        });
        page.add(performance);

        addIntSpin(
            performance, settings, 'glass-live-scene-fps',
            'Live scene FPS', '30 is the recommended balance; 60 maximizes scene freshness', 15, 60, 5
        );

        const dock = new Adw.PreferencesGroup({
            title: 'Floating Dock',
            description:
                'Position tuning for Ubuntu Dock while panel mode is off. Intelligent Autohide remains native.',
        });
        page.add(dock);

        addIntSpin(
            dock, settings, 'dock-vertical-offset',
            'Vertical offset',
            'Positive moves the floating dock up; negative moves it down. Panel mode ignores this setting.',
            -64, 64, 1
        );

        const resetDockOffset = new Adw.ActionRow({
            title: 'Reset dock offset',
            subtitle: 'Return the floating dock to Ubuntu Dock’s native vertical position.',
        });
        const resetDockOffsetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        resetDockOffsetButton.connect('clicked', () => {
            settings.reset('dock-vertical-offset');
        });
        resetDockOffset.add_suffix(resetDockOffsetButton);
        resetDockOffset.activatable_widget = resetDockOffsetButton;
        dock.add(resetDockOffset);

        const orb = new Adw.PreferencesGroup({
            title: 'Orb',
            description:
                'Full Velora Orb: click toggles GNOME Applications; hover opens the radial launcher with previews, tooltips and running indicators.',
        });
        page.add(orb);

        addSwitch(
            orb, settings, 'orb-enabled',
            'Show Orb', 'Keep the Velora Orb on the desktop'
        );
        addIntSpin(
            orb, settings, 'orb-size',
            'Size', 'Orb diameter in pixels', 20, 80, 1
        );
        addIntSpin(
            orb, settings, 'orb-opacity',
            'Opacity', 'Orb opacity percentage', 0, 100, 1
        );

        const icon = new Adw.EntryRow({
            title: 'Orb icon',
            text: settings.get_string('orb-icon'),
        });
        settings.bind(
            'orb-icon',
            icon,
            'text',
            Gio.SettingsBindFlags.DEFAULT
        );
        orb.add(icon);

        addSwitch(
            orb, settings, 'auto-hide-orb',
            'Auto-hide', 'Slide the Orb to the nearest monitor edge while idle'
        );
        addIntSpin(
            orb, settings, 'auto-hide-delay',
            'Auto-hide delay', 'Milliseconds before hiding', 0, 10000, 100
        );
        addSwitch(
            orb, settings, 'auto-fade-orb',
            'Auto-fade', 'Fade the Orb while idle when auto-hide is off'
        );
        addIntSpin(
            orb, settings, 'auto-fade-delay',
            'Auto-fade delay', 'Milliseconds before fading', 0, 30000, 250
        );
        addIntSpin(
            orb, settings, 'hover-delay',
            'Launcher hover delay', 'Milliseconds before the radial launcher opens', 0, 1200, 25
        );
        addIntSpin(
            orb, settings, 'close-delay',
            'Launcher close delay', 'Milliseconds before the radial launcher closes', 0, 1800, 25
        );
        addIntSpin(
            orb, settings, 'icon-size',
            'Launcher icon size', 'Application icon button diameter', 20, 80, 1
        );
        addIntSpin(
            orb, settings, 'icon-gap',
            'Launcher icon gap', 'Minimum edge gap between icons', 0, 64, 1
        );
        addIntSpin(
            orb, settings, 'ring-gap',
            'Ring gap', 'Distance between radial launcher rings', 0, 160, 2
        );
        addIntSpin(
            orb, settings, 'animation-ms',
            'Launcher animation', 'Open/close animation duration (ms)', 0, 600, 10
        );
        addIntSpin(
            orb, settings, 'app-preview-size',
            'App preview size', 'Live window preview size percentage', 50, 180, 5
        );
        addSwitch(
            orb, settings, 'show-tooltips',
            'Tooltips', 'Show application names on hover'
        );
        addSwitch(
            orb, settings, 'show-running-indicator',
            'Running indicators', 'Show active application dots'
        );

        const ringMode = new Adw.ComboRow({
            title: 'Ring mode',
            subtitle: 'Automatic or fixed radial launcher ring count',
            model: Gtk.StringList.new([
                'Auto',
                '2 rings',
                '3 rings',
                '4 rings',
            ]),
        });
        const ringValues = ['auto', '2', '3', '4'];
        const syncRing = () => {
            const value = settings.get_string('ring-mode');
            ringMode.selected = Math.max(0, ringValues.indexOf(value));
        };
        syncRing();
        ringMode.connect('notify::selected', () => {
            settings.set_string(
                'ring-mode',
                ringValues[ringMode.selected] ?? 'auto'
            );
        });
        settings.connect('changed::ring-mode', syncRing);
        orb.add(ringMode);

        const reset = new Adw.ActionRow({
            title: 'Reset Orb position',
            subtitle: 'Return the Orb to its default position.',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => {
            settings.reset('orb-x');
            settings.reset('orb-y');
        });
        reset.add_suffix(resetButton);
        reset.activatable_widget = resetButton;
        orb.add(reset);

        buildLiquidGlassPreferences(window, advanced);
    }
}
