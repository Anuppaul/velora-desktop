import Gio from 'gi://Gio';

const DOCK_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';

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

    apply(shouldHide) {
        if (!shouldHide) {
            this.restore();
            return;
        }

        if (!this._ensureSettings())
            return;

        if (!this._veloraSettings.get_boolean('dock-state-captured')) {
            this._veloraSettings.set_boolean(
                'dock-original-manualhide',
                this._settings.get_boolean('manualhide')
            );
            this._veloraSettings.set_boolean(
                'dock-original-fixed',
                this._settings.get_boolean('dock-fixed')
            );
            this._veloraSettings.set_boolean('dock-state-captured', true);
        }

        if (this._settings.get_boolean('dock-fixed'))
            this._settings.set_boolean('dock-fixed', false);

        if (!this._settings.get_boolean('manualhide'))
            this._settings.set_boolean('manualhide', true);
    }

    restore() {
        if (!this._veloraSettings.get_boolean('dock-state-captured'))
            return;

        if (!this._ensureSettings())
            return;

        const originalFixed =
            this._veloraSettings.get_boolean('dock-original-fixed');
        const originalManualHide =
            this._veloraSettings.get_boolean('dock-original-manualhide');

        this._settings.set_boolean('dock-fixed', originalFixed);
        this._settings.set_boolean('manualhide', originalManualHide);

        this._veloraSettings.set_boolean('dock-state-captured', false);
    }

    destroy() {
        this.restore();
        this._settings = null;
        this._veloraSettings = null;
    }
}
