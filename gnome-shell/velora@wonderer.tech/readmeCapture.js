import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BUS_NAME = 'tech.wonderer.Velora.ReadmeCapture';
const OBJECT_PATH = '/tech/wonderer/Velora/ReadmeCapture';
const INTERFACE_NAME = 'tech.wonderer.Velora.ReadmeCapture';
const TOKEN_FILE = 'velora-readme-capture.token';
const CAPTURE_DIR = 'velora-readme-capture';

const INTERFACE_XML = `
<node>
  <interface name="${INTERFACE_NAME}">
    <method name="Ping">
      <arg type="s" direction="out" name="version"/>
    </method>
    <method name="Prepare">
      <arg type="s" direction="in" name="token"/>
      <arg type="s" direction="in" name="state"/>
      <arg type="s" direction="in" name="detail"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="Capture">
      <arg type="s" direction="in" name="token"/>
      <arg type="s" direction="in" name="filename"/>
      <arg type="b" direction="out" name="started"/>
    </method>
    <method name="Reset">
      <arg type="s" direction="in" name="token"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
  </interface>
</node>`;

function runtimeDir() {
    return GLib.get_user_runtime_dir() || GLib.get_tmp_dir();
}

function removeFile(file) {
    try {
        if (file.query_exists(null))
            file.delete(null);
    } catch {}
}

export class ReadmeCaptureBridge {
    constructor(runtime) {
        this._runtime = runtime;
        this._dbusObject = null;
        this._busOwnerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            connection => this._onBusAcquired(connection),
            null,
            () => {
                this._dbusObject?.unexport?.();
                this._dbusObject = null;
            }
        );
    }

    _onBusAcquired(connection) {
        this._dbusObject?.unexport?.();
        this._dbusObject = Gio.DBusExportedObject.wrapJSObject(
            INTERFACE_XML,
            this
        );
        this._dbusObject.export(connection, OBJECT_PATH);
    }

    Ping() {
        return '1';
    }

    Prepare(token, state, detail) {
        this._assertToken(token);
        this._prepare(state, detail ?? '');
        return true;
    }

    Capture(token, filename) {
        this._assertToken(token);

        if (!/^[a-z0-9][a-z0-9-]*\.png$/.test(filename)) {
            throw new Error(
                'README capture filename must be lowercase kebab-case PNG.'
            );
        }

        const outputDir = GLib.build_filenamev([
            runtimeDir(),
            CAPTURE_DIR,
        ]);
        GLib.mkdir_with_parents(outputDir, 0o700);

        const finalFile = Gio.File.new_for_path(
            GLib.build_filenamev([outputDir, filename])
        );
        const temporaryFile = Gio.File.new_for_path(
            `${finalFile.get_path()}.part`
        );

        removeFile(finalFile);
        removeFile(temporaryFile);

        const stream = temporaryFile.replace(
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        const monitor =
            Main.layoutManager.primaryMonitor ??
            Main.layoutManager.monitors?.[0] ??
            {
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
            };
        const shooter = new Shell.Screenshot();

        try {
            shooter.screenshot_area(
                monitor.x,
                monitor.y,
                monitor.width,
                monitor.height,
                stream,
                (source, result) => {
                    try {
                        const success = source.screenshot_area_finish(result);
                        stream.close(null);

                        if (!success) {
                            removeFile(temporaryFile);
                            console.error(
                                `[Velora][ReadmeCapture] screenshot failed: ${filename}`
                            );
                            return;
                        }

                        temporaryFile.move(
                            finalFile,
                            Gio.FileCopyFlags.OVERWRITE,
                            null,
                            null
                        );
                        console.log(
                            `[Velora][ReadmeCapture] wrote ${finalFile.get_path()}`
                        );
                    } catch (error) {
                        try {
                            stream.close(null);
                        } catch {}
                        removeFile(temporaryFile);
                        logError(
                            error,
                            `Velora README capture failed: ${filename}`
                        );
                    }
                }
            );
        } catch (error) {
            try {
                stream.close(null);
            } catch {}
            removeFile(temporaryFile);
            throw error;
        }

        return true;
    }

    Reset(token) {
        this._assertToken(token);
        this._resetSurfaces();
        return true;
    }

    _prepare(state, detail) {
        switch (state) {
        case 'desktop':
            this._resetSurfaces();
            this._showOrbForCapture(false);
            break;
        case 'orb':
            this._resetSurfaces();
            this._showOrbForCapture(true);
            break;
        case 'spotlight':
            this._resetSurfaces();
            this._openSpotlight(detail);
            break;
        case 'calendar':
            this._resetSurfaces();
            this._openPanelMenu('dateMenu');
            break;
        case 'quick-settings':
            this._resetSurfaces();
            this._openPanelMenu('quickSettings');
            break;
        case 'app-grid':
            this._resetSurfaces();
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                180,
                () => {
                    this._runtime?._showAllApps?.();
                    return GLib.SOURCE_REMOVE;
                }
            );
            break;
        default:
            throw new Error(`Unsupported README capture state: ${state}`);
        }
    }

    _showOrbForCapture(openMenu) {
        this._runtime?._setOrbEnabled?.(true);
        this._runtime?._cancelOrbAutoHideTimer?.();
        this._runtime?._cancelOrbAutoFadeTimer?.();
        this._runtime?._restoreOrbOpacity?.(false);
        this._runtime?._revealOrb?.();

        if (openMenu)
            this._runtime?._openMenu?.();
    }

    _openSpotlight(query) {
        const spotlight = this._runtime?._spotlightSearch;
        if (!spotlight)
            throw new Error('Velora Spotlight controller is unavailable.');

        spotlight._open?.();
        if (!query)
            return;

        spotlight._entry?.set_text?.(query);
        spotlight._updateResults?.();
    }

    _openPanelMenu(key) {
        const menu = Main.panel?.statusArea?.[key]?.menu;
        if (!menu?.open)
            throw new Error(`GNOME panel menu is unavailable: ${key}`);

        menu.open();
    }

    _closePanelMenus() {
        for (const item of Object.values(Main.panel?.statusArea ?? {})) {
            try {
                item?.menu?.close?.();
            } catch {}
        }
    }

    _resetSurfaces() {
        try {
            this._runtime?._spotlightSearch?.close?.(true);
        } catch {}
        try {
            this._runtime?._closeMenu?.(true);
        } catch {}
        this._closePanelMenus();

        try {
            if (Main.overview.visible)
                Main.overview.hide();
        } catch {}

        const orbEnabled =
            this._runtime?._settings?.get_boolean?.('orb-enabled') ?? true;
        this._runtime?._setOrbEnabled?.(orbEnabled);

        if (orbEnabled) {
            this._runtime?._cancelOrbAutoHideTimer?.();
            this._runtime?._cancelOrbAutoFadeTimer?.();
            this._runtime?._restoreOrbOpacity?.(false);
            this._runtime?._revealOrb?.();
            this._runtime?._scheduleOrbAutoHide?.();
            this._runtime?._scheduleOrbAutoFade?.();
        }
    }

    _assertToken(token) {
        const tokenFile = Gio.File.new_for_path(
            GLib.build_filenamev([runtimeDir(), TOKEN_FILE])
        );

        let contents;
        try {
            const [success, bytes] = tokenFile.load_contents(null);
            if (!success)
                throw new Error('token read failed');
            contents = new TextDecoder().decode(bytes).trim();
        } catch {
            throw new Error(
                'README capture session is not active. Run gnome-shell/tools/capture-readme.sh.'
            );
        }

        if (!contents || token !== contents) {
            throw new Error('Invalid Velora README capture token.');
        }
    }

    destroy() {
        try {
            this._resetSurfaces();
        } catch {}

        this._runtime = null;
        this._dbusObject?.unexport?.();
        this._dbusObject = null;

        if (this._busOwnerId) {
            Gio.bus_unown_name(this._busOwnerId);
            this._busOwnerId = 0;
        }
    }
}
