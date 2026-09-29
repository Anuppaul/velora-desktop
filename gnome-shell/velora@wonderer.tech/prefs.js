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
    if (!schema) {
        throw new Error(
            'Unable to load vendored Liquid Glass settings schema'
        );
    }

    return new Gio.Settings({settings_schema: schema});
}

const RING_MODES = [
    ['auto', 'Adaptive (1–4 layers)'],
    ['2', 'Force 2 layers'],
    ['3', 'Force 3 layers'],
    ['4', 'Force 4 layers'],
];

const DOCK_POSITIONS = [
    ['bottom', 'Bottom'],
    ['top', 'Top'],
    ['left', 'Left'],
    ['right', 'Right'],
];

function addSwitch(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

function addBackShadowSwitch(group, settings) {
    const row = new Adw.SwitchRow({
        title: 'Back shadow',
        subtitle: 'Outer shadow behind Liquid Glass surfaces. Turn this off to remove the shadow completely.',
    });

    const sync = () => {
        row.active =
            settings.get_double('shadow-intensity') > 0.001;
    };

    sync();
    row.connect('notify::active', () => {
        const current =
            settings.get_double('shadow-intensity');
        if (row.active) {
            if (current <= 0.001)
                settings.set_double('shadow-intensity', 0.22);
        } else if (current > 0.001) {
            settings.set_double('shadow-intensity', 0.0);
        }
    });
    settings.connect('changed::shadow-intensity', sync);

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
        const liquidGlassSettings =
            createLiquidGlassSettings(this.dir);
        window._veloraSettings = settings;
        window._veloraLiquidGlassSettings =
            liquidGlassSettings;
        window.set_default_size(720, 760);

        const launcherPage = new Adw.PreferencesPage({
            title: 'Launcher',
            icon_name: 'view-app-grid-symbolic',
        });
        const appearancePage = new Adw.PreferencesPage({
            title: 'Launcher Style',
            icon_name: 'applications-graphics-symbolic',
        });

        window.add(launcherPage);
        window.add(appearancePage);

        const surfacesGroup = new Adw.PreferencesGroup({
            title: 'Launcher surfaces',
            description: 'Orb and Liquid Dock are independent. Enable either one or keep both visible together.',
        });
        launcherPage.add(surfacesGroup);

        addSwitch(
            surfacesGroup,
            settings,
            'orb-enabled',
            'Velora Orb',
            'Show the movable Orb with the adaptive circular launcher.'
        );
        addSwitch(
            surfacesGroup,
            settings,
            'floating-dock-enabled',
            'Liquid Glass Dock',
            'Show the independent floating favorites + running-app dock.'
        );

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

        const liquidDockGroup = new Adw.PreferencesGroup({
            title: 'Liquid Glass Dock',
            description: 'Floating dock layout and auto-hide. Use the Liquid Glass Appearance and Rendering pages for material, blur, tint, refraction and lighting.',
        });
        appearancePage.add(liquidDockGroup);

        addCombo(
            liquidDockGroup,
            settings,
            'floating-dock-position',
            'Dock position',
            'Place the independent floating dock on any screen edge.',
            DOCK_POSITIONS
        );
        addSpin(
            liquidDockGroup,
            settings,
            'floating-dock-icon-size',
            'Dock icon size',
            'Size of each application icon button.',
            24,
            80,
            2
        );
        addSpin(
            liquidDockGroup,
            settings,
            'floating-dock-gap',
            'Icon gap',
            'Space between neighboring dock icons.',
            0,
            32,
            1
        );
        addSpin(
            liquidDockGroup,
            settings,
            'floating-dock-edge-offset',
            'Edge distance',
            'Distance between the floating dock and the selected screen edge.',
            0,
            64,
            2
        );
        addSwitch(
            liquidDockGroup,
            settings,
            'floating-dock-auto-hide',
            'Auto-hide Dock',
            'Slides the dock to its selected screen edge when idle, leaving a small reveal strip.'
        );
        addSpin(
            liquidDockGroup,
            settings,
            'floating-dock-hide-delay',
            'Auto-hide delay',
            'Milliseconds before an idle floating dock hides.',
            0,
            10000,
            100
        );

        const glassSurfaceGroup = new Adw.PreferencesGroup({
            title: 'Liquid Glass surfaces',
            description: 'Simple controls for the common surface-level adjustments. Detailed optics remain under Appearance / Effects / Rendering.',
        });
        appearancePage.add(glassSurfaceGroup);

        addBackShadowSwitch(
            glassSurfaceGroup,
            liquidGlassSettings
        );

        const dateMenuRendererRow = new Adw.ActionRow({
            title: 'Date / Calendar renderer',
            subtitle: 'Native GNOME Date Menu with Velora glass styling. No separate FBO, clone tree, or refraction renderer is used for this card.',
        });
        const dateMenuRendererState = new Gtk.Label({
            label: 'Native',
            valign: Gtk.Align.CENTER,
        });
        dateMenuRendererState.add_css_class('success');
        dateMenuRendererRow.add_suffix(
            dateMenuRendererState
        );
        glassSurfaceGroup.add(dateMenuRendererRow);

        addSpin(
            glassSurfaceGroup,
            settings,
            'date-menu-panel-scale',
            'Date / Calendar panel scale',
            'Scale the complete native card opened by clicking the date and clock in the top bar.',
            60,
            180,
            5
        );

        addSpin(
            glassSurfaceGroup,
            settings,
            'notification-panel-scale',
            'Notification banner scale',
            'Scale only the temporary notification banner that appears at the top of the screen.',
            60,
            180,
            5
        );

        const notificationRendererRow = new Adw.ActionRow({
            title: 'Notification renderer',
            subtitle: 'Native GNOME notification card with Velora glass styling. No extra FBO, clone tree, or refraction renderer is used for notifications.',
        });
        const notificationRendererState = new Gtk.Label({
            label: 'Native',
            valign: Gtk.Align.CENTER,
        });
        notificationRendererState.add_css_class('success');
        notificationRendererRow.add_suffix(
            notificationRendererState
        );
        glassSurfaceGroup.add(notificationRendererRow);

        const topPanelRow = new Adw.ActionRow({
            title: 'Top panel glass',
            subtitle: 'Enabled by Velora using the upstream Liquid Glass renderer on the actual GNOME top bar.',
        });
        const topPanelState = new Gtk.Label({
            label: 'Enabled',
            valign: Gtk.Align.CENTER,
        });
        topPanelState.add_css_class('success');
        topPanelRow.add_suffix(topPanelState);
        glassSurfaceGroup.add(topPanelRow);

        const previewGroup = new Adw.PreferencesGroup({
            title: 'App window preview',
            description: 'Customize the live window preview shown when hovering a running app.',
        });
        appearancePage.add(previewGroup);

        addSpin(
            previewGroup,
            settings,
            'app-preview-size',
            'Window preview size',
            'Scale the live hover preview. 100% is the default size.',
            50,
            180,
            5
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

        buildLiquidGlassPreferences(
            window,
            liquidGlassSettings
        );
    }
}
