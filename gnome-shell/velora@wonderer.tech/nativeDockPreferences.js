// Native Ubuntu Dock controls embedded into Velora Preferences.
// These rows bind directly to the installed org.gnome.shell.extensions.
// dash-to-dock schema. They never create a competing Velora settings copy,
// mutate settings on page open, or override the native hide/show state machine.
export const UBUNTU_DOCK_SCHEMA =
    'org.gnome.shell.extensions.dash-to-dock';

export function openUbuntuDockSettings(Gio) {
    try {
        const source = Gio.SettingsSchemaSource.get_default();
        const schema = source?.lookup?.(UBUNTU_DOCK_SCHEMA, true);
        return schema
            ? new Gio.Settings({settings_schema: schema})
            : null;
    } catch {
        return null;
    }
}

export function addUbuntuDockPreferences(
    page, Gio, Gtk, Adw, native = openUbuntuDockSettings(Gio)
) {
    const group = (title, description) => {
        const g = new Adw.PreferencesGroup({title, description});
        page.add(g);
        return g;
    };

    if (!native) {
        const unavailable = group(
            'Ubuntu Dock is unavailable',
            'Enable ubuntu-dock@ubuntu.com to manage its native settings here.'
        );
        unavailable.add(new Adw.ActionRow({
            title: 'Native Ubuntu Dock settings not found',
            subtitle:
                'Velora does not create a second dock. Install or enable Ubuntu Dock, then reopen Preferences.',
        }));
        return null;
    }

    const schema = native.settings_schema ??
        native.get_property?.('settings-schema') ??
        null;
    const has = key => Boolean(schema?.has_key?.(key));
    const bindSwitch = (g, key, title, subtitle) => {
        if (!has(key))
            return null;
        const row = new Adw.SwitchRow({title, subtitle});
        native.bind(
            key, row, 'active', Gio.SettingsBindFlags.DEFAULT
        );
        g.add(row);
        return row;
    };
    const nativeSpin = (
        g, key, title, subtitle, min, max, step, digits = 0
    ) => {
        if (!has(key))
            return null;

        const isInt = digits === 0;
        const read = () => isInt
            ? native.get_int(key)
            : native.get_double(key);
        const row = new Adw.SpinRow({
            title, subtitle,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: step * 5,
                value: read(),
            }),
            digits,
        });
        let syncing = false;
        const sync = () => {
            const value = read();
            if (Math.abs(row.value - value) < 0.00001)
                return;
            syncing = true;
            row.value = value;
            syncing = false;
        };
        row.connect('notify::value', () => {
            if (syncing)
                return;
            const next = isInt
                ? Math.round(row.value)
                : row.value;
            if (Math.abs(read() - next) >= 0.00001) {
                if (isInt)
                    native.set_int(key, next);
                else
                    native.set_double(key, next);
            }
        });
        native.connect('changed::' + key, sync);
        g.add(row);
        return row;
    };
    const nativeEnum = (g, key, title, subtitle, options) => {
        if (!has(key))
            return null;
        const row = new Adw.ComboRow({
            title, subtitle,
            model: Gtk.StringList.new(options.map(([, label]) => label)),
        });
        let syncing = false;
        const sync = () => {
            const value = native.get_enum(key);
            const index = options.findIndex(([id]) => id === value);
            if (index < 0)
                return;
            syncing = true;
            row.selected = index;
            syncing = false;
        };
        sync();
        row.connect('notify::selected', () => {
            if (syncing || row.selected >= options.length)
                return;
            const value = options[row.selected][0];
            if (native.get_enum(key) !== value)
                native.set_enum(key, value);
        });
        native.connect('changed::' + key, sync);
        g.add(row);
        return row;
    };

    group(
        'Ubuntu Dock — native settings',
        'Direct controls for your installed Ubuntu Dock. Changes are immediately shared with the Ubuntu Dock extension and system Settings; Velora retains the native dock and its autohide engine.'
    );

    const visibility = group(
        'Visibility & Intelligent Auto-hide',
        'Both intelligent hide (window overlap) and edge auto-hide may be enabled. Always visible takes priority. Native Ubuntu Dock handles reveal, hover, pressure and animations.'
    );
    const fixed = bindSwitch(
        visibility, 'dock-fixed', 'Always visible',
        'Keep the native dock on screen; disables hide modes.'
    );
    const intelligent = bindSwitch(
        visibility, 'intellihide', 'Intelligent hide',
        'Hide when an applicable window overlaps the dock.'
    );
    const auto = bindSwitch(
        visibility, 'autohide', 'Auto-hide at screen edge',
        'Reveal the dock by approaching the screen edge.'
    );
    const intelligentMode = nativeEnum(
        visibility, 'intellihide-mode', 'Hide when',
        'Choose which windows should trigger intelligent hide.',
        [
            [0, 'Any overlapping window'],
            [1, 'Focused application windows'],
            [2, 'Maximized windows'],
            [3, 'Always-on-top windows'],
        ]
    );
    const pressure = bindSwitch(
        visibility, 'require-pressure-to-show', 'Require edge pressure',
        'When disabled, ordinary pointer dwell can reveal the dock.'
    );
    const threshold = nativeSpin(
        visibility, 'pressure-threshold', 'Pressure threshold',
        'Sensitivity of native edge-pressure reveal.',
        1, 400, 10, 0
    );
    // The native pressure threshold is a double, not an integer.
    // Treat the slider value as an integer-looking double in Preferences.
    bindSwitch(
        visibility, 'autohide-in-fullscreen',
        'Allow reveal in fullscreen',
        'Use the native auto-hide reveal logic while a window is fullscreen.'
    );
    const showDelay = nativeSpin(
        visibility, 'show-delay', 'Reveal delay (seconds)',
        'Time before edge dwell reveals the dock.',
        0, 2, 0.05, 2
    );
    const hideDelay = nativeSpin(
        visibility, 'hide-delay', 'Hide delay (seconds)',
        'Time before the pointer-leaving dock hides it.',
        0, 2, 0.05, 2
    );
    const animate = nativeSpin(
        visibility, 'animation-time', 'Slide animation (seconds)',
        'Duration of Ubuntu Dock’s own hide/reveal animation.',
        0, 1.5, 0.05, 2
    );
    const manualHide = bindSwitch(
        visibility, 'manualhide', 'Manual hide',
        'Hide the dock entirely until this switch is disabled.'
    );

    if (['dock-fixed', 'manualhide', 'autohide', 'intellihide',
         'require-pressure-to-show'].every(has)) {
        const restore = new Adw.ActionRow({
            title: 'Restore Intelligent Auto-hide',
            subtitle:
                'Unpin dock, enable overlap avoidance and edge reveal, disable manual hide and the pressure barrier.',
        });
        const button = new Gtk.Button({
            label: 'Restore',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        button.connect('clicked', () => {
            // This is an explicit user action, never a silent migration.
            // Batch native GSettings changes to avoid intermediate
            // fixed/manual-hidden states while toggling related controls.
            native.delay();
            try {
                native.set_boolean('manualhide', false);
                native.set_boolean('dock-fixed', false);
                native.set_boolean('intellihide', true);
                native.set_boolean('autohide', true);
                native.set_boolean('require-pressure-to-show', false);
            } finally {
                native.apply();
            }
        });
        restore.add_suffix(button);
        restore.activatable_widget = button;
        visibility.add(restore);
    }

    // Dynamic sensitivity only; reading this page never writes a key.
    const syncVisibility = () => {
        const always = has('dock-fixed') && native.get_boolean('dock-fixed');
        const hidden = has('manualhide') && native.get_boolean('manualhide');
        const canHide = !always && !hidden;
        if (intelligent) intelligent.sensitive = canHide;
        if (auto) auto.sensitive = canHide;
        if (intelligentMode) intelligentMode.sensitive =
            canHide && native.get_boolean('intellihide');
        if (pressure) pressure.sensitive =
            canHide && native.get_boolean('autohide');
        if (threshold) threshold.sensitive =
            canHide && native.get_boolean('autohide') &&
            native.get_boolean('require-pressure-to-show');
        if (showDelay) showDelay.sensitive =
            canHide && native.get_boolean('autohide');
        if (hideDelay) hideDelay.sensitive = canHide;
        if (animate) animate.sensitive = true;
        if (fixed) fixed.sensitive = !hidden;
    };
    for (const key of [
        'dock-fixed', 'manualhide', 'autohide', 'intellihide',
        'require-pressure-to-show',
    ]) {
        if (has(key))
            native.connect('changed::' + key, syncVisibility);
    }
    syncVisibility();

    const layout = group(
        'Position, Size & Layout',
        'Ubuntu Dock’s original layout; extended Panel mode remains square and uses Velora’s existing panel material.'
    );
    nativeEnum(
        layout, 'dock-position', 'Dock position',
        'Choose the monitor edge used by the native dock.',
        [
            [0, 'Top'], [1, 'Right'],
            [2, 'Bottom'], [3, 'Left'],
        ]
    );
    bindSwitch(
        layout, 'extend-height', 'Panel mode',
        'Extend the dock background across the monitor edge.'
    );
    bindSwitch(
        layout, 'always-center-icons', 'Center icons in panel mode',
        'Center app icons when the native dock is extended.'
    );
    nativeSpin(
        layout, 'dash-max-icon-size', 'Maximum icon size',
        'Native icon size limit in pixels.',
        16, 64, 2
    );
    bindSwitch(
        layout, 'icon-size-fixed', 'Fixed icon sizes',
        'Keep icon sizes fixed when scrolling the dock.'
    );
    nativeSpin(
        layout, 'height-fraction', 'Maximum dock length',
        'Fraction of the display edge the floating dock may occupy.',
        0.2, 1.0, 0.05, 2
    );
    bindSwitch(
        layout, 'multi-monitor', 'Dock on every monitor',
        'Display a native dock on each connected monitor.'
    );
    bindSwitch(
        layout, 'custom-theme-shrink', 'Compact icon spacing',
        'Use Ubuntu Dock’s compact native icon spacing.'
    );

    const apps = group(
        'Applications & Content',
        'Control which native Ubuntu Dock icons appear. Velora’s own Orb app source remains separate.'
    );
    for (const [key, title, subtitle] of [
        ['show-favorites', 'Show favorites', 'Display pinned applications.'],
        ['show-running', 'Show running apps', 'Display currently running applications.'],
        ['show-trash', 'Show Trash', 'Keep a Trash icon on the dock.'],
        ['show-mounts', 'Show removable drives', 'Show mounted drives and volumes.'],
        ['show-mounts-network', 'Show network drives', 'Include available network volumes.'],
        ['show-show-apps-button', 'Show Applications button',
            'Display the native Show Apps launcher.'],
        ['show-windows-preview', 'Native window previews',
            'Control Ubuntu Dock’s native window list previews, not Velora’s hover mini preview.'],
        ['isolate-workspaces', 'Limit apps to current workspace',
            'Only show windows from the current workspace.'],
        ['isolate-monitors', 'Limit apps to current monitor',
            'Only show windows from the dock’s monitor.'],
    ]) {
        bindSwitch(apps, key, title, subtitle);
    }

    const interactions = group(
        'Actions & Indicators',
        'Ubuntu Dock’s built-in icon behavior and native running indicators.'
    );
    nativeEnum(
        interactions, 'click-action', 'Click on a running application',
        'Uses Ubuntu Dock’s native click action.',
        [
            [0, 'Do nothing'], [1, 'Minimize'], [2, 'Launch new window'],
            [3, 'Cycle windows'], [4, 'Minimize or Overview'],
            [5, 'Window previews'], [6, 'Minimize or previews'],
            [7, 'Focus or previews'], [8, 'Focus or app spread'],
            [9, 'Focus, minimize or previews'],
            [10, 'Focus, minimize or app spread'], [11, 'Quit'],
        ]
    );
    nativeEnum(
        interactions, 'scroll-action', 'Scroll over the dock',
        'Choose Ubuntu Dock’s native wheel action.',
        [
            [0, 'Do nothing'], [1, 'Cycle windows'],
            [2, 'Switch workspace'],
        ]
    );
    nativeEnum(
        interactions, 'running-indicator-style',
        'Running app indicators',
        'Native indicator shape; Velora keeps its existing glass styling.',
        [
            [0, 'Default'], [1, 'Dots'], [2, 'Squares'],
            [3, 'Dashes'], [4, 'Segmented'], [5, 'Solid'],
            [6, 'Ciliora'], [7, 'Metro'], [8, 'Binary'], [9, 'Dot'],
        ]
    );
    bindSwitch(
        interactions, 'hot-keys', 'Super + number shortcuts',
        'Launch or switch dock apps with Super+1 through Super+9.'
    );
    bindSwitch(
        interactions, 'show-dock-urgent-notify', 'Reveal for urgent apps',
        'Let Ubuntu Dock appear for urgent native app notifications.'
    );

    return native;
}
