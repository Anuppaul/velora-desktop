import Gio from 'gi://Gio';

const DOCK_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
const UBUNTU_DOCK_UUID = 'ubuntu-dock@ubuntu.com';

export class DockController {
    constructor(veloraSettings) {
        this._veloraSettings = veloraSettings;
        this._settings = null;
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

    _captureDockSettings() {
        if (this._veloraSettings.get_boolean('dock-state-captured'))
            return;

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

    _captureExtensionLists() {
        if (this._veloraSettings.get_boolean('dock-extension-state-captured'))
            return;

        const enabled = global.settings.get_strv('enabled-extensions');
        const disabled = global.settings.get_strv('disabled-extensions');

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

    _forceDisableUbuntuDock() {
        const enabled = global.settings.get_strv('enabled-extensions');
        const disabled = global.settings.get_strv('disabled-extensions');

        if (enabled.includes(UBUNTU_DOCK_UUID)) {
            global.settings.set_strv(
                'enabled-extensions',
                enabled.filter(uuid => uuid !== UBUNTU_DOCK_UUID)
            );
        }

        if (!disabled.includes(UBUNTU_DOCK_UUID)) {
            global.settings.set_strv(
                'disabled-extensions',
                [...disabled, UBUNTU_DOCK_UUID]
            );
        }
    }

    _restoreExtensionLists() {
        if (!this._veloraSettings.get_boolean('dock-extension-state-captured'))
            return;

        const originalEnabled = this._veloraSettings.get_boolean(
            'dock-original-enabled-listed'
        );
        const originalDisabled = this._veloraSettings.get_boolean(
            'dock-original-disabled-listed'
        );

        let enabled = global.settings.get_strv('enabled-extensions');
        let disabled = global.settings.get_strv('disabled-extensions');

        enabled = enabled.filter(uuid => uuid !== UBUNTU_DOCK_UUID);
        disabled = disabled.filter(uuid => uuid !== UBUNTU_DOCK_UUID);

        if (originalEnabled)
            enabled.push(UBUNTU_DOCK_UUID);
        if (originalDisabled)
            disabled.push(UBUNTU_DOCK_UUID);

        global.settings.set_strv('enabled-extensions', enabled);
        global.settings.set_strv('disabled-extensions', disabled);

        this._veloraSettings.set_boolean(
            'dock-extension-state-captured',
            false
        );
    }

    apply(shouldHide) {
        if (!shouldHide) {
            this.restore();
            return;
        }

        this._captureDockSettings();
        this._captureExtensionLists();

        if (this._ensureSettings()) {
            if (this._settings.get_boolean('dock-fixed'))
                this._settings.set_boolean('dock-fixed', false);

            if (!this._settings.get_boolean('manualhide'))
                this._settings.set_boolean('manualhide', true);
        }

        this._forceDisableUbuntuDock();
    }

    restore() {
        if (this._veloraSettings.get_boolean('dock-state-captured')) {
            if (this._ensureSettings()) {
                const originalFixed =
                    this._veloraSettings.get_boolean('dock-original-fixed');
                const originalManualHide =
                    this._veloraSettings.get_boolean(
                        'dock-original-manualhide'
                    );

                this._settings.set_boolean('dock-fixed', originalFixed);
                this._settings.set_boolean(
                    'manualhide',
                    originalManualHide
                );
            }

            this._veloraSettings.set_boolean('dock-state-captured', false);
        }

        this._restoreExtensionLists();
    }

    destroy() {
        this.restore();
        this._settings = null;
        this._veloraSettings = null;
    }
}
