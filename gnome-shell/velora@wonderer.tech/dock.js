import Gio from 'gi://Gio';

const DOCK_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
const UBUNTU_DOCK_UUID = 'ubuntu-dock@ubuntu.com';

export class DockController {
    constructor(veloraSettings) {
        this._veloraSettings = veloraSettings;
        this._settings = null;
        this._shellSettings = new Gio.Settings({schema_id: 'org.gnome.shell'});
    }

    _ensureSettings() {
        if (this._settings)
            return true;

        const schema = Gio.SettingsSchemaSource.get_default().lookup(
            DOCK_SCHEMA,
            true
        );
        if (!schema ||
            !schema.has_key('manualhide') ||
            !schema.has_key('dock-fixed')) {
            return false;
        }

        this._settings = new Gio.Settings({schema_id: DOCK_SCHEMA});
        return true;
    }

    _captureCurrentState() {
        if (!this._veloraSettings.get_boolean('dock-state-captured')) {
            if (this._ensureSettings()) {
                this._veloraSettings.set_boolean(
                    'dock-original-manualhide',
                    this._settings.get_boolean('manualhide')
                );
                this._veloraSettings.set_boolean(
                    'dock-original-fixed',
                    this._settings.get_boolean('dock-fixed')
                );
            }

            this._veloraSettings.set_boolean('dock-state-captured', true);
        }

        if (!this._veloraSettings.get_boolean('dock-extension-state-captured')) {
            const enabled = this._shellSettings.get_strv('enabled-extensions');
            const disabled = this._shellSettings.get_strv('disabled-extensions');

            this._veloraSettings.set_boolean(
                'dock-original-enabled-listed',
                enabled.includes(UBUNTU_DOCK_UUID)
            );
            this._veloraSettings.set_boolean(
                'dock-original-disabled-listed',
                disabled.includes(UBUNTU_DOCK_UUID)
            );
            this._veloraSettings.set_boolean(
                'dock-extension-state-captured',
                true
            );
        }
    }

    _setExtensionVisible(visible) {
        let enabled = this._shellSettings
            .get_strv('enabled-extensions')
            .filter(uuid => uuid !== UBUNTU_DOCK_UUID);
        let disabled = this._shellSettings
            .get_strv('disabled-extensions')
            .filter(uuid => uuid !== UBUNTU_DOCK_UUID);

        if (visible)
            enabled.push(UBUNTU_DOCK_UUID);
        else
            disabled.push(UBUNTU_DOCK_UUID);

        this._shellSettings.delay();
        this._shellSettings.set_strv('enabled-extensions', enabled);
        this._shellSettings.set_strv('disabled-extensions', disabled);
        this._shellSettings.apply();
    }

    _restoreCapturedDockSettings() {
        if (!this._veloraSettings.get_boolean('dock-state-captured'))
            return false;

        if (this._ensureSettings()) {
            this._settings.set_boolean(
                'dock-fixed',
                this._veloraSettings.get_boolean('dock-original-fixed')
            );
            this._settings.set_boolean(
                'manualhide',
                this._veloraSettings.get_boolean('dock-original-manualhide')
            );
        }

        return true;
    }

    _clearCapture() {
        this._veloraSettings.set_boolean('dock-state-captured', false);
        this._veloraSettings.set_boolean(
            'dock-extension-state-captured',
            false
        );
    }

    _hideUbuntuDock() {
        this._captureCurrentState();

        if (this._ensureSettings()) {
            this._settings.set_boolean('dock-fixed', false);
            this._settings.set_boolean('manualhide', true);
        }

        this._setExtensionVisible(false);
    }

    _showUbuntuDockForToggle() {
        const restoredSettings = this._restoreCapturedDockSettings();

        // OFF must be deterministic for the user. If an older Velora build
        // left stale hide settings without a usable snapshot, recover to the
        // normal visible Ubuntu Dock defaults.
        if (!restoredSettings && this._ensureSettings()) {
            this._settings.set_boolean('dock-fixed', true);
            this._settings.set_boolean('manualhide', false);
        }

        this._setExtensionVisible(true);

        // Turning "Hide Ubuntu Dock" off establishes a clean visible baseline.
        // A later ON will capture this fresh state instead of reusing stale
        // state left by an interrupted/older Velora session.
        this._clearCapture();
    }

    _restoreOriginalState() {
        const capturedExtensionState =
            this._veloraSettings.get_boolean('dock-extension-state-captured');

        this._restoreCapturedDockSettings();

        if (capturedExtensionState) {
            const originalEnabled = this._veloraSettings.get_boolean(
                'dock-original-enabled-listed'
            );
            const originalDisabled = this._veloraSettings.get_boolean(
                'dock-original-disabled-listed'
            );

            let enabled = this._shellSettings
                .get_strv('enabled-extensions')
                .filter(uuid => uuid !== UBUNTU_DOCK_UUID);
            let disabled = this._shellSettings
                .get_strv('disabled-extensions')
                .filter(uuid => uuid !== UBUNTU_DOCK_UUID);

            if (originalEnabled)
                enabled.push(UBUNTU_DOCK_UUID);
            if (originalDisabled)
                disabled.push(UBUNTU_DOCK_UUID);

            this._shellSettings.delay();
            this._shellSettings.set_strv('enabled-extensions', enabled);
            this._shellSettings.set_strv('disabled-extensions', disabled);
            this._shellSettings.apply();
        }

        this._clearCapture();
    }

    apply(shouldHide) {
        if (shouldHide)
            this._hideUbuntuDock();
        else
            this._showUbuntuDockForToggle();
    }

    restore() {
        this._restoreOriginalState();
    }

    destroy() {
        this._restoreOriginalState();
        this._settings = null;
        this._shellSettings = null;
        this._veloraSettings = null;
    }
}
