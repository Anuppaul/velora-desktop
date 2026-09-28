import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export const VELORA_BOOTSTRAP_API = 1;
export const VELORA_BOOTSTRAP_GENERATION = '2026-09-28-b';

const BASE_REVISION = 'base';
const BOOTSTRAP_REVISION_FILE = '.velora-bootstrap-revision';

export default class VeloraBootstrap extends Extension {
    async enable() {
        this._enabled = true;
        this._settings = this.getSettings();
        this._settings.set_string(
            'bootstrap-loaded-generation',
            VELORA_BOOTSTRAP_GENERATION
        );
        this._settings.set_string(
            'bootstrap-loaded-revision',
            this._readBootstrapRevision()
        );
        this._runtime = null;
        this._runtimeStyle = null;
        this._runtimeRevision = null;
        this._reloadGeneration = 1;
        this._reloadPromise = Promise.resolve();

        this._revisionChangedId = this._settings.connect(
            'changed::runtime-revision',
            () => this._queueReload()
        );

        await this._reloadRuntime(this._reloadGeneration);
    }

    disable() {
        this._enabled = false;
        this._reloadGeneration++;

        if (this._settings && this._revisionChangedId) {
            this._settings.disconnect(this._revisionChangedId);
            this._revisionChangedId = 0;
        }

        this._disableRuntime();
        this._settings = null;
        this._reloadPromise = null;
    }

    _queueReload() {
        if (!this._enabled)
            return;

        const generation = ++this._reloadGeneration;
        this._reloadPromise = this._reloadPromise
            .then(() => this._reloadRuntime(generation))
            .catch(error => {
                this._recordError(error);
            });
    }

    async _reloadRuntime(generation) {
        if (!this._enabled || generation !== this._reloadGeneration)
            return;

        const requestedRevision =
            this._settings.get_string('runtime-revision') || BASE_REVISION;
        const target = this._resolveRuntime(requestedRevision);

        if (
            this._runtime &&
            this._runtimeRevision === target.revision
        ) {
            this._setRuntimeStatus(target.revision, target.warning);
            return;
        }

        let runtimeModule;
        try {
            runtimeModule = await import(target.moduleFile.get_uri());
        } catch (error) {
            this._recordError(
                new Error(
                    `Unable to import Velora runtime ${target.revision}: ${error.message}`
                )
            );
            return;
        }

        if (!this._enabled || generation !== this._reloadGeneration)
            return;

        let nextRuntime;
        try {
            nextRuntime = new runtimeModule.default(this.metadata);
        } catch (error) {
            this._recordError(
                new Error(
                    `Unable to create Velora runtime ${target.revision}: ${error.message}`
                )
            );
            return;
        }

        const previousRuntime = this._runtime;
        const previousStyle = this._runtimeStyle;
        const previousRevision = this._runtimeRevision;
        let nextStyle = null;

        try {
            if (previousRuntime)
                previousRuntime.disable();
            this._unloadStyle(previousStyle);

            nextStyle = this._loadStyle(target.styleFile);
            await nextRuntime.enable();

            if (!this._enabled || generation !== this._reloadGeneration) {
                nextRuntime.disable();
                this._unloadStyle(nextStyle);
                return;
            }

            this._runtime = nextRuntime;
            this._runtimeStyle = nextStyle;
            this._runtimeRevision = target.revision;
            this._setRuntimeStatus(target.revision, target.warning);
        } catch (error) {
            try {
                nextRuntime.disable();
            } catch {
                // Best-effort cleanup of a partially enabled runtime.
            }
            this._unloadStyle(nextStyle);

            this._runtime = null;
            this._runtimeStyle = null;
            this._runtimeRevision = null;

            if (previousRuntime && this._enabled) {
                try {
                    const restoredStyle = this._loadStyle(previousStyle);
                    await previousRuntime.enable();

                    this._runtime = previousRuntime;
                    this._runtimeStyle = restoredStyle;
                    this._runtimeRevision = previousRevision;
                } catch (rollbackError) {
                    this._recordError(
                        new Error(
                            `Runtime ${target.revision} failed: ${error.message}; ` +
                            `rollback also failed: ${rollbackError.message}`
                        )
                    );
                    return;
                }
            }

            this._recordError(
                new Error(
                    `Runtime ${target.revision} failed: ${error.message}`
                )
            );
        }
    }

    _readBootstrapRevision() {
        const marker = this.dir.get_child(BOOTSTRAP_REVISION_FILE);

        try {
            const [success, contents] = marker.load_contents(null);
            if (success) {
                const revision = new TextDecoder()
                    .decode(contents)
                    .trim();
                if (revision)
                    return revision;
            }
        } catch {
            // Older installs may not have a bootstrap revision marker.
        }

        return VELORA_BOOTSTRAP_GENERATION;
    }

    _canonicalExtensionDir() {
        return Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'gnome-shell',
            'extensions',
            this.uuid,
        ]));
    }

    _resolveRuntime(requestedRevision) {
        const runtimeRoot = this._canonicalExtensionDir();

        if (
            requestedRevision &&
            requestedRevision !== BASE_REVISION
        ) {
            const revisionDir = runtimeRoot
                .get_child('runtime-revisions')
                .get_child(requestedRevision);
            const moduleFile = revisionDir.get_child('runtime.js');
            const styleFile = revisionDir.get_child('runtime.css');

            if (moduleFile.query_exists(null)) {
                return {
                    revision: requestedRevision,
                    moduleFile,
                    styleFile,
                    warning: '',
                };
            }
        }

        const warning =
            requestedRevision && requestedRevision !== BASE_REVISION
                ? `Requested runtime ${requestedRevision} was not found; loaded base runtime.`
                : '';

        return {
            revision: BASE_REVISION,
            moduleFile: runtimeRoot.get_child('runtime.js'),
            styleFile: runtimeRoot.get_child('runtime.css'),
            warning,
        };
    }

    _loadStyle(styleFile) {
        if (!styleFile || !styleFile.query_exists(null))
            return null;

        const theme = St.ThemeContext
            .get_for_stage(global.stage)
            .get_theme();
        theme.load_stylesheet(styleFile);
        return styleFile;
    }

    _unloadStyle(styleFile) {
        if (!styleFile)
            return;

        try {
            const theme = St.ThemeContext
                .get_for_stage(global.stage)
                .get_theme();
            theme.unload_stylesheet(styleFile);
        } catch {
            // The stylesheet may already have been unloaded.
        }
    }

    _disableRuntime() {
        if (this._runtime) {
            try {
                this._runtime.disable();
            } catch (error) {
                logError(error, 'Velora Desktop: runtime disable failed');
            }
        }

        this._unloadStyle(this._runtimeStyle);
        this._runtime = null;
        this._runtimeStyle = null;
        this._runtimeRevision = null;
    }

    _setRuntimeStatus(loadedRevision, warning = '') {
        if (!this._settings)
            return;

        this._settings.set_string(
            'runtime-loaded-revision',
            loadedRevision ?? ''
        );
        this._settings.set_string('runtime-error', warning);
    }

    _recordError(error) {
        logError(error, 'Velora Desktop runtime reload failed');

        if (!this._settings)
            return;

        this._settings.set_string(
            'runtime-loaded-revision',
            this._runtimeRevision ?? ''
        );
        this._settings.set_string(
            'runtime-error',
            error?.message ?? String(error)
        );
    }
}
