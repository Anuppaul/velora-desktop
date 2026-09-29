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

export default class VeloraPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

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

        const orb = new Adw.PreferencesGroup({
            title: 'Orb',
            description:
                'The Orb is the only retained Velora launcher-era surface. Clicking it opens GNOME Applications.',
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

        const advanced = createLiquidGlassSettings(this.dir);
        buildLiquidGlassPreferences(window, advanced);
    }
}
