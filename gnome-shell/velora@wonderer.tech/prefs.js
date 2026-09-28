import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const RING_MODES = [
    ['auto', 'Adaptive (1–4 layers)'],
    ['2', 'Force 2 layers'],
    ['3', 'Force 3 layers'],
    ['4', 'Force 4 layers'],
];

function addSwitch(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

function addSpin(group, settings, key, title, subtitle, min, max, step = 1) {
    const row = new Adw.ActionRow({title, subtitle});
    const adjustment = new Gtk.Adjustment({
        lower: min,
        upper: max,
        step_increment: step,
        page_increment: step * 5,
        value: settings.get_int(key),
    });
    const spin = new Gtk.SpinButton({
        adjustment,
        numeric: true,
        valign: Gtk.Align.CENTER,
        width_chars: 5,
    });

    spin.connect('value-changed', () => {
        settings.set_int(key, spin.get_value_as_int());
    });
    settings.connect('changed::' + key, () => {
        if (spin.get_value_as_int() !== settings.get_int(key))
            spin.set_value(settings.get_int(key));
    });

    row.add_suffix(spin);
    row.activatable_widget = spin;
    group.add(row);
    return row;
}

function addText(group, settings, key, title, subtitle, placeholder = '') {
    const row = new Adw.ActionRow({title, subtitle});
    const entry = new Gtk.Entry({
        text: settings.get_string(key),
        placeholder_text: placeholder,
        valign: Gtk.Align.CENTER,
        width_chars: 24,
        hexpand: false,
    });

    entry.connect('changed', () => settings.set_string(key, entry.text));
    settings.connect('changed::' + key, () => {
        if (entry.text !== settings.get_string(key))
            entry.text = settings.get_string(key);
    });

    row.add_suffix(entry);
    row.activatable_widget = entry;
    group.add(row);
    return row;
}

function addCombo(group, settings, key, title, subtitle, options) {
    const labels = options.map(([, label]) => label);
    const values = options.map(([value]) => value);
    const model = Gtk.StringList.new(labels);
    const row = new Adw.ComboRow({title, subtitle, model});

    const syncFromSettings = () => {
        const index = Math.max(0, values.indexOf(settings.get_string(key)));
        if (row.selected !== index)
            row.selected = index;
    };

    syncFromSettings();
    row.connect('notify::selected', () => {
        const value = values[row.selected] ?? values[0];
        if (settings.get_string(key) !== value)
            settings.set_string(key, value);
    });
    settings.connect('changed::' + key, syncFromSettings);

    group.add(row);
    return row;
}

export default class VeloraPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._veloraSettings = settings;
        window.set_default_size(720, 760);

        const launcherPage = new Adw.PreferencesPage({
            title: 'Launcher',
            icon_name: 'view-app-grid-symbolic',
        });
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });

        window.add(launcherPage);
        window.add(appearancePage);

        const behaviorGroup = new Adw.PreferencesGroup({
            title: 'Velora Orb behavior',
            description: 'Hover shows dock apps. Click toggles the GNOME Applications view.',
        });
        launcherPage.add(behaviorGroup);

        addSwitch(
            behaviorGroup,
            settings,
            'hide-ubuntu-dock',
            'Hide Ubuntu Dock',
            'Velora force-disables Ubuntu Dock while active, removes its reservation, and restores its exact previous state when disabled. Other dock extensions are not affected.'
        );
        addCombo(
            behaviorGroup,
            settings,
            'ring-mode',
            'Hover layers',
            'Adaptive starts with one compact ring and adds more rings only when the app count or screen geometry requires it.',
            RING_MODES
        );
        addSwitch(
            behaviorGroup,
            settings,
            'show-running-indicator',
            'Running app dot',
            'Shows a small premium running indicator under active application icons.'
        );
        addSwitch(
            behaviorGroup,
            settings,
            'show-tooltips',
            'App name tooltips',
            'Shows the application name while hovering a dock icon.'
        );

        const motionGroup = new Adw.PreferencesGroup({
            title: 'Interaction',
            description: 'Tune hover timing and Velora motion.',
        });
        launcherPage.add(motionGroup);

        addSpin(motionGroup, settings, 'hover-delay', 'Hover open delay', 'Milliseconds before dock icons expand from the Orb.', 0, 1200, 20);
        addSpin(motionGroup, settings, 'close-delay', 'Close delay', 'Milliseconds before dock icons collapse after pointer leaves. Set 0 for immediate close.', 0, 1800, 20);
        addSpin(motionGroup, settings, 'animation-ms', 'Animation duration', 'Set to 0 for immediate opening and closing.', 0, 600, 10);
        addSwitch(
            motionGroup,
            settings,
            'auto-hide-orb',
            'Auto-hide Orb',
            'Slides the Orb to the nearest screen edge when idle, leaving a small reveal strip. Auto-fade is suspended while this is enabled.'
        );
        addSwitch(
            motionGroup,
            settings,
            'auto-fade-orb',
            'Auto-fade Orb',
            'Fades the Orb to zero opacity after the idle delay. Hovering the same location restores the configured Orb opacity.'
        );
        addSpin(
            motionGroup,
            settings,
            'auto-fade-delay',
            'Auto-fade delay',
            'Milliseconds before the idle Orb fades to zero opacity.',
            0,
            30000,
            250
        );
        addSpin(
            motionGroup,
            settings,
            'auto-hide-delay',
            'Auto-hide delay',
            'Milliseconds before the idle Orb slides to the nearest screen edge.',
            0,
            10000,
            100
        );

        const allAppsGroup = new Adw.PreferencesGroup({
            title: 'All Apps',
            description: 'Customize GNOME Applications while keeping native search, folders and app launching.',
        });
        appearancePage.add(allAppsGroup);

        addSwitch(
            allAppsGroup,
            settings,
            'minimal-all-apps',
            'Minimal All Apps',
            'Pure black background, hides window previews and the native Overview Dash, and uses compact app tiles.'
        );
        addSpin(
            allAppsGroup,
            settings,
            'all-apps-icon-size',
            'All Apps icon size',
            'Native GNOME application icon size while Minimal All Apps is active.',
            20,
            80,
            2
        );

        const geometryGroup = new Adw.PreferencesGroup({
            title: 'Hover icon geometry',
            description: 'Hover launcher icon size, icon-to-icon distance and layer distance are independent.',
        });
        appearancePage.add(geometryGroup);

        addSpin(geometryGroup, settings, 'icon-size', 'App icon size', 'Diameter of each clean circular hover app button.', 20, 80, 2);
        addSpin(geometryGroup, settings, 'icon-gap', 'Icon distance', 'Minimum edge-to-edge distance between neighboring icons in the same layer.', 0, 64, 2);
        addSpin(geometryGroup, settings, 'ring-gap', 'Layer distance', 'Requested center-to-center distance between radial layers. Set 0 for automatic minimum safe spacing.', 0, 160, 2);

        const orbGroup = new Adw.PreferencesGroup({
            title: 'Velora Orb',
            description: 'The Orb position and appearance update live.',
        });
        appearancePage.add(orbGroup);

        addSpin(orbGroup, settings, 'orb-size', 'Orb size', 'Diameter of the floating black Orb.', 20, 80, 2);
        addSpin(orbGroup, settings, 'orb-opacity', 'Orb opacity', 'Opacity percentage for the floating Orb. 0 is fully transparent.', 0, 100, 1);
        addText(
            orbGroup,
            settings,
            'orb-icon',
            'Orb icon',
            'Themed icon name or absolute SVG/PNG path. Default: start-here-symbolic (Ubuntu logo on Yaru).',
            'start-here-symbolic'
        );

        const resetIconRow = new Adw.ActionRow({
            title: 'Reset Orb icon',
            subtitle: 'Restores the default Ubuntu symbolic icon.',
        });
        const resetIconButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        resetIconButton.connect('clicked', () => settings.reset('orb-icon'));
        resetIconRow.add_suffix(resetIconButton);
        resetIconRow.activatable_widget = resetIconButton;
        orbGroup.add(resetIconRow);

        const positionGroup = new Adw.PreferencesGroup({
            title: 'Orb position',
            description: 'Drag the Orb directly on the desktop. Its normalized position survives resolution changes.',
        });
        appearancePage.add(positionGroup);

        const resetRow = new Adw.ActionRow({
            title: 'Reset to top-left',
            subtitle: 'Returns the Orb to the default Velora position.',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => {
            settings.reset('orb-x');
            settings.reset('orb-y');
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        positionGroup.add(resetRow);
    }
}
