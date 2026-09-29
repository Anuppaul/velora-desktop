import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    ExtensionState,
} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

const UPSTREAM_EXTENSION_UUID =
    'liquid-glass@thinkingcoding1231.gmail.com';

const GLASS_SCHEMA =
    'org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com';

const VENDOR_CACHE_KEY = '__veloraLiquidGlassVendorModulesV2';
const VENDOR_ROOT_KEY = '__veloraLiquidGlassVendorRootV2';
const VENDOR_PROMISE_KEY = '__veloraLiquidGlassVendorPromiseV2';
const LEGACY_VENDOR_ROOT_KEY = '__veloraLiquidGlassVendorRootV1';
const DEBUG_STATE_KEY = '__veloraLiquidGlassDebugV2';
const DASH_RESCAN_IDLE_TICKS = 2;
const DASH_RESCAN_INTERVAL_MS = 2000;

function canonicalExtensionRoot() {
    return GLib.build_filenamev([
        GLib.get_user_data_dir(),
        'gnome-shell',
        'extensions',
        'velora@wonderer.tech',
    ]);
}

export function canonicalVendorRoot() {
    return GLib.build_filenamev([
        canonicalExtensionRoot(),
        'vendor',
        'liquid-glass',
    ]);
}

function activeUpstreamExtensionRoot() {
    try {
        const extension = Main.extensionManager.lookup(
            UPSTREAM_EXTENSION_UUID
        );
        if (
            extension &&
            extension.state === ExtensionState.ACTIVE &&
            extension.path
        ) {
            return extension.path;
        }
    } catch {
        // Upstream extension is not active/available.
    }

    return null;
}

function previousRevisionVendorRoot(settings) {
    const revision =
        settings?.get_string?.('runtime-loaded-revision')?.trim?.() ?? '';
    if (!revision || revision === 'base')
        return null;

    const root = GLib.build_filenamev([
        canonicalExtensionRoot(),
        'runtime-revisions',
        revision,
        'vendor',
        'liquid-glass',
    ]);
    const entry = Gio.File.new_for_path(
        GLib.build_filenamev([
            root,
            'dist',
            'liquidEffect.js',
        ])
    );
    return entry.query_exists(null) ? root : null;
}

function moduleUri(root, relativePath) {
    return Gio.File.new_for_path(
        GLib.build_filenamev([
            root,
            ...relativePath.split('/'),
        ])
    ).get_uri();
}

export function createLiquidGlassSettings() {
    const schemaDir = GLib.build_filenamev([
        canonicalVendorRoot(),
        'schemas',
    ]);

    const compiled = Gio.File.new_for_path(
        GLib.build_filenamev([
            schemaDir,
            'gschemas.compiled',
        ])
    );
    if (!compiled.query_exists(null)) {
        throw new Error(
            'Vendored Liquid Glass GSettings schema is not compiled: ' +
            schemaDir
        );
    }

    const source = Gio.SettingsSchemaSource.new_from_directory(
        schemaDir,
        Gio.SettingsSchemaSource.get_default(),
        false
    );
    const schema = source.lookup(GLASS_SCHEMA, true);
    if (!schema)
        throw new Error('Vendored Liquid Glass GSettings schema was not found');

    return new Gio.Settings({settings_schema: schema});
}

async function importVendorModules(root) {
    const [
        liquidEffect,
        unpickable,
        dockManager,
        uiManager,
        panelMenuManager,
        notificationManager,
        quickSettingsManager,
        osdManager,
        applicationManager,
        windowListService,
        logger,
        utils,
    ] = await Promise.all([
        import(moduleUri(root, 'dist/liquidEffect.js')),
        import(moduleUri(root, 'dist/actors/unpickable.js')),
        import(moduleUri(root, 'dist/dockManager.js')),
        import(moduleUri(root, 'dist/uiManager.js')),
        import(moduleUri(root, 'dist/panelMenuManager.js')),
        import(moduleUri(root, 'dist/notificationManager.js')),
        import(moduleUri(root, 'dist/quickSettingsManager.js')),
        import(moduleUri(root, 'dist/osdManager.js')),
        import(moduleUri(root, 'dist/applicationManager.js')),
        import(moduleUri(root, 'dist/windowListService.js')),
        import(moduleUri(root, 'dist/logger.js')),
        import(moduleUri(root, 'dist/utils.js')),
    ]);

    return {
        root,
        LiquidEffect: liquidEffect.LiquidEffect,
        startGlassRingSampler: liquidEffect.startGlassRingSampler,
        stopGlassRingSampler: liquidEffect.stopGlassRingSampler,
        flushGlassRing: liquidEffect.flushGlassRing,
        UnpickableActor: unpickable.UnpickableActor,
        DashManager: dockManager.DashManager,
        UIManager: uiManager.UIManager,
        PanelMenuManager: panelMenuManager.PanelMenuManager,
        NotificationManager: notificationManager.NotificationManager,
        QuickSettingsManager: quickSettingsManager.QuickSettingsManager,
        OsdManager: osdManager.OsdManager,
        ApplicationManager: applicationManager.ApplicationManager,
        WindowListService: windowListService.WindowListService,
        Logger: logger.Logger,
        setUtilsLogger: utils.setUtilsLogger,
        adaptiveColorTweener: utils.adaptiveColorTweener,
        destroySharedBackgroundSource:
            utils.destroySharedBackgroundSource,
        releaseAllClonedWindowActors:
            utils.releaseAllClonedWindowActors,
    };
}

export async function loadLiquidGlassVendorModules(veloraSettings) {
    if (globalThis[VENDOR_CACHE_KEY])
        return globalThis[VENDOR_CACHE_KEY];

    if (globalThis[VENDOR_PROMISE_KEY])
        return globalThis[VENDOR_PROMISE_KEY];

    let root =
        globalThis[VENDOR_ROOT_KEY] ??
        globalThis[LEGACY_VENDOR_ROOT_KEY] ??
        activeUpstreamExtensionRoot() ??
        null;

    if (root)
        globalThis[VENDOR_ROOT_KEY] = root;

    if (!root) {
        const liquidType = GObject.type_from_name('LiquidGlassEffect');
        const cloneType = GObject.type_from_name(
            'Gjs_actors_unpickable_UnpickableClone'
        );
        const alreadyRegistered = Boolean(liquidType || cloneType);

        if (alreadyRegistered) {
            root = previousRevisionVendorRoot(veloraSettings);
            if (!root) {
                throw new Error(
                    'Liquid Glass GObject types are already registered, ' +
                    'but the previously loaded Velora vendor revision is unavailable'
                );
            }
        } else {
            root = canonicalVendorRoot();
        }

        globalThis[VENDOR_ROOT_KEY] = root;
    }

    const promise = importVendorModules(root)
        .then(modules => {
            globalThis[VENDOR_CACHE_KEY] = modules;
            return modules;
        })
        .catch(error => {
            delete globalThis[VENDOR_PROMISE_KEY];
            if (!globalThis[VENDOR_CACHE_KEY])
                delete globalThis[VENDOR_ROOT_KEY];
            throw error;
        });

    globalThis[VENDOR_PROMISE_KEY] = promise;
    return promise;
}

export class LiquidGlassIntegration {
    constructor(params) {
        this._veloraSettings = params.veloraSettings;
        this._vendor = null;
        this._settings = null;
        this._logger = null;
        this._stylesheet = null;

        this._uiManager = null;
        this._panelMenuManager = null;
        this._notificationManager = null;
        this._quickSettingsManager = null;
        this._osdManager = null;
        this._applicationManager = null;
        this._windowListService = null;
        this._dockManagers = new Set();
        this._nativeDashEntries = [];

        this._quickSettingsTimeoutId = 0;
        this._dashTimeoutId = 0;
        this._dashReconnectTimeoutId = 0;
        this._monitorsChangedId = 0;
        this._dumpLoopId = 0;
        this._dumpSettingsId = 0;
        this._dumpKeybindingInstalled = false;
        this._enabled = false;
        this._externalGlobalStack = false;
        this._managerHealth = {};
    }

    async enable() {
        if (this._enabled)
            return;

        this._vendor = await loadLiquidGlassVendorModules(
            this._veloraSettings
        );
        this._settings = createLiquidGlassSettings();

        const externalRoot = activeUpstreamExtensionRoot();
        this._externalGlobalStack = Boolean(
            externalRoot &&
            externalRoot === this._vendor.root
        );

        this._logger = new this._vendor.Logger(this._settings);
        if (!this._externalGlobalStack)
            this._vendor.setUtilsLogger(this._logger);

        if (!this._externalGlobalStack)
            this._loadStylesheet();

        this._enabled = true;
        console.log(
            '[Velora][LiquidGlass] full upstream integration root: ' +
            this._vendor.root
        );

        if (this._externalGlobalStack) {
            console.warn(
                '[Velora][LiquidGlass] original Liquid Glass extension is ' +
                'already active; reusing its global manager stack and ' +
                'attaching only Velora-specific dock surfaces.'
            );
            this._installDebugState();
            return;
        }

        this._setupDiagnostics();

        const start = (name, fn) => {
            try {
                fn();
                this._managerHealth[name] = true;
                console.log(
                    '[Velora][LiquidGlass] ' +
                    name +
                    ' active'
                );
                return true;
            } catch (error) {
                this._managerHealth[name] = false;
                console.error(
                    '[Velora][LiquidGlass] ' +
                    name +
                    ' setup failed: ' +
                    error +
                    '\n' +
                    (error?.stack ?? '')
                );
                return false;
            }
        };

        start('uiManager', () => {
            this._uiManager = new this._vendor.UIManager(
                this._vendor.root,
                this._settings,
                this._logger
            );
            this._uiManager.setup();
        });

        start('panelMenuManager', () => {
            this._panelMenuManager =
                new this._vendor.PanelMenuManager(
                    this._vendor.root,
                    this._settings,
                    this._logger
                );
            this._panelMenuManager.setup();
        });

        start('notificationManager', () => {
            this._notificationManager =
                new this._vendor.NotificationManager(
                    this._vendor.root,
                    this._settings,
                    this._logger
                );
            this._notificationManager.setup();
        });

        start('osdManager', () => {
            this._osdManager = new this._vendor.OsdManager(
                this._vendor.root,
                this._settings,
                this._logger
            );
            this._osdManager.setup();
        });

        start('applicationManager', () => {
            this._applicationManager =
                new this._vendor.ApplicationManager(
                    this._vendor.root,
                    this._settings,
                    this._logger
                );
            this._applicationManager.setup();
        });

        start('windowListService', () => {
            this._windowListService =
                new this._vendor.WindowListService(this._logger);
            this._windowListService.setup();
        });

        this._quickSettingsTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            1500,
            () => {
                this._quickSettingsTimeoutId = 0;
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;

                start('quickSettingsManager', () => {
                    this._quickSettingsManager =
                        new this._vendor.QuickSettingsManager(
                            this._vendor.root,
                            this._settings,
                            this._logger
                        );
                    this._quickSettingsManager.setup();
                });
                return GLib.SOURCE_REMOVE;
            }
        );

        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => this._scheduleNativeDashRescan()
        );

        this._dashTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            2000,
            () => {
                try {
                    this._findNativeDashToDock();
                    this._scheduleNativeDashRescan();
                } finally {
                    this._dashTimeoutId = 0;
                }
                return GLib.SOURCE_REMOVE;
            }
        );

        console.log(
            '[Velora][LiquidGlass] immediate manager health: ' +
            JSON.stringify(this._managerHealth)
        );

        this._installDebugState();
    }

    _collectNativeDashContainers() {
        const found = [];
        const skip = global.window_group;

        const walk = actor => {
            if (!actor || actor === skip)
                return;

            if (
                actor.get_name?.() ===
                'dashtodockDashContainer'
            ) {
                found.push(actor);
                return;
            }

            for (const child of actor.get_children?.() ?? [])
                walk(child);
        };

        walk(Main.layoutManager.uiGroup);
        return found;
    }

    _findNativeDashToDock() {
        const containers =
            this._collectNativeDashContainers();
        if (containers.length === 0)
            return false;

        let added = 0;
        for (const container of containers) {
            if (
                this._nativeDashEntries.some(
                    entry => entry.container === container
                )
            ) {
                continue;
            }

            const entry = {
                container,
                manager: null,
                destroyId: 0,
            };
            this._nativeDashEntries.push(entry);

            try {
                entry.manager =
                    new this._vendor.DashManager(
                        this._vendor.root,
                        container,
                        this._settings,
                        this._logger
                    );
                entry.manager.setup();
                entry.destroyId = container.connect(
                    'destroy',
                    () => {
                        entry.destroyId = 0;
                        try {
                            this._releaseNativeDash(entry);
                        } finally {
                            this._scheduleNativeDashRescan();
                        }
                    }
                );
                added++;
            } catch (error) {
                console.error(
                    '[Velora][LiquidGlass] native dock attach failed: ' +
                    error
                );
                this._releaseNativeDash(entry);
            }
        }

        return added > 0;
    }

    _releaseNativeDash(entry) {
        const index =
            this._nativeDashEntries.indexOf(entry);
        if (index >= 0)
            this._nativeDashEntries.splice(index, 1);

        if (entry.destroyId) {
            try {
                entry.container.disconnect(entry.destroyId);
            } catch {
                // Container may already be gone.
            }
            entry.destroyId = 0;
        }

        if (entry.manager) {
            try {
                entry.manager.cleanup();
            } catch (error) {
                console.error(
                    '[Velora][LiquidGlass] native dock cleanup failed: ' +
                    error
                );
            }
            entry.manager = null;
        }
    }

    _scheduleNativeDashRescan() {
        if (this._dashReconnectTimeoutId) {
            try {
                GLib.source_remove(
                    this._dashReconnectTimeoutId
                );
            } catch {
                // Previous source may already be gone.
            }
        }

        let idleTicks = 0;
        let sourceId = 0;
        sourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            DASH_RESCAN_INTERVAL_MS,
            () => {
                let keepGoing = false;
                try {
                    idleTicks =
                        this._findNativeDashToDock()
                            ? 0
                            : idleTicks + 1;
                    keepGoing =
                        idleTicks < DASH_RESCAN_IDLE_TICKS;
                } finally {
                    if (
                        !keepGoing &&
                        this._dashReconnectTimeoutId ===
                            sourceId
                    ) {
                        this._dashReconnectTimeoutId = 0;
                    }
                }

                return keepGoing
                    ? GLib.SOURCE_CONTINUE
                    : GLib.SOURCE_REMOVE;
            }
        );

        this._dashReconnectTimeoutId = sourceId;
    }

    async attachDock(targetActor) {
        if (!this._enabled)
            await this.enable();

        const manager = new this._vendor.DashManager(
            this._vendor.root,
            targetActor,
            this._settings,
            this._logger
        );
        manager.setup();
        this._dockManagers.add(manager);
        return manager;
    }

    detachDock(manager) {
        if (!manager)
            return;

        this._dockManagers.delete(manager);
        try {
            manager.cleanup();
        } catch (error) {
            console.error(
                '[Velora][LiquidGlass] dock cleanup failed: ' + error
            );
        }
    }

    _loadStylesheet() {
        const file = Gio.File.new_for_path(
            GLib.build_filenamev([
                this._vendor.root,
                'stylesheet.css',
            ])
        );
        if (!file.query_exists(null))
            return;

        const theme = St.ThemeContext
            .get_for_stage(global.stage)
            .get_theme();
        theme.load_stylesheet(file);
        this._stylesheet = file;
    }

    _unloadStylesheet() {
        if (!this._stylesheet)
            return;

        try {
            const theme = St.ThemeContext
                .get_for_stage(global.stage)
                .get_theme();
            theme.unload_stylesheet(this._stylesheet);
        } catch {
            // Theme may already be tearing down.
        }
        this._stylesheet = null;
    }

    _setupDiagnostics() {
        try {
            this._vendor.startGlassRingSampler(50);
        } catch {
            // Diagnostics are optional.
        }

        this._dumpSettingsId = this._settings.connect(
            'changed::enable-dump-shortcut',
            () => this._syncDumpKeybinding()
        );
        this._syncDumpKeybinding();
    }

    _syncDumpKeybinding() {
        const wanted = this._settings.get_boolean(
            'enable-dump-shortcut'
        );

        if (wanted && !this._dumpKeybindingInstalled) {
            Main.wm.addKeybinding(
                'dump-loop-keybinding',
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW,
                () => this._toggleDumpLoop()
            );
            this._dumpKeybindingInstalled = true;
        } else if (!wanted && this._dumpKeybindingInstalled) {
            try {
                Main.wm.removeKeybinding('dump-loop-keybinding');
            } catch {
                // Binding may already be gone.
            }
            this._dumpKeybindingInstalled = false;
            this._stopDumpLoop();
        }
    }

    _toggleDumpLoop() {
        if (this._dumpLoopId) {
            this._stopDumpLoop();
            Main.notify('Liquid Glass', 'Diagnostic dump stopped');
            return;
        }

        try {
            this._vendor.flushGlassRing();
        } catch {
            // Ring is diagnostic-only.
        }

        const intervalMs = 100;
        const ticks = 600;
        let count = 0;

        this._dumpLoopId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            intervalMs,
            () => {
                try {
                    global._lgGlass?.dump();
                } catch {
                    // Keep the diagnostic loop alive.
                }

                count++;
                if (count < ticks)
                    return GLib.SOURCE_CONTINUE;

                this._dumpLoopId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );

        Main.notify(
            'Liquid Glass',
            'Diagnostic dump running for 60 seconds'
        );
    }

    _stopDumpLoop() {
        if (!this._dumpLoopId)
            return;

        try {
            GLib.source_remove(this._dumpLoopId);
        } catch {
            // Source may have completed already.
        }
        this._dumpLoopId = 0;
    }

    _installDebugState() {
        globalThis[DEBUG_STATE_KEY] = {
            status: () => ({
                enabled: this._enabled,
                vendorRoot: this._vendor?.root ?? null,
                liveEffects:
                    globalThis.global?._lgGlass?.count?.() ?? null,
                dockManagers: this._dockManagers.size,
                nativeDashManagers:
                    this._nativeDashEntries.length,
                uiManager: Boolean(this._uiManager),
                panelMenuManager: Boolean(this._panelMenuManager),
                notificationManager: Boolean(
                    this._notificationManager
                ),
                quickSettingsManager: Boolean(
                    this._quickSettingsManager
                ),
                osdManager: Boolean(this._osdManager),
                applicationManager: Boolean(
                    this._applicationManager
                ),
                windowListService: Boolean(
                    this._windowListService
                ),
                externalGlobalStack:
                    this._externalGlobalStack,
                managerHealth: {
                    ...this._managerHealth,
                },
            }),
            dump: () => {
                const status =
                    globalThis[DEBUG_STATE_KEY]?.status?.() ?? null;
                console.log(
                    '[Velora][LiquidGlass][full-status] ' +
                    JSON.stringify(status)
                );
                const upstream =
                    globalThis.global?._lgGlass?.dump?.() ?? null;
                return {status, upstream};
            },
        };
    }

    disable() {
        if (!this._enabled && !this._vendor)
            return;

        this._enabled = false;

        if (this._quickSettingsTimeoutId) {
            try {
                GLib.source_remove(this._quickSettingsTimeoutId);
            } catch {
                // Source may already be gone.
            }
            this._quickSettingsTimeoutId = 0;
        }

        if (this._monitorsChangedId) {
            try {
                Main.layoutManager.disconnect(
                    this._monitorsChangedId
                );
            } catch {
                // Layout manager may already be tearing down.
            }
            this._monitorsChangedId = 0;
        }

        if (this._dashTimeoutId) {
            try {
                GLib.source_remove(this._dashTimeoutId);
            } catch {
                // Source may already be gone.
            }
            this._dashTimeoutId = 0;
        }

        if (this._dashReconnectTimeoutId) {
            try {
                GLib.source_remove(
                    this._dashReconnectTimeoutId
                );
            } catch {
                // Source may already be gone.
            }
            this._dashReconnectTimeoutId = 0;
        }

        this._stopDumpLoop();

        if (this._dumpSettingsId && this._settings) {
            try {
                this._settings.disconnect(this._dumpSettingsId);
            } catch {
                // Settings may already be tearing down.
            }
            this._dumpSettingsId = 0;
        }

        if (this._dumpKeybindingInstalled) {
            try {
                Main.wm.removeKeybinding('dump-loop-keybinding');
            } catch {
                // Binding may already be gone.
            }
            this._dumpKeybindingInstalled = false;
        }

        if (!this._externalGlobalStack) {
            try {
                this._vendor?.stopGlassRingSampler();
            } catch {
                // Diagnostic cleanup is best-effort.
            }

            // Match upstream teardown ordering for shared compositor state.
            try {
                this._vendor?.adaptiveColorTweener?.stopAll();
            } catch {
                // Shared animation cleanup is best-effort.
            }
            try {
                this._vendor?.destroySharedBackgroundSource?.();
            } catch {
                // Shared background cleanup is best-effort.
            }
            try {
                this._vendor?.releaseAllClonedWindowActors?.();
            } catch {
                // Window clone cleanup is best-effort.
            }
        }

        const cleanup = (name, manager) => {
            if (!manager)
                return;
            try {
                manager.cleanup();
            } catch (error) {
                console.error(
                    '[Velora][LiquidGlass] ' +
                    name +
                    ' cleanup failed: ' +
                    error
                );
            }
        };

        for (const manager of [...this._dockManagers])
            cleanup('dockManager', manager);
        this._dockManagers.clear();

        for (const entry of [
            ...this._nativeDashEntries,
        ]) {
            this._releaseNativeDash(entry);
        }
        this._nativeDashEntries = [];

        cleanup('panelMenuManager', this._panelMenuManager);
        cleanup('uiManager', this._uiManager);
        cleanup('quickSettingsManager', this._quickSettingsManager);
        cleanup('notificationManager', this._notificationManager);
        cleanup('osdManager', this._osdManager);
        cleanup('applicationManager', this._applicationManager);
        cleanup('windowListService', this._windowListService);

        this._panelMenuManager = null;
        this._uiManager = null;
        this._quickSettingsManager = null;
        this._notificationManager = null;
        this._osdManager = null;
        this._applicationManager = null;
        this._windowListService = null;

        if (!this._externalGlobalStack) {
            try {
                this._vendor?.setUtilsLogger?.(null);
            } catch {
                // Logger may already be detached.
            }
        }

        try {
            this._logger?.cleanup?.();
        } catch {
            // Logger cleanup is best-effort.
        }

        if (!this._externalGlobalStack)
            this._unloadStylesheet();

        if (globalThis[DEBUG_STATE_KEY])
            delete globalThis[DEBUG_STATE_KEY];

        this._logger = null;
        this._settings = null;
        this._vendor = null;
        this._externalGlobalStack = false;
        this._managerHealth = {};
    }
}

export class LiquidGlassDockRenderer {
    constructor(params) {
        this._integration = params.integration;
        this._target = params.target;
        this._manager = null;
        this._enablePromise = null;
    }

    enable() {
        if (this._manager || this._enablePromise)
            return this._enablePromise;

        if (!this._integration || !this._target)
            return Promise.resolve();

        this._enablePromise = this._integration
            .attachDock(this._target)
            .then(manager => {
                this._manager = manager;
            })
            .finally(() => {
                this._enablePromise = null;
            });

        return this._enablePromise;
    }

    syncSettings() {
        // Upstream DashManager binds directly to the upstream GSettings
        // object, so no Velora-side parameter mirroring is required.
    }

    sync() {
        // Upstream DashManager owns frame-synced geometry/capture updates.
    }

    destroy() {
        if (this._manager)
            this._integration?.detachDock(this._manager);

        this._manager = null;
        this._target = null;
        this._integration = null;
    }
}
