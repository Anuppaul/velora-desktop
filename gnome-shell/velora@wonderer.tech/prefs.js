import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

function addPage(window, title, iconName, description = null) {
    const page = new Adw.PreferencesPage({
        title,
        icon_name: iconName,
    });

    if (description)
        page.description = description;

    window.add(page);
    return page;
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

function addResetRow(group, title, subtitle, callback) {
    const row = new Adw.ActionRow({title, subtitle});
    const button = new Gtk.Button({
        label: 'Reset',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    button.connect('clicked', callback);
    row.add_suffix(button);
    row.activatable_widget = button;
    group.add(row);
    return row;
}

export default class VeloraPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const advanced = createLiquidGlassSettings(this.dir);

        window.set_search_enabled?.(true);
        window.set_default_size?.(760, 720);

        // -----------------------------------------------------------------
        // Appearance
        // -----------------------------------------------------------------
        const appearancePage = addPage(
            window,
            'Appearance',
            'preferences-desktop-appearance-symbolic'
        );

        const glass = new Adw.PreferencesGroup({
            title: 'System Liquid Glass',
            description:
                'The shared material used by supported GNOME Shell surfaces.',
        });
        appearancePage.add(glass);

        addIntSpin(
            glass, settings, 'glass-blur',
            'Blur',
            'Backdrop blur radius.',
            0, 80, 1
        );
        addIntSpin(
            glass, settings, 'glass-opacity',
            'Tint strength',
            'Amount of white or custom tint mixed into the glass.',
            0, 100, 1
        );
        addIntSpin(
            glass, settings, 'glass-filter-opacity',
            'White filter',
            'Neutral veil above refraction and below native content.',
            0, 20, 1
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

        const optics = new Adw.PreferencesGroup({
            title: 'Optics',
            description:
                'Fine material tuning. These controls affect the shared refractive character.',
        });
        appearancePage.add(optics);

        addDoubleSpin(
            optics, advanced, 'glass-displacement-scale',
            'Refraction',
            'Edge lens displacement strength.',
            0, 60, 0.5, 1
        );
        addDoubleSpin(
            optics, advanced, 'glass-chroma-strength',
            'Chromatic fringe',
            'RGB dispersion at refractive edges.',
            0, 8, 0.1, 1
        );
        addDoubleSpin(
            optics, advanced, 'glass-specular-intensity',
            'Specular',
            'Directional surface highlight strength.',
            0, 2, 0.05, 2
        );
        addDoubleSpin(
            optics, advanced, 'glass-rim-intensity',
            'Rim light',
            'Fresnel-style edge lighting strength.',
            0, 2, 0.05, 2
        );
        addDoubleSpin(
            optics, advanced, 'glass-sheen-intensity',
            'Sheen',
            'Soft highlight across the glass surface.',
            0, 1, 0.02, 2
        );

        const dateMenu = new Adw.PreferencesGroup({
            title: 'Date Menu',
            description:
                'Independent calibration for the clock and calendar popup.',
        });
        appearancePage.add(dateMenu);

        addIntSpin(
            dateMenu, settings, 'date-menu-glass-blur',
            'Blur',
            'Date Menu blur radius only.',
            0, 20, 1
        );
        addIntSpin(
            dateMenu, settings, 'date-menu-glass-opacity',
            'Tint',
            'Date Menu tint strength only.',
            0, 20, 1
        );
        addIntSpin(
            dateMenu, settings, 'date-menu-glass-filter-opacity',
            'White filter',
            'Date Menu neutral white veil only.',
            0, 20, 1
        );

        // -----------------------------------------------------------------
        // Menus
        // -----------------------------------------------------------------
        const menusPage = addPage(
            window,
            'Menus',
            'open-menu-symbolic'
        );

        const panelMenus = new Adw.PreferencesGroup({
            title: 'Panel Menu Behavior',
            description:
                'Control how an already-open panel menu reacts when the pointer crosses another panel icon.',
        });
        menusPage.add(panelMenus);

        addSwitch(
            panelMenus,
            settings,
            'panel-menu-hover-switch',
            'Switch menus on hover',
            'When off, ChatGPT, Codex, EasyEffects, Quick Settings and other panel menus open only by click or keyboard.'
        );

        const hoverDelayRow = addIntSpin(
            panelMenus,
            settings,
            'panel-menu-hover-delay-ms',
            'Hover switch delay',
            'How long the pointer must remain over another panel icon before switching.',
            0, 1000, 25
        );

        const syncHoverDelaySensitivity = () => {
            hoverDelayRow.sensitive =
                settings.get_boolean('panel-menu-hover-switch');
        };
        syncHoverDelaySensitivity();
        settings.connect(
            'changed::panel-menu-hover-switch',
            syncHoverDelaySensitivity
        );

        // -----------------------------------------------------------------
        // Dock
        // -----------------------------------------------------------------
        const dockPage = addPage(
            window,
            'Dock',
            'go-bottom-symbolic'
        );

        const dock = new Adw.PreferencesGroup({
            title: 'Floating Dock',
            description:
                'Position tuning for Ubuntu Dock while panel mode is off. Native Intelligent Autohide remains in control.',
        });
        dockPage.add(dock);

        addIntSpin(
            dock, settings, 'dock-vertical-offset',
            'Vertical offset',
            'Positive moves the floating dock up; negative moves it down.',
            -64, 64, 1
        );

        addResetRow(
            dock,
            'Reset dock position',
            'Return the floating dock to Ubuntu Dock’s native vertical position.',
            () => settings.reset('dock-vertical-offset')
        );

        // -----------------------------------------------------------------
        // Orb
        // -----------------------------------------------------------------
        const orbPage = addPage(
            window,
            'Orb',
            'applications-system-symbolic'
        );

        const orbAppearance = new Adw.PreferencesGroup({
            title: 'Orb Appearance',
            description:
                'Desktop Orb visibility, size and icon.',
        });
        orbPage.add(orbAppearance);

        addSwitch(
            orbAppearance, settings, 'orb-enabled',
            'Show Orb',
            'Keep the Velora Orb on the desktop.'
        );
        addIntSpin(
            orbAppearance, settings, 'orb-size',
            'Size',
            'Orb diameter in pixels.',
            20, 80, 1
        );
        addIntSpin(
            orbAppearance, settings, 'orb-opacity',
            'Opacity',
            'Orb opacity percentage.',
            0, 100, 1
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
        orbAppearance.add(icon);

        const orbBehavior = new Adw.PreferencesGroup({
            title: 'Orb Behavior',
            description:
                'Idle hiding, fading and launcher timing.',
        });
        orbPage.add(orbBehavior);

        addSwitch(
            orbBehavior, settings, 'auto-hide-orb',
            'Auto-hide',
            'Slide the Orb to the nearest monitor edge while idle.'
        );
        addIntSpin(
            orbBehavior, settings, 'auto-hide-delay',
            'Auto-hide delay',
            'Milliseconds before hiding.',
            0, 10000, 100
        );
        addSwitch(
            orbBehavior, settings, 'auto-fade-orb',
            'Auto-fade',
            'Fade the Orb while idle when auto-hide is off.'
        );
        addIntSpin(
            orbBehavior, settings, 'auto-fade-delay',
            'Auto-fade delay',
            'Milliseconds before fading.',
            0, 30000, 250
        );
        addIntSpin(
            orbBehavior, settings, 'hover-delay',
            'Launcher hover delay',
            'Milliseconds before the radial launcher opens.',
            0, 1200, 25
        );
        addIntSpin(
            orbBehavior, settings, 'close-delay',
            'Launcher close delay',
            'Milliseconds before the radial launcher closes.',
            0, 1800, 25
        );

        const launcher = new Adw.PreferencesGroup({
            title: 'Radial Launcher',
            description:
                'Layout, animation, previews and indicators.',
        });
        orbPage.add(launcher);

        addIntSpin(
            launcher, settings, 'icon-size',
            'Icon size',
            'Application icon button diameter.',
            20, 80, 1
        );
        addIntSpin(
            launcher, settings, 'icon-gap',
            'Icon gap',
            'Minimum edge gap between launcher icons.',
            0, 64, 1
        );
        addIntSpin(
            launcher, settings, 'ring-gap',
            'Ring gap',
            'Distance between radial launcher rings.',
            0, 160, 2
        );
        addIntSpin(
            launcher, settings, 'animation-ms',
            'Animation',
            'Open and close animation duration.',
            0, 600, 10
        );
        addIntSpin(
            launcher, settings, 'app-preview-size',
            'App preview size',
            'Live window preview size percentage.',
            50, 180, 5
        );
        addSwitch(
            launcher, settings, 'show-tooltips',
            'Tooltips',
            'Show application names on hover.'
        );
        addSwitch(
            launcher, settings, 'show-running-indicator',
            'Running indicators',
            'Show active application dots.'
        );

        const ringMode = new Adw.ComboRow({
            title: 'Ring mode',
            subtitle: 'Automatic or fixed radial launcher ring count.',
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
            ringMode.selected = Math.max(
                0,
                ringValues.indexOf(value)
            );
        };
        syncRing();
        ringMode.connect('notify::selected', () => {
            settings.set_string(
                'ring-mode',
                ringValues[ringMode.selected] ?? 'auto'
            );
        });
        settings.connect('changed::ring-mode', syncRing);
        launcher.add(ringMode);

        const orbReset = new Adw.PreferencesGroup({
            title: 'Position',
        });
        orbPage.add(orbReset);

        addResetRow(
            orbReset,
            'Reset Orb position',
            'Return the Orb to its default desktop position.',
            () => {
                settings.reset('orb-x');
                settings.reset('orb-y');
            }
        );

        // -----------------------------------------------------------------
        // Performance
        // -----------------------------------------------------------------
        const performancePage = addPage(
            window,
            'Performance',
            'utilities-system-monitor-symbolic'
        );

        const renderer = new Adw.PreferencesGroup({
            title: 'Renderer',
            description:
                'Tune expensive live scene synchronization without reducing native Shell input or geometry frame rate.',
        });
        performancePage.add(renderer);

        addIntSpin(
            renderer,
            settings,
            'glass-live-scene-fps',
            'Live scene FPS',
            '24–30 is recommended. Higher values refresh refracted windows more often and use more GPU/CPU time.',
            15, 60, 5
        );

        // Velora intentionally exposes only the curated controls above.
        // The vendored renderer's duplicate developer-oriented pages stay
        // hidden so Preferences remains compact and product-focused.
    }
}
