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

import {
    NotificationGlassManager,
} from './notificationGlass.js';
import {
    PopupGlassManager,
} from './popupGlass.js';
import {
    ShellCardGlassManager,
} from './shellCards.js';

const UPSTREAM_EXTENSION_UUID =
    'liquid-glass@thinkingcoding1231.gmail.com';

const GLASS_SCHEMA =
    'org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com';

const VENDOR_CACHE_KEY = '__veloraLiquidGlassVendorModulesV3';
const VENDOR_ROOT_KEY = '__veloraLiquidGlassVendorRootV3';
const VENDOR_PROMISE_KEY = '__veloraLiquidGlassVendorPromiseV3';
const LEGACY_VENDOR_CACHE_KEY = '__veloraLiquidGlassVendorModulesV2';
const LEGACY_VENDOR_ROOT_KEY = '__veloraLiquidGlassVendorRootV1';
const DEBUG_STATE_KEY = '__veloraLiquidGlassDebugV2';
const DASH_RESCAN_IDLE_TICKS = 2;
const DASH_RESCAN_INTERVAL_MS = 2000;

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function parseHexRgb(value) {
    const text = String(value ?? '').trim();

    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
        return [
            Number.parseInt(text[1] + text[1], 16),
            Number.parseInt(text[2] + text[2], 16),
            Number.parseInt(text[3] + text[3], 16),
        ];
    }

    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
        return [
            Number.parseInt(text.slice(1, 3), 16),
            Number.parseInt(text.slice(3, 5), 16),
            Number.parseInt(text.slice(5, 7), 16),
        ];
    }

    return [255, 255, 255];
}

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
        osdManager,
        logger,
        utils,
        background,
        windowClones,
        actorGeometry,
        actorWrites,
    ] = await Promise.all([
        import(moduleUri(root, 'dist/liquidEffect.js')),
        import(moduleUri(root, 'dist/actors/unpickable.js')),
        import(moduleUri(root, 'dist/dockManager.js')),
        import(moduleUri(root, 'dist/osdManager.js')),
        import(moduleUri(root, 'dist/logger.js')),
        import(moduleUri(root, 'dist/utils.js')),
        import(moduleUri(root, 'dist/capture/background.js')),
        import(moduleUri(root, 'dist/capture/windowClones.js')),
        import(moduleUri(root, 'dist/actors/geometry.js')),
        import(moduleUri(root, 'dist/actors/writes.js')),
    ]);

    return {
        root,
        LiquidEffect: liquidEffect.LiquidEffect,
        startGlassRingSampler: liquidEffect.startGlassRingSampler,
        stopGlassRingSampler: liquidEffect.stopGlassRingSampler,
        flushGlassRing: liquidEffect.flushGlassRing,
        UnpickableActor: unpickable.UnpickableActor,
        DashManager: dockManager.DashManager,
        OsdManager: osdManager.OsdManager,
        Logger: logger.Logger,
        setUtilsLogger: utils.setUtilsLogger,
        adaptiveColorTweener: utils.adaptiveColorTweener,
        createBackgroundMirror:
            background.createBackgroundMirror,
        WindowCloneManager:
            windowClones.WindowCloneManager,
        getTransformedRect:
            actorGeometry.getTransformedRect,
        resolveMonitorGeometry:
            actorGeometry.resolveMonitorGeometry,
        setClipIfChanged:
            actorWrites.setClipIfChanged,
        setPositionIfChanged:
            actorWrites.setPositionIfChanged,
        setSizeIfChanged:
            actorWrites.setSizeIfChanged,
        setTranslationIfChanged:
            actorWrites.setTranslationIfChanged,
        destroySharedBackgroundSource:
            utils.destroySharedBackgroundSource,
        releaseAllClonedWindowActors:
            utils.releaseAllClonedWindowActors,
    };
}
function validateVendorApi(vendor) {
    const required = [
        'LiquidEffect',
        'UnpickableActor',
        'WindowCloneManager',
        'DashManager',
        'OsdManager',
        'Logger',
        'setUtilsLogger',
        'createBackgroundMirror',
        'getTransformedRect',
        'resolveMonitorGeometry',
        'setClipIfChanged',
        'setPositionIfChanged',
        'setSizeIfChanged',
        'setTranslationIfChanged',
        'destroySharedBackgroundSource',
        'releaseAllClonedWindowActors',
    ];

    const missing = required.filter(
        key => !vendor?.[key]
    );

    if (missing.length) {
        throw new Error(
            'Vendored Liquid Glass API is incomplete: ' +
            missing.join(', ')
        );
    }
}


export async function loadLiquidGlassVendorModules(veloraSettings) {
    if (globalThis[VENDOR_CACHE_KEY])
        return globalThis[VENDOR_CACHE_KEY];

    if (globalThis[VENDOR_PROMISE_KEY])
        return globalThis[VENDOR_PROMISE_KEY];

    // Hot-swap compatibility: reuse the exact vendor module graph already
    // loaded by the previous V2 runtime. Re-importing the whole vendor tree
    // from a new URI can collide with process-global GObject registrations.
    const legacyCache = globalThis[LEGACY_VENDOR_CACHE_KEY] ?? null;
    if (legacyCache?.root) {
        if (!legacyCache.WindowCloneManager) {
            const windowClones = await import(
                moduleUri(
                    legacyCache.root,
                    'dist/capture/windowClones.js'
                )
            );
            legacyCache.WindowCloneManager =
                windowClones.WindowCloneManager;
        }

        globalThis[VENDOR_CACHE_KEY] = legacyCache;
        globalThis[VENDOR_ROOT_KEY] = legacyCache.root;
        return legacyCache;
    }

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

        this._popupGlassManager = null;
        this._shellCardGlassManager = null;
        this._cardAppearanceSettingId = 0;
        this._cardAppearanceApplyId = 0;
        this._cardCssFile = null;
        this._cardCssCounter = 0;
        this._notificationGlassManager = null;
        this._osdManager = null;
        this._nativeDashEntries = [];
        this._topPanelManager = null;
        this._topPanelSettingIds = [];

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
        validateVendorApi(this._vendor);
        this._settings = createLiquidGlassSettings();
        this._ensureFullGlassOpticsProfile();

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

        // The upstream extension styles panel dropdowns, not the actual
        // GNOME top bar. Attach the same upstream DashManager rendering
        // pipeline to Main.panel so the top panel itself receives glass.
        this._setupTopPanelGlass();

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

        start('popupGlassManager', () => {
            this._popupGlassManager =
                new PopupGlassManager({
                    vendor: this._vendor,
                    settings: this._settings,
                    readAppearance: () =>
                        this._readSharedCardAppearance(),
                });
            this._popupGlassManager.setup();
        });

        start('shellCardGlassManager', () => {
            this._shellCardGlassManager =
                new ShellCardGlassManager({
                    vendor: this._vendor,
                    settings: this._settings,
                    readAppearance: () =>
                        this._readSharedCardAppearance(),
                });
            this._shellCardGlassManager.setup();
        });

        start('nativeNotificationStyler', () => {
            this._setupNativeNotificationStyler();
        });

        this._setupSharedCardAppearanceSync();

        start('osdManager', () => {
            this._osdManager = new this._vendor.OsdManager(
                this._vendor.root,
                this._settings,
                this._logger
            );
            this._osdManager.setup();
        });

        // PopupMenu.prototype is now the single outer-card path for Date
        // Menu, Quick Settings, panel menus and context/app menus. Do not
        // stack the old per-surface UIManager/ApplicationManager pipelines on
        // top of it.

        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => {
                this._scheduleNativeDashRescan();
                this._notificationGlassManager?.updateAppearance();
                this._popupGlassManager?.updateAppearance();
                this._shellCardGlassManager?.updateAppearance();
            }
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

    _ensureFullGlassOpticsProfile() {
        if (!this._settings || !this._veloraSettings)
            return;

        let version = 0;
        try {
            version = this._veloraSettings.get_int(
                'glass-optics-profile-version'
            );
        } catch {
            return;
        }

        if (version >= 1)
            return;

        // The vendored renderer already implements the full optical model.
        // Its conservative defaults intentionally ship chroma/specular/sheen
        // at zero, which reads as ordinary frosted blur. Seed a one-time
        // Velora profile that makes the lens unmistakable while keeping the
        // shader GPU-native and avoiding CPU framebuffer readback.
        const doubles = {
            'glass-max-z': 82.0,
            'glass-displacement-scale': 24.0,
            'glass-edge-smoothing': 0.85,
            'glass-profile-shape-n': 3.8,
            'glass-ior': 1.72,
            'glass-chroma-strength': 2.2,
            'glass-specular-intensity': 0.48,
            'glass-shininess': 56.0,
            'glass-rim-width': 3.4,
            'glass-rim-intensity': 0.78,
            'glass-rim-directional-power': 1.7,
            'glass-rim-power': 2.5,
            'glass-rim-light-color-intensity': 1.15,
            'glass-sheen-intensity': 0.14,
            'glass-light-angle-deg': 105.0,
            'shadow-radius': 30.0,
            'shadow-intensity': 0.16,
            'glass-ao-intensity': 0.42,
            'glass-ao-radius': 2.2,
            'menu-brightness': 1.03,
            'menu-contrast': 1.05,
            'menu-saturation': 1.18,
            'notification-brightness': 1.03,
            'notification-contrast': 1.05,
            'notification-saturation': 1.18,
            'osd-brightness': 1.03,
            'osd-contrast': 1.05,
            'osd-saturation': 1.18,
            'dock-brightness': 1.02,
            'dock-contrast': 1.04,
            'dock-saturation': 1.15,
        };

        for (const [key, value] of Object.entries(doubles)) {
            try {
                this._settings.set_double(key, value);
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] optics key skipped ' +
                    key + ': ' + error
                );
            }
        }

        try {
            this._settings.set_int('blur-method', 1);
            this._settings.set_int('glass-blur-downscale', 2);

            // Refraction should dominate the look; blur and tint support it
            // instead of turning the surface into an opaque frosted card.
            this._veloraSettings.set_int('glass-blur', 12);
            this._veloraSettings.set_int('glass-opacity', 8);
            this._veloraSettings.set_string(
                'glass-tint-color',
                '#ffffff'
            );
            this._veloraSettings.set_int(
                'glass-optics-profile-version',
                1
            );
        } catch (error) {
            console.warn(
                '[Velora][LiquidGlass] optics profile migration incomplete: ' +
                error
            );
        }

        console.log(
            '[Velora][LiquidGlass] full refractive optics profile seeded'
        );
    }

    _readSharedCardAppearance() {
        if (!this._veloraSettings) {
            return {
                opacity: 0,
                tint: '#000000',
                r: 0,
                g: 0,
                b: 0,
                blur: 0,
                fill: 'rgba(0,0,0,0)',
            };
        }

        const opacity = clampNumber(
            this._veloraSettings.get_int(
                'glass-opacity'
            ),
            0,
            100
        ) / 100;

        const tint =
            this._veloraSettings.get_string(
                'glass-tint-color'
            );
        const [r, g, b] = parseHexRgb(tint);

        const blur = clampNumber(
            this._veloraSettings.get_int(
                'glass-blur'
            ),
            0,
            80
        );

        return {
            opacity,
            tint,
            r,
            g,
            b,
            blur,
            fill:
                `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`,
        };
    }

    _applySharedCardAppearance() {
        const state = this._readSharedCardAppearance();

        this._popupGlassManager?.updateAppearance(state);
        this._shellCardGlassManager?.updateAppearance(state);
        this._applyCardAppearanceStylesheet(state);
        this._applyAllNativeNotificationAppearances(state);

        console.log(
            '[Velora][CardAppearance] applied ' +
            'opacity=' +
            Math.round(state.opacity * 100) +
            ' tint=' +
            state.tint +
            ' blur=' +
            state.blur
        );
    }

    _queueSharedCardAppearanceApply() {
        if (this._cardAppearanceApplyId)
            return;

        this._cardAppearanceApplyId =
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                80,
                () => {
                    this._cardAppearanceApplyId = 0;
                    if (this._enabled)
                        this._applySharedCardAppearance();
                    return GLib.SOURCE_REMOVE;
                }
            );
    }

    _setupSharedCardAppearanceSync() {
        if (!this._veloraSettings) {
            this._applySharedCardAppearance();
            return;
        }

        if (!this._cardAppearanceSettingId) {
            this._cardAppearanceSettingId =
                this._veloraSettings.connect(
                    'changed',
                    (_settings, key) => {
                        if ([
                            'glass-opacity',
                            'glass-tint-color',
                            'glass-blur',
                        ].includes(key)) {
                            this._queueSharedCardAppearanceApply();
                        }
                    }
                );
        }

        this._applySharedCardAppearance();
    }

    _cleanupSharedCardAppearanceSync() {
        if (
            this._cardAppearanceSettingId &&
            this._veloraSettings
        ) {
            try {
                this._veloraSettings.disconnect(
                    this._cardAppearanceSettingId
                );
            } catch {
                // Settings may already be tearing down.
            }
        }
        this._cardAppearanceSettingId = 0;

        if (this._cardAppearanceApplyId) {
            try {
                GLib.source_remove(
                    this._cardAppearanceApplyId
                );
            } catch {
                // Debounce source may already be gone.
            }
        }
        this._cardAppearanceApplyId = 0;

        this._unloadCardAppearanceStylesheet();
    }

    _getShellTheme() {
        return St.ThemeContext
            .get_for_stage(global.stage)
            .get_theme();
    }

    _unloadCardAppearanceStylesheet() {
        if (!this._cardCssFile)
            return;

        try {
            this._getShellTheme().unload_stylesheet(
                this._cardCssFile
            );
        } catch (error) {
            console.warn(
                '[Velora][CardAppearance] stylesheet unload failed: ' +
                error
            );
        }

        try {
            this._cardCssFile.delete(null);
        } catch {
            // Cached CSS file may already be gone.
        }

        this._cardCssFile = null;
    }

    _applyCardAppearanceStylesheet(
        _state = this._readSharedCardAppearance()
    ) {
        // The notification's color/blur/refraction now comes from the
        // LiquidEffect material. Keep the real Shell notification content
        // actor, but remove only its native painted card background.
        const css =
            '.velora-native-notification-glass,\n' +
            '.velora-native-notification-glass:hover,\n' +
            '.velora-native-notification-glass:focus {\n' +
            '  background-color: transparent !important;\n' +
            '  background-image: none !important;\n' +
            '  border-color: transparent !important;\n' +
            '  box-shadow: none !important;\n' +
            '}\n';

        const dir = GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            'velora@wonderer.tech',
            'card-appearance',
        ]);
        GLib.mkdir_with_parents(dir, 0o755);

        const path = GLib.build_filenamev([
            dir,
            'cards-' +
            Date.now() +
            '-' +
            this._cardCssCounter++ +
            '.css',
        ]);

        GLib.file_set_contents(path, css);

        this._unloadCardAppearanceStylesheet();

        const file = Gio.File.new_for_path(path);
        this._getShellTheme().load_stylesheet(file);
        this._cardCssFile = file;

        Main.messageTray?._banner?.queue_redraw?.();
    }

    _setupTopPanelGlass() {
        if (this._topPanelManager || !Main.panel)
            return;

        try {
            const manager = new this._vendor.DashManager(
                this._vendor.root,
                Main.panel,
                this._settings,
                this._logger
            );
            manager.setup();

            // Top-panel glass is a Velora surface of its own. Keep it active
            // even if the upstream Dock surface switch is off.
            if (!manager.effect)
                manager._applyEffect?.();

            this._topPanelManager = manager;
            Main.panel.add_style_class_name?.(
                'velora-liquid-top-panel'
            );
            this._applyTopPanelOverrides();

            for (const key of [
                'dock-margin-bottom',
                'dock-glass-expand',
                'dock-corner-radius',
                'enable-dock-glass',
            ]) {
                this._topPanelSettingIds.push(
                    this._settings.connect(
                        'changed::' + key,
                        () => {
                            GLib.idle_add(
                                GLib.PRIORITY_DEFAULT_IDLE,
                                () => {
                                    if (
                                        this._enabled &&
                                        this._topPanelManager
                                    ) {
                                        if (
                                            !this._topPanelManager.effect
                                        ) {
                                            this._topPanelManager
                                                ._applyEffect?.();
                                        }
                                        this._applyTopPanelOverrides();
                                    }
                                    return GLib.SOURCE_REMOVE;
                                }
                            );
                        }
                    )
                );
            }

            console.log(
                '[Velora][LiquidGlass] topPanel active'
            );
        } catch (error) {
            console.error(
                '[Velora][LiquidGlass] topPanel setup failed: ' +
                error +
                '\n' +
                (error?.stack ?? '')
            );
        }
    }

    _applyTopPanelOverrides() {
        const manager = this._topPanelManager;
        if (!manager)
            return;

        // DashManager normally adds a dock edge margin. A system top bar must
        // stay pinned to y=0, so remove that inline margin immediately.
        manager._marginValue = 0;
        manager._glassExpand = 0;
        manager._currentMarginStyle = '';

        if (
            manager.targetActor &&
            manager._originalStyle !== undefined
        ) {
            manager.targetActor.set_style(
                manager._originalStyle
            );
        }

        // A full-width top bar should meet the screen edges cleanly.
        manager.effect?.setCornerRadius(0);
    }

    _cleanupTopPanelGlass() {
        for (const id of this._topPanelSettingIds) {
            try {
                this._settings?.disconnect(id);
            } catch {
                // Settings may already be tearing down.
            }
        }
        this._topPanelSettingIds = [];

        if (this._topPanelManager) {
            try {
                this._topPanelManager.cleanup();
            } catch (error) {
                console.error(
                    '[Velora][LiquidGlass] topPanel cleanup failed: ' +
                    error
                );
            }
        }
        try {
            Main.panel?.remove_style_class_name?.(
                'velora-liquid-top-panel'
            );
        } catch {
            // Panel may already be tearing down.
        }
        this._topPanelManager = null;
    }

    _setupNativeNotificationStyler() {
        if (this._notificationGlassManager)
            return;

        this._notificationGlassManager =
            new NotificationGlassManager({
                vendor: this._vendor,
                settings: this._settings,
                readAppearance: () =>
                    this._readSharedCardAppearance(),
            });

        this._notificationGlassManager.setup();

        console.log(
            '[Velora][LiquidGlass] nativeNotificationStyler active'
        );
    }

    _applyAllNativeNotificationAppearances(
        state = this._readSharedCardAppearance()
    ) {
        this._notificationGlassManager?.updateAppearance(state);
    }

    _cleanupNativeNotificationStyler() {
        try {
            this._notificationGlassManager?.cleanup();
        } catch (error) {
            console.error(
                '[Velora][LiquidGlass] notification material cleanup failed: ' +
                error
            );
        }

        this._notificationGlassManager = null;
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
                nativeDashManagers:
                    this._nativeDashEntries.length,
                topPanel: Boolean(this._topPanelManager),
                popupGlassManager: Boolean(
                    this._popupGlassManager
                ),
                shellCardGlassManager: Boolean(
                    this._shellCardGlassManager
                ),
                glassOpacity:
                    this._veloraSettings?.get_int?.(
                        'glass-opacity'
                    ) ?? null,
                glassTintColor:
                    this._veloraSettings?.get_string?.(
                        'glass-tint-color'
                    ) ?? null,
                glassBlur:
                    this._veloraSettings?.get_int?.(
                        'glass-blur'
                    ) ?? null,
                nativeNotificationStyler: Boolean(
                    this._notificationGlassManager
                ),
                osdManager: Boolean(this._osdManager),
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

        this._cleanupTopPanelGlass();

        for (const entry of [
            ...this._nativeDashEntries,
        ]) {
            this._releaseNativeDash(entry);
        }
        this._nativeDashEntries = [];

        this._cleanupSharedCardAppearanceSync();

        cleanup('popupGlassManager', this._popupGlassManager);
        this._popupGlassManager = null;

        cleanup(
            'shellCardGlassManager',
            this._shellCardGlassManager
        );
        this._shellCardGlassManager = null;

        this._cleanupNativeNotificationStyler();
        cleanup('osdManager', this._osdManager);

        this._notificationGlassManager = null;
        this._osdManager = null;

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

