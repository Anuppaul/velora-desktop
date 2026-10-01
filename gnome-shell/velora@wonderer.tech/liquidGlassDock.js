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
import {
    AppGridBackdropManager,
} from './appGridBackdrop.js';
import {
    OverviewCloseGlassManager,
} from './overviewCloseGlass.js';
import {
    SharedAdaptiveTextManager,
} from './sharedAdaptiveText.js';
import {
    OrbGlassManager,
} from './orbGlass.js';
import {
    VELORA_GLASS_ADAPTERS,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

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
const DASH_TO_DOCK_SCHEMA =
    'org.gnome.shell.extensions.dash-to-dock';
const UBUNTU_DOCK_UUID =
    'ubuntu-dock@ubuntu.com';
const DOCK_PANEL_MODE_CLASS =
    'velora-dock-panel-mode';
const DOCK_PANEL_BACKGROUND_CLASS =
    'velora-ubuntu-dock-panel-background';
const DOCK_GLASS_BACKGROUND_CLASS =
    'velora-ubuntu-dock-glass-background';
const DOCK_PANEL_BLUR_EFFECT =
    'velora-ubuntu-dock-panel-blur';
const DOCK_PANEL_BLUR_RADIUS = 10;
const DOCK_PANEL_PREMIUM_STYLE =
    'background-color: rgba(255,255,255,0.085); ' +
    'background-image: none; ' +
    'border-color: rgba(255,255,255,0.13); ' +
    'border-radius: 0px; ' +
    'box-shadow: none;';
const DOCK_MODE_SETTLE_FRAMES = 2;
const DOCK_HANDOFF_POLL_MS = 24;
const DOCK_HANDOFF_MAX_MS = 5000;

const DESKTOP_INTERFACE_SCHEMA =
    'org.gnome.desktop.interface';

const SYSTEM_ACCENT_COLORS = Object.freeze({
    blue: '#3584e4',
    teal: '#2190a4',
    green: '#3a944a',
    yellow: '#c88800',
    orange: '#ed5b00',
    red: '#e62d42',
    pink: '#d56199',
    purple: '#9141ac',
    slate: '#6f8396',
});

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
        quickSettingsManager,
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
        import(moduleUri(root, 'dist/quickSettingsManager.js')),
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
        QuickSettingsManager:
            quickSettingsManager.QuickSettingsManager,
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
        'QuickSettingsManager',
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
    const ensureQuickSettingsManager = async vendor => {
        if (vendor?.root && !vendor.QuickSettingsManager) {
            const quickSettingsManager = await import(
                moduleUri(
                    vendor.root,
                    'dist/quickSettingsManager.js'
                )
            );
            vendor.QuickSettingsManager =
                quickSettingsManager.QuickSettingsManager;
        }
        return vendor;
    };

    if (globalThis[VENDOR_CACHE_KEY]) {
        return ensureQuickSettingsManager(
            globalThis[VENDOR_CACHE_KEY]
        );
    }

    if (globalThis[VENDOR_PROMISE_KEY]) {
        return ensureQuickSettingsManager(
            await globalThis[VENDOR_PROMISE_KEY]
        );
    }

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
        await ensureQuickSettingsManager(legacyCache);
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
        .then(modules => ensureQuickSettingsManager(modules))
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
        this._appGridBackdropManager = null;
        this._overviewCloseGlassManager = null;
        this._sharedAdaptiveTextManager = null;
        this._orbGlassManager = null;
        this._cardAppearanceSettingId = 0;
        this._cardAppearanceApplyId = 0;
        this._desktopInterfaceSettings = null;
        this._desktopAccentChangedId = 0;
        this._cardCssFile = null;
        this._cardCssSignature = '';
        this._cardCssCounter = 0;
        this._notificationGlassManager = null;
        this._osdManager = null;
        this._nativeDashEntries = [];
        this._topPanelManager = null;
        this._topPanelSettingIds = [];
        this._dashToDockSettings = null;
        this._dashToDockPanelModeId = 0;
        this._dockGlassBeforePanelMode = null;
        this._ubuntuDockModule = null;
        this._ubuntuDockManager = null;
        this._dockModeGeneration = 0;
        this._dockModeTransitionStageId = 0;
        this._dockModeHandoffId = 0;
        this._dockModeTransitionTarget = null;
        this._dockHandoffActive = false;

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

        // Orb is a Velora-owned surface. The upstream Liquid Glass extension
        // never knows about velora-desktop-layer, so it must be attached even
        // when we reuse an already-active upstream renderer stack.
        try {
            this._orbGlassManager =
                new OrbGlassManager({
                    vendor: this._vendor,
                    settings: this._settings,
                    readAppearance: () =>
                        this._readSharedCardAppearance(),
                });
            this._orbGlassManager.setup();
            this._managerHealth.orbGlassManager = true;
            console.log(
                '[Velora][LiquidGlass] orbGlassManager active'
            );
        } catch (error) {
            this._orbGlassManager = null;
            this._managerHealth.orbGlassManager = false;
            console.error(
                '[Velora][LiquidGlass] orbGlassManager setup failed: ' +
                error +
                '\n' +
                (error?.stack ?? '')
            );
        }

        // Keep the Velora-owned Orb and top-panel material live-bound to the
        // same shared appearance controls in both standalone and upstream-stack
        // modes.
        this._setupSharedCardAppearanceSync();

        // Dash-to-Dock's extend-height setting is its panel-mode source of
        // truth. Track it independently from the glass renderer so panel mode
        // can intentionally use a premium non-glass surface.
        await this._setupUbuntuDockBridge();
        this._setupDashToDockModeWatch();

        if (this._dockIsPanelMode())
            this._syncDockGlassPreferenceForPanelMode(true);

        this._findNativeDashToDock();

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

        start('appGridBackdropManager', () => {
            this._appGridBackdropManager =
                new AppGridBackdropManager();
            this._appGridBackdropManager.setup();
        });

        start('overviewCloseGlassManager', () => {
            this._overviewCloseGlassManager =
                new OverviewCloseGlassManager({
                    vendor: this._vendor,
                    settings: this._settings,
                    readAppearance: () =>
                        this._readSharedCardAppearance(),
                });
            this._overviewCloseGlassManager.setup();
        });

        start('sharedAdaptiveTextManager', () => {
            this._sharedAdaptiveTextManager =
                new SharedAdaptiveTextManager({
                    vendor: this._vendor,
                });
            this._sharedAdaptiveTextManager.setup();
        });

        start('nativeNotificationStyler', () => {
            this._setupNativeNotificationStyler();
        });

        start('osdManager', () => {
            this._osdManager = new this._vendor.OsdManager(
                this._vendor.root,
                this._settings,
                this._logger,
                VELORA_GLASS_ROLES.osdCard
            );
            this._osdManager.setup();
        });

        // PopupMenu.prototype is the single outer-card path for Date Menu,
        // Quick Settings, panel menus and context/app menus. Date + Quick
        // nested cards also share PopupGlass' one clone-of-parent pipeline;
        // do not stack the legacy QuickSettingsManager renderer on top.

        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => {
                this._scheduleNativeDashRescan();
                this._notificationGlassManager?.updateAppearance();
                this._popupGlassManager?.updateAppearance();
                this._shellCardGlassManager?.updateAppearance();
                this._overviewCloseGlassManager?.updateAppearance();
                this._orbGlassManager?.updateAppearance();
                this._sharedAdaptiveTextManager?.refresh();
            }
        );

        if (this._nativeDashEntries.length === 0) {
            this._dashTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                2000,
                () => {
                    try {
                        if (!this._findNativeDashToDock())
                            this._scheduleNativeDashRescan();
                    } finally {
                        this._dashTimeoutId = 0;
                    }
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

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

        if (version < 1) {
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
                version = 1;
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

        if (version < 2) {
            // Surface profile v2: align Top Panel and Ubuntu Dock with the
            // refractive system material without changing margin, placement,
            // glass expansion, icon geometry or dock behavior.
            //
            // Respect explicit user overrides: only seed keys that have never
            // been written in this settings namespace.
            const setDoubleIfUnset = (key, value) => {
                try {
                    if (this._settings.get_user_value(key) === null)
                        this._settings.set_double(key, value);
                } catch (error) {
                    console.warn(
                        '[Velora][LiquidGlass] dock profile key skipped ' +
                        key + ': ' + error
                    );
                }
            };

            const setIntIfUnset = (key, value) => {
                try {
                    if (this._settings.get_user_value(key) === null)
                        this._settings.set_int(key, value);
                } catch (error) {
                    console.warn(
                        '[Velora][LiquidGlass] dock profile key skipped ' +
                        key + ': ' + error
                    );
                }
            };

            const setStringIfUnset = (key, value) => {
                try {
                    if (this._settings.get_user_value(key) === null)
                        this._settings.set_string(key, value);
                } catch (error) {
                    console.warn(
                        '[Velora][LiquidGlass] dock profile key skipped ' +
                        key + ': ' + error
                    );
                }
            };

            setStringIfUnset('dock-tint-color', '#ffffff');
            setDoubleIfUnset('dock-tint-strength', 0.06);
            setIntIfUnset('dock-blur-radius', 8);
            setDoubleIfUnset('dock-corner-radius', 28.0);

            try {
                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    2
                );
                version = 2;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] dock optics profile migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] panel/dock optical profile v2 seeded'
            );
        }

        if (version < 3) {
            // Material profile v3: reduce bulk tint/blur so refraction remains
            // readable, then add a separate low-opacity neutral white veil.
            // The veil is painted by each surface above LiquidEffect and below
            // native content; it should read as glass body, not colored fog.
            try {
                this._veloraSettings.set_int('glass-opacity', 3);
                this._veloraSettings.set_int('glass-blur', 9);
                this._veloraSettings.set_int('glass-filter-opacity', 5);
                this._veloraSettings.set_string(
                    'glass-tint-color',
                    '#ffffff'
                );

                // Top panel / Ubuntu Dock share DockManager material settings.
                // Keep them even clearer than cards so icons stay crisp.
                this._settings.set_double('dock-tint-strength', 0.03);
                this._settings.set_int('dock-blur-radius', 6);

                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    3
                );
                version = 3;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] clear-glass profile migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] clear-glass material profile v3 seeded'
            );
        }

        if (version < 4) {
            // v4 micro-tune: less bulk blur/tint globally, with Date Menu
            // calibrated independently. Preserve manual edits made after v3 by
            // only replacing values that still equal our previous seed.
            try {
                if (this._veloraSettings.get_int('glass-opacity') === 3)
                    this._veloraSettings.set_int('glass-opacity', 2);
                if (this._veloraSettings.get_int('glass-blur') === 9)
                    this._veloraSettings.set_int('glass-blur', 7);
                if (this._veloraSettings.get_int('glass-filter-opacity') === 5)
                    this._veloraSettings.set_int('glass-filter-opacity', 4);

                if (this._settings.get_double('dock-tint-strength') === 0.03)
                    this._settings.set_double('dock-tint-strength', 0.02);
                if (this._settings.get_int('dock-blur-radius') === 6)
                    this._settings.set_int('dock-blur-radius', 4);

                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    4
                );
                version = 4;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] micro-tune profile migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] Date Menu micro-tune/performance profile v4 seeded'
            );
        }

        if (version < 5) {
            // v5 moves optical uniforms to renderer GSettings. Migrate only
            // untouched legacy seed values; manual preference edits survive.
            // Replacement values exactly match the premium role that used to
            // be written directly into each effect, so the accepted baseline
            // stays visually unchanged.
            const migrateDoubleIfSeeded = (
                key,
                previousValue,
                premiumValue
            ) => {
                try {
                    const current = this._settings.get_double(key);
                    if (Math.abs(current - previousValue) < 0.0001)
                        this._settings.set_double(key, premiumValue);
                } catch (error) {
                    console.warn(
                        '[Velora][LiquidGlass] optics v5 key skipped ' +
                        key + ': ' + error
                    );
                }
            };

            migrateDoubleIfSeeded('glass-max-z', 82.0, 90.0);
            migrateDoubleIfSeeded('glass-displacement-scale', 24.0, 31.0);
            migrateDoubleIfSeeded('glass-edge-smoothing', 0.85, 0.82);
            migrateDoubleIfSeeded('glass-profile-shape-n', 3.8, 3.9);
            migrateDoubleIfSeeded('glass-ior', 1.72, 1.68);
            migrateDoubleIfSeeded('glass-chroma-strength', 2.2, 1.4);
            migrateDoubleIfSeeded('glass-specular-intensity', 0.48, 0.55);
            migrateDoubleIfSeeded('glass-shininess', 56.0, 62.0);
            migrateDoubleIfSeeded('glass-rim-width', 3.4, 2.8);
            migrateDoubleIfSeeded('glass-rim-intensity', 0.78, 0.90);
            migrateDoubleIfSeeded('glass-rim-directional-power', 1.7, 1.55);
            migrateDoubleIfSeeded('glass-rim-power', 2.5, 2.3);
            migrateDoubleIfSeeded('glass-rim-light-color-intensity', 1.15, 1.18);
            migrateDoubleIfSeeded('glass-sheen-intensity', 0.14, 0.10);
            migrateDoubleIfSeeded('glass-light-angle-deg', 105.0, 108.0);
            migrateDoubleIfSeeded('shadow-radius', 30.0, 0.0);
            migrateDoubleIfSeeded('shadow-intensity', 0.16, 0.0);
            migrateDoubleIfSeeded('glass-ao-intensity', 0.42, 0.34);
            migrateDoubleIfSeeded('glass-ao-radius', 2.2, 1.3);

            try {
                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    5
                );
                version = 5;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] optics v5 migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] live optics controls profile v5 seeded'
            );
        }

        if (version < 6) {
            // v6 increases perceived glass thickness without increasing blur,
            // tint, IOR or renderer count. glass-max-z controls physical dome
            // depth; glass-displacement-scale controls optical thickness /
            // refraction magnitude. Only exact v5 seed values are migrated so
            // manual advanced optics edits survive.
            const migrateThicknessIfSeeded = (
                key,
                previousValue,
                thickerValue
            ) => {
                try {
                    const current =
                        this._settings.get_double(key);
                    if (
                        Math.abs(
                            current - previousValue
                        ) < 0.0001
                    ) {
                        this._settings.set_double(
                            key,
                            thickerValue
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[Velora][LiquidGlass] thickness v6 key skipped ' +
                        key + ': ' + error
                    );
                }
            };

            migrateThicknessIfSeeded(
                'glass-max-z',
                90.0,
                104.0
            );
            migrateThicknessIfSeeded(
                'glass-displacement-scale',
                31.0,
                36.0
            );

            try {
                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    6
                );
                version = 6;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] thickness v6 migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] thicker shared glass profile v6 seeded'
            );
        }

        if (version < 7) {
            // v7 pushes the accepted thicker profile one step further while
            // leaving blur, tint, IOR, rim and shader topology unchanged.
            // Only exact v6 seed values migrate; manual optics overrides stay.
            const migrateThicknessV7IfSeeded = (
                key,
                previousValue,
                thickerValue
            ) => {
                try {
                    const current =
                        this._settings.get_double(key);
                    if (
                        Math.abs(
                            current - previousValue
                        ) < 0.0001
                    ) {
                        this._settings.set_double(
                            key,
                            thickerValue
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[Velora][LiquidGlass] thickness v7 key skipped ' +
                        key + ': ' + error
                    );
                }
            };

            migrateThicknessV7IfSeeded(
                'glass-max-z',
                104.0,
                118.0
            );
            migrateThicknessV7IfSeeded(
                'glass-displacement-scale',
                36.0,
                42.0
            );

            try {
                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    7
                );
                version = 7;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] thickness v7 migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] extra-thick shared glass profile v7 seeded'
            );
        }

        if (version < 8) {
            // v8 performance profile: geometry/input remain on the native
            // compositor frame clock, while expensive cloned-scene refreshes
            // default to 24 FPS. Respect an explicit user FPS override.
            try {
                if (
                    this._veloraSettings.get_user_value(
                        'glass-live-scene-fps'
                    ) === null
                ) {
                    this._veloraSettings.set_int(
                        'glass-live-scene-fps',
                        24
                    );
                }

                this._veloraSettings.set_int(
                    'glass-optics-profile-version',
                    8
                );
                version = 8;
            } catch (error) {
                console.warn(
                    '[Velora][LiquidGlass] performance v8 migration incomplete: ' +
                    error
                );
            }

            console.log(
                '[Velora][LiquidGlass] performance profile v8 seeded'
            );
        }
    }

    _readSharedCardAppearance() {
        if (!this._veloraSettings) {
            return {
                opacity: 0,
                tint: '#ffffff',
                r: 255,
                g: 255,
                b: 255,
                blur: 0,
                filterOpacity: 0.05,
                fill: 'rgba(255,255,255,0)',
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

        const filterOpacity = clampNumber(
            this._veloraSettings.get_int(
                'glass-filter-opacity'
            ),
            0,
            20
        ) / 100;

        const sceneFps = clampNumber(
            this._veloraSettings.get_int(
                'glass-live-scene-fps'
            ),
            15,
            60
        );

        const dateMenu = {
            opacity: clampNumber(
                this._veloraSettings.get_int(
                    'date-menu-glass-opacity'
                ),
                0,
                20
            ) / 100,
            blur: clampNumber(
                this._veloraSettings.get_int(
                    'date-menu-glass-blur'
                ),
                0,
                20
            ),
            filterOpacity: clampNumber(
                this._veloraSettings.get_int(
                    'date-menu-glass-filter-opacity'
                ),
                0,
                20
            ) / 100,
        };

        return {
            opacity,
            tint,
            r,
            g,
            b,
            blur,
            filterOpacity,
            sceneFps,
            dateMenu,
            fill:
                `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`,
        };
    }

    _applySharedDashMaterial(manager, surface = 'dock') {
        const effect = manager?.effect;
        if (!effect)
            return;

        const isTopPanel = surface === 'topPanel';
        const role = isTopPanel
            ? VELORA_GLASS_ROLES.topPanel
            : VELORA_GLASS_ROLES.dock;
        const adapter = isTopPanel
            ? VELORA_GLASS_ADAPTERS.topPanel
            : VELORA_GLASS_ADAPTERS.dock;
        const state = this._readSharedCardAppearance();

        let brightness = null;
        let contrast = null;
        let saturation = null;
        let cornerRadius = isTopPanel
            ? (adapter.cornerRadius ?? 0)
            : null;

        try {
            brightness =
                this._settings.get_double('dock-brightness');
            contrast =
                this._settings.get_double('dock-contrast');
            saturation =
                this._settings.get_double('dock-saturation');

            if (!isTopPanel) {
                cornerRadius =
                    this._settings.get_double(
                        'dock-corner-radius'
                    );
            }
        } catch {
            // Keep renderer defaults if an optional dock key is unavailable.
        }

        applyVeloraGlassRole(
            effect,
            role,
            {
                tintColor: [
                    (state.r ?? 255) / 255,
                    (state.g ?? 255) / 255,
                    (state.b ?? 255) / 255,
                ],
                tintStrength:
                    adapter.inheritGlobalTint
                        ? (state.opacity ?? role.tintStrength)
                        : role.tintStrength,
                baseBlur:
                    adapter.inheritGlobalBlur
                        ? (state.blur ?? 7)
                        : 7,
                cornerRadius,
                brightness,
                contrast,
                saturation,
                multiRegion: adapter.multiRegion,
            }
        );

        // DashManager owns geometry/capture semantics for both surfaces.
        // Shared material application must never change that contract.
        effect.setIsDock?.(true);
    }

    _applySharedCardAppearance() {
        const state = this._readSharedCardAppearance();

        this._popupGlassManager?.updateAppearance(state);
        this._shellCardGlassManager?.updateAppearance(state);
        this._appGridBackdropManager?.updateAppearance(state);
        this._overviewCloseGlassManager?.updateAppearance(state);
        this._orbGlassManager?.updateAppearance(state);
        this._sharedAdaptiveTextManager?.refresh();
        this._applyCardAppearanceStylesheet(state);
        this._applyAllNativeNotificationAppearances(state);
        this._osdManager?.updateMaterialAppearance?.(state);
        this._applySharedDashMaterial(
            this._topPanelManager,
            'topPanel'
        );
        for (const entry of this._nativeDashEntries) {
            if (entry.manager)
                this._applySharedDashMaterial(entry.manager, 'dock');
        }

        console.log(
            '[Velora][CardAppearance] applied ' +
            'opacity=' +
            Math.round(state.opacity * 100) +
            ' tint=' +
            state.tint +
            ' blur=' +
            state.blur +
            ' filter=' +
            Math.round((state.filterOpacity ?? 0) * 100) +
            ' sceneFps=' +
            (state.sceneFps ?? 30) +
            ' systemAccent=' +
            this._readSystemAccentColor().name + '/' +
            this._readSystemAccentColor().color +
            ' dateMenu=' +
            Math.round((state.dateMenu?.opacity ?? 0) * 100) + '/' +
            (state.dateMenu?.blur ?? 0) + '/' +
            Math.round((state.dateMenu?.filterOpacity ?? 0) * 100)
        );
    }

    _readSystemAccentColor() {
        let name = 'blue';

        try {
            name =
                this._desktopInterfaceSettings
                    ?.get_string?.('accent-color') ??
                name;
        } catch {
            // GNOME default blue is the safe fallback.
        }

        return {
            name,
            color:
                SYSTEM_ACCENT_COLORS[name] ??
                SYSTEM_ACCENT_COLORS.blue,
        };
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
        if (!this._desktopInterfaceSettings) {
            try {
                this._desktopInterfaceSettings =
                    new Gio.Settings({
                        schema_id:
                            DESKTOP_INTERFACE_SCHEMA,
                    });

                this._desktopAccentChangedId =
                    this._desktopInterfaceSettings.connect(
                        'changed::accent-color',
                        () => {
                            this._queueSharedCardAppearanceApply();
                        }
                    );
            } catch (error) {
                this._desktopInterfaceSettings = null;
                this._desktopAccentChangedId = 0;
                console.warn(
                    '[Velora][Appearance] desktop accent sync unavailable: ' +
                    error
                );
            }
        }

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
                            'glass-filter-opacity',
                            'date-menu-glass-opacity',
                            'date-menu-glass-blur',
                            'date-menu-glass-filter-opacity',
                            'glass-live-scene-fps',
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

        if (
            this._desktopInterfaceSettings &&
            this._desktopAccentChangedId
        ) {
            try {
                this._desktopInterfaceSettings.disconnect(
                    this._desktopAccentChangedId
                );
            } catch {}
        }
        this._desktopAccentChangedId = 0;
        this._desktopInterfaceSettings = null;

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
        this._cardCssSignature = '';
    }

    _applyCardAppearanceStylesheet(
        state = this._readSharedCardAppearance()
    ) {
        // Notifications and popup menus have dedicated filter actors. Generic
        // Shell cards use their native card actor itself as the neutral white
        // veil, which is paint-only and therefore does not add another blur
        // pass or disturb layout.
        const filterOpacity = Math.max(
            0,
            Math.min(0.20, state.filterOpacity ?? 0.05)
        );
        const barFilterOpacity = Math.min(
            0.08,
            filterOpacity * 0.6
        );

        const systemAccent =
            this._readSystemAccentColor();
        const accentColor = systemAccent.color;
        const css =
            '/* Velora semantic accent: use the actual desktop Appearance setting, not a stale Shell/Yaru token. */\n' +
            '.velora-liquid-popup-content.datemenu-popover .calendar-day.calendar-today,\n' +
            '.velora-liquid-popup-content.datemenu-popover .velora-date-card-text-light .calendar-day.calendar-today,\n' +
            '.velora-liquid-popup-content.datemenu-popover .velora-date-card-text-dark .calendar-day.calendar-today {\n' +
            '  color: ' + accentColor + ' !important;\n' +
            '}\n' +
            '.velora-liquid-popup-content.quick-settings .velora-quick-active StLabel,\n' +
            '.velora-liquid-popup-content.quick-settings .velora-quick-active .quick-toggle-title,\n' +
            '.velora-liquid-popup-content.quick-settings .velora-quick-active .quick-toggle-subtitle,\n' +
            '.velora-liquid-quick-menu-root .velora-quick-active StLabel,\n' +
            '.velora-liquid-quick-menu-root .velora-quick-active .quick-toggle-title,\n' +
            '.velora-liquid-quick-menu-root .velora-quick-active .quick-toggle-subtitle {\n' +
            '  color: ' + accentColor + ' !important;\n' +
            '}\n' +
            '#overviewGroup .workspace-thumbnail-indicator {\n' +
            '  border-color: ' + accentColor + ' !important;\n' +
            '}\n' +
            '.velora-liquid-popup-content.datemenu-popover .datemenu-today-button:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .calendar:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .events-button:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .world-clocks-button:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .weather-button:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .message:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .message-list-clear-button:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .calendar-month-label:focus,\n' +
            '.velora-liquid-popup-content.datemenu-popover .calendar-month-header .pager-button:focus {\n' +
            '  border-color: ' + accentColor + ' !important;\n' +
            '}\n' +
            '.velora-liquid-popup-content.quick-settings .quick-slider .slider {\n' +
            '  -barlevel-active-background-color: ' + accentColor + ';\n' +
            '}\n' +
            '.modal-dialog.velora-liquid-shell-card .modal-dialog-button:default {\n' +
            '  background-color: ' + accentColor + ' !important;\n' +
            '  color: #ffffff !important;\n' +
            '}\n' +            '.velora-running-dot {\n' +
            '  background-color: ' + accentColor + ' !important;\n' +
            '}\n' +
            '.velora-native-notification-glass,\n' +
            '.velora-native-notification-glass:hover,\n' +
            '.velora-native-notification-glass:focus {\n' +
            '  background-color: transparent !important;\n' +
            '  background-image: none !important;\n' +
            '  border-color: transparent !important;\n' +
            '  box-shadow: none !important;\n' +
            '}\n' +
            '.velora-liquid-shell-card {\n' +
            '  background-color: rgba(255,255,255,' +
            filterOpacity.toFixed(3) +
            ') !important;\n' +
            '  background-image: none !important;\n' +
            '  box-shadow: none !important;\n' +
            '}\n' +
            '#panel.velora-liquid-top-panel {\n' +
            '  background-color: rgba(255,255,255,' +
            barFilterOpacity.toFixed(3) +
            ') !important;\n' +
            '  background-image: none !important;\n' +
            '  box-shadow: none !important;\n' +
            '}\n' +
            '#dashtodockDashContainer.liquid-glass-transparent,\n' +
            '.liquid-glass-transparent #dashtodockContainer,\n' +
            '.liquid-glass-transparent .dashtodock-box,\n' +
            '.liquid-glass-transparent .dash-background {\n' +
            '  background-color: rgba(255,255,255,' +
            barFilterOpacity.toFixed(3) +
            ') !important;\n' +
            '  background-image: none !important;\n' +
            '  box-shadow: none !important;\n' +
            '}\n';

        if (
            this._cardCssFile &&
            this._cardCssSignature === css
        ) {
            return;
        }

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
        this._cardCssSignature = css;

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
        // Material optics come from the same shared premium role as the
        // other Velora glass surfaces; geometry remains owned by DashManager.
        manager.setMaterialOverride?.(
            () => this._applySharedDashMaterial(
                manager,
                'topPanel'
            )
        );
        manager.effect?.setCornerRadius(0);
        this._applySharedDashMaterial(manager, 'topPanel');

        // DashManager also marks its parent transparent for dock themes. For
        // Main.panel that parent is a broad Shell container, not part of the
        // panel material. Remove the class there so the glass scope stays local
        // to the top bar and cannot affect unrelated Shell children.
        try {
            if (
                manager._dockParent &&
                manager._dockParent !== Main.panel
            ) {
                manager._dockParent.remove_style_class_name?.(
                    'liquid-glass-transparent'
                );
            }
        } catch {
            // Parent may already be rebuilding.
        }
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

    _setupDashToDockModeWatch() {
        if (this._dashToDockSettings)
            return;

        try {
            const source =
                Gio.SettingsSchemaSource.get_default();
            const schema =
                source?.lookup?.(
                    DASH_TO_DOCK_SCHEMA,
                    true
                ) ?? null;

            if (!schema)
                return;

            this._dashToDockSettings =
                new Gio.Settings({
                    settings_schema: schema,
                });

            this._dashToDockPanelModeId =
                this._dashToDockSettings.connect(
                    'changed::extend-height',
                    () => {
                        if (!this._enabled)
                            return;

                        this._beginDockModeTransition(
                            this._dockIsPanelMode()
                        );
                    }
                );
        } catch (error) {
            this._dashToDockSettings = null;
            this._dashToDockPanelModeId = 0;
            console.warn(
                '[Velora][Dock] Dash-to-Dock panel-mode watch unavailable: ' +
                error
            );
        }
    }

    _cleanupDashToDockModeWatch() {
        // Restore the exact dock-glass preference that existed before panel
        // mode temporarily suppressed the renderer.
        this._syncDockGlassPreferenceForPanelMode(false);

        if (
            this._dashToDockSettings &&
            this._dashToDockPanelModeId
        ) {
            try {
                this._dashToDockSettings.disconnect(
                    this._dashToDockPanelModeId
                );
            } catch {}
        }

        this._dashToDockPanelModeId = 0;
        this._dashToDockSettings = null;
    }

    _dockIsPanelMode() {
        try {
            return Boolean(
                this._dashToDockSettings?.get_boolean?.(
                    'extend-height'
                )
            );
        } catch {
            return false;
        }
    }

    _syncDockGlassPreferenceForPanelMode(panelMode) {
        // Our vendored DockManager is detached directly, so changing the
        // global Liquid Glass preference would only create an unnecessary
        // remove/recreate cycle. This preference bridge is needed solely when
        // an already-active upstream Liquid Glass stack owns the dock.
        if (!this._settings || !this._externalGlobalStack)
            return;

        if (panelMode) {
            if (this._dockGlassBeforePanelMode === null) {
                try {
                    this._dockGlassBeforePanelMode =
                        this._settings.get_boolean(
                            'enable-dock-glass'
                        );
                } catch {
                    this._dockGlassBeforePanelMode = false;
                }
            }

            try {
                if (
                    this._settings.get_boolean(
                        'enable-dock-glass'
                    )
                ) {
                    this._settings.set_boolean(
                        'enable-dock-glass',
                        false
                    );
                }
            } catch {}

            return;
        }

        if (this._dockGlassBeforePanelMode === null)
            return;

        const restore =
            this._dockGlassBeforePanelMode;
        this._dockGlassBeforePanelMode = null;

        try {
            if (
                this._settings.get_boolean(
                    'enable-dock-glass'
                ) !== restore
            ) {
                this._settings.set_boolean(
                    'enable-dock-glass',
                    restore
                );
            }
        } catch {}
    }

    async _setupUbuntuDockBridge() {
        this._ubuntuDockModule = null;
        this._ubuntuDockManager = null;

        try {
            const extension =
                Main.extensionManager.lookup(
                    UBUNTU_DOCK_UUID
                );

            if (
                !extension ||
                extension.state !== ExtensionState.ACTIVE
            ) {
                return;
            }

            const stateManager =
                extension.stateObj?.dockManager ?? null;
            if (stateManager) {
                this._ubuntuDockManager = stateManager;
                return;
            }

            const root =
                extension.path ??
                extension.dir?.get_path?.() ??
                null;
            if (!root)
                return;

            const moduleFile =
                Gio.File.new_for_path(
                    GLib.build_filenamev([
                        root,
                        'extension.js',
                    ])
                );

            if (!moduleFile.query_exists(null))
                return;

            const module =
                await import(moduleFile.get_uri());

            this._ubuntuDockModule = module;
            this._ubuntuDockManager =
                module?.dockManager ?? null;
        } catch (error) {
            this._ubuntuDockModule = null;
            this._ubuntuDockManager = null;
            console.warn(
                '[Velora][Dock] Ubuntu Dock bridge unavailable: ' +
                error
            );
        }
    }

    _refreshUbuntuDockManager() {
        try {
            const extension =
                Main.extensionManager.lookup(
                    UBUNTU_DOCK_UUID
                );

            this._ubuntuDockManager =
                this._ubuntuDockModule?.dockManager ??
                extension?.stateObj?.dockManager ??
                this._ubuntuDockManager ??
                null;
        } catch {}
    }

    _nativeDockForContainer(container) {
        if (!container)
            return null;

        this._refreshUbuntuDockManager();

        const docks =
            this._ubuntuDockManager?._allDocks ??
            this._ubuntuDockManager?.allDocks ??
            [];

        for (const dock of docks) {
            if (
                dock?.dash?._dashContainer ===
                    container ||
                dock?.dash?._container ===
                    container
            ) {
                return dock;
            }
        }

        return null;
    }

    _disconnectNativeDockSignals(entry) {
        if (!entry)
            return;

        if (
            entry.nativeDock &&
            entry.nativeDockStateId
        ) {
            try {
                entry.nativeDock.disconnect(
                    entry.nativeDockStateId
                );
            } catch {}
        }

        if (
            entry.nativeIntellihide &&
            entry.nativeIntellihideId
        ) {
            try {
                entry.nativeIntellihide.disconnect(
                    entry.nativeIntellihideId
                );
            } catch {}
        }

        if (
            entry.nativeSlider &&
            entry.nativeSliderId
        ) {
            try {
                entry.nativeSlider.disconnect(
                    entry.nativeSliderId
                );
            } catch {}
        }

        entry.nativeDockStateId = 0;
        entry.nativeIntellihideId = 0;
        entry.nativeSliderId = 0;
        entry.nativeIntellihide = null;
        entry.nativeSlider = null;
        entry.nativeVisibilityGate = null;
        entry.nativeVisibilityGateInstalled = false;
        entry.nativeGlassVisible = null;
    }

    _nativeDockGlassVisible(entry) {
        if (!entry?.container)
            return false;

        if (this._dockIsPanelMode())
            return false;

        if (
            this._dockModeTransitionTarget === false
        ) {
            return false;
        }

        const dock = entry.nativeDock;
        if (!dock)
            return this._nativeDashIsReady(
                entry.container
            );

        // Ubuntu Dock State.HIDDEN = 0. SHOWING/HIDING must remain visible so
        // the glass follows the native slide animation instead of popping.
        return dock.dockState !== 0;
    }

    _syncNativeDockVisualState(
        entry,
        requestFrame = false
    ) {
        const manager = entry?.manager;
        if (!manager)
            return;

        const visible =
            this._nativeDockGlassVisible(
                entry
            );

        // The visibility callback is stable for the lifetime of this manager.
        // Reinstalling it on every slide-x notify allocated a new closure and
        // called show()/hide() on every native autohide animation frame.
        if (!entry.nativeVisibilityGateInstalled) {
            entry.nativeVisibilityGate =
                () =>
                    this._nativeDockGlassVisible(
                        entry
                    );
            manager.setVisibilityGate?.(
                entry.nativeVisibilityGate
            );
            entry.nativeVisibilityGateInstalled = true;
        }

        if (!manager.bgActor)
            return;

        if (!visible) {
            if (manager.bgActor.opacity !== 0)
                manager.bgActor.opacity = 0;
            // Keep the independent glass actor mapped while Ubuntu Dock is
            // hidden. Unmapping/remapping the full-monitor offscreen effect
            // creates an empty first frame on reveal and can expose transient
            // allocations as a one-frame size flash.
            entry.nativeGlassVisible = false;
            return;
        }

        if (!manager.bgActor.visible)
            manager.bgActor.show?.();

        const opacity =
            entry.container
                ?.get_paint_opacity?.() ??
            entry.container?.opacity ??
            255;
        if (manager.bgActor.opacity !== opacity)
            manager.bgActor.opacity = opacity;

        const becameVisible =
            entry.nativeGlassVisible !== true;
        entry.nativeGlassVisible = true;

        // Native Dash-to-Dock already damages the stage while slide-x animates.
        // Do not stack bgActor + shader + full-stage redraw requests on every
        // slider frame. A single redraw is enough when semantic visibility
        // changes; paint-time geometry follows the native animation thereafter.
        if (requestFrame || becameVisible)
            manager.bgActor.queue_redraw?.();
    }

    _syncNativeDockBinding(entry) {
        if (!entry?.container)
            return null;

        const dock =
            this._nativeDockForContainer(
                entry.container
            );

        if (dock === entry.nativeDock) {
            this._syncNativeDockVisualState(
                entry
            );
            return dock;
        }

        this._disconnectNativeDockSignals(
            entry
        );

        entry.nativeDock = dock;

        if (dock) {
            try {
                entry.nativeDockStateId =
                    dock.connect(
                        'notify::dock-state',
                        () =>
                            this._syncNativeDockVisualState(
                                entry,
                                true
                            )
                    );
            } catch {
                entry.nativeDockStateId = 0;
            }

            const intellihide =
                dock._intellihide ?? null;
            entry.nativeIntellihide =
                intellihide;

            if (intellihide) {
                try {
                    entry.nativeIntellihideId =
                        intellihide.connect(
                            'status-changed',
                            () => {
                                // Ubuntu Dock itself decides whether to show
                                // or hide. We only request a fresh paint after
                                // its native decision/animation starts.
                                this._syncNativeDockVisualState(
                                    entry,
                                    true
                                );
                            }
                        );
                } catch {
                    entry.nativeIntellihideId = 0;
                }
            }

            const slider =
                dock._slider ?? null;
            entry.nativeSlider = slider;

            // Do not subscribe to notify::slide-x. Dash-to-Dock already
            // queues relayout/damage for every slider step, while DashManager
            // follows the final allocation through its stage loop + live
            // geometry hook. A second JS callback on every animation frame was
            // both redundant and a source of autohide paint churn.
            entry.nativeSliderId = 0;
        }

        this._syncNativeDockVisualState(
            entry
        );

        return dock;
    }

    _cancelDockModeTransition() {
        this._dockModeGeneration++;

        if (this._dockModeTransitionStageId) {
            try {
                global.stage.disconnect(
                    this._dockModeTransitionStageId
                );
            } catch {}
            this._dockModeTransitionStageId = 0;
        }

        if (this._dockModeHandoffId) {
            try {
                GLib.source_remove(
                    this._dockModeHandoffId
                );
            } catch {}
            this._dockModeHandoffId = 0;
        }

        this._dockModeTransitionTarget = null;
        this._dockHandoffActive = false;
    }

    _beginDockModeTransition(panelMode) {
        if (!this._enabled)
            return;

        this._cancelDockModeTransition();
        const generation =
            this._dockModeGeneration;
        this._dockModeTransitionTarget =
            panelMode;

        if (panelMode) {
            this._syncDockGlassPreferenceForPanelMode(
                true
            );

            this._findNativeDashToDock();
            this._dockModeTransitionTarget = null;
            this._scheduleNativeDashRescan();
            return;
        }

        // Panel -> floating dock: keep the existing translucent panel paint
        // as a visual handoff while Ubuntu Dock applies _resetPosition().
        // Glass stays detached during these settle frames, so it can never
        // capture the old full-panel allocation.
        this._findNativeDashToDock();

        let settledFrames = 0;
        this._dockModeTransitionStageId =
            global.stage.connect(
                'after-paint',
                () => {
                    if (
                        !this._enabled ||
                        generation !==
                            this._dockModeGeneration
                    ) {
                        return;
                    }

                    if (this._dockIsPanelMode()) {
                        this._beginDockModeTransition(
                            true
                        );
                        return;
                    }

                    settledFrames++;
                    if (
                        settledFrames <
                        DOCK_MODE_SETTLE_FRAMES
                    ) {
                        return;
                    }

                    if (
                        this._dockModeTransitionStageId
                    ) {
                        try {
                            global.stage.disconnect(
                                this._dockModeTransitionStageId
                            );
                        } catch {}
                        this._dockModeTransitionStageId = 0;
                    }

                    this._startDockModeHandoff(
                        generation
                    );
                }
            );
    }

    _startDockModeHandoff(generation) {
        if (
            !this._enabled ||
            generation !== this._dockModeGeneration
        ) {
            return;
        }

        this._dockModeTransitionTarget = null;
        this._dockHandoffActive = true;

        // External Liquid Glass, if present, is restored only AFTER Ubuntu
        // Dock has left extended geometry. This removes the old full-width
        // black frame during panel -> dock transitions.
        this._syncDockGlassPreferenceForPanelMode(
            false
        );

        this._findNativeDashToDock();

        const startedUs =
            GLib.get_monotonic_time();

        this._dockModeHandoffId =
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                DOCK_HANDOFF_POLL_MS,
                () => {
                    if (
                        !this._enabled ||
                        generation !==
                            this._dockModeGeneration
                    ) {
                        this._dockModeHandoffId = 0;
                        return GLib.SOURCE_REMOVE;
                    }

                    if (this._dockIsPanelMode()) {
                        this._dockModeHandoffId = 0;
                        this._beginDockModeTransition(
                            true
                        );
                        return GLib.SOURCE_REMOVE;
                    }

                    this._findNativeDashToDock();

                    let ready =
                        this._nativeDashEntries.length > 0;

                    for (
                        const entry of
                        this._nativeDashEntries
                    ) {
                        if (
                            !this._nativeDashIsReady(
                                entry.container
                            )
                        ) {
                            continue;
                        }

                        this._syncNativeDockBinding(
                            entry
                        );

                        if (this._externalGlobalStack)
                            continue;

                        if (!entry.manager) {
                            ready = false;
                            continue;
                        }

                        const effect =
                            entry.manager.effect;

                        if (!effect?._shadersLoaded) {
                            ready = false;
                            continue;
                        }

                        const hidden =
                            entry.nativeDock?.dockState === 0;

                        if (
                            !hidden &&
                            !(
                                (
                                    effect
                                        ?._diagCompositedPaintCount ??
                                    0
                                ) > 0
                            )
                        ) {
                            ready = false;
                        }
                    }

                    const elapsedMs =
                        (
                            GLib.get_monotonic_time() -
                            startedUs
                        ) / 1000;

                    if (
                        this._externalGlobalStack &&
                        elapsedMs < 320
                    ) {
                        ready = false;
                    }

                    if (ready) {
                        this._dockModeHandoffId = 0;
                        this._completeDockModeHandoff();
                        return GLib.SOURCE_REMOVE;
                    }

                    if (
                        elapsedMs >=
                        DOCK_HANDOFF_MAX_MS
                    ) {
                        // Safety-first fallback: keep the translucent native
                        // background instead of exposing a black/uninitialized
                        // shader frame. A later rescan can still finish the
                        // handoff once glass becomes healthy.
                        this._dockModeHandoffId = 0;
                        console.warn(
                            '[Velora][Dock] glass handoff timed out; keeping native fallback'
                        );
                        this._scheduleNativeDashRescan();
                        return GLib.SOURCE_REMOVE;
                    }

                    return GLib.SOURCE_CONTINUE;
                }
            );
    }

    _completeDockModeHandoff() {
        this._dockHandoffActive = false;
        this._dockModeTransitionTarget = null;

        for (const entry of this._nativeDashEntries) {
            this._applyDockPanelPaint(
                entry,
                false
            );
            this._setDockPanelModeClass(
                entry.container,
                false
            );
            this._syncDockGlassBackgroundClass(
                entry,
                true
            );

            if (entry.manager) {
                this._syncNativeDockBinding(entry);
                this._syncNativeDockVisualState(
                    entry,
                    true
                );
            }
        }

        this._scheduleNativeDashRescan();
    }

    _setDockPanelModeClass(container, enabled) {
        if (!container)
            return;

        try {
            const active =
                Boolean(
                    container.has_style_class_name?.(
                        DOCK_PANEL_MODE_CLASS
                    )
                );

            if (enabled && !active) {
                container.add_style_class_name?.(
                    DOCK_PANEL_MODE_CLASS
                );
            } else if (!enabled && active) {
                container.remove_style_class_name?.(
                    DOCK_PANEL_MODE_CLASS
                );
            }
        } catch {}
    }

    _findDockPanelBackground(container) {
        let found = null;

        const walk = actor => {
            if (!actor || found)
                return;

            const classes = String(
                actor.get_style_class_name?.() ??
                actor.style_class ??
                ''
            ).split(/\s+/);

            if (classes.includes('dash-background')) {
                found = actor;
                return;
            }

            for (const child of actor.get_children?.() ?? [])
                walk(child);
        };

        // Ubuntu Dock inherits Dash-to-Dock's actor structure: the real
        // .dash-background is a sibling of #dashtodockDashContainer, not a
        // child of it. Walk upward through the local dock subtree and search
        // each common ancestor, rather than scanning the whole Shell.
        let cursor = container;
        let depth = 0;

        while (cursor && depth++ < 6 && !found) {
            walk(cursor);

            const name = cursor.get_name?.() ?? '';
            if (
                found ||
                name === 'dash' ||
                name === 'dashtodockContainer'
            ) {
                break;
            }

            cursor = cursor.get_parent?.() ?? null;
        }

        return found;
    }

    _removeDockPanelBlur(actor) {
        if (!actor)
            return;

        try {
            actor.remove_effect_by_name?.(
                DOCK_PANEL_BLUR_EFFECT
            );
        } catch {}
    }

    _ensureDockPanelBlur(actor) {
        if (!actor)
            return;

        try {
            if (
                actor.get_effect?.(
                    DOCK_PANEL_BLUR_EFFECT
                )
            ) {
                return;
            }
        } catch {}

        let effect = null;

        try {
            effect = new Shell.BlurEffect({
                mode: Shell.BlurMode.BACKGROUND,
                radius: DOCK_PANEL_BLUR_RADIUS,
                brightness: 1.0,
            });
        } catch {
            try {
                effect = new Shell.BlurEffect({
                    mode: Shell.BlurMode.BACKGROUND,
                    brightness: 1.0,
                });

                if (effect.set_radius) {
                    effect.set_radius(
                        DOCK_PANEL_BLUR_RADIUS
                    );
                } else if ('radius' in effect) {
                    effect.radius =
                        DOCK_PANEL_BLUR_RADIUS;
                } else if ('sigma' in effect) {
                    effect.sigma =
                        DOCK_PANEL_BLUR_RADIUS / 2;
                }
            } catch {
                effect = null;
            }
        }

        if (!effect)
            return;

        try {
            actor.add_effect_with_name?.(
                DOCK_PANEL_BLUR_EFFECT,
                effect
            );
        } catch {}
    }

    _syncDockGlassBackgroundClass(entry, enabled) {
        const actor =
            this._watchDockPanelBackground(
                entry
            );
        if (!actor)
            return;

        try {
            const active =
                Boolean(
                    actor.has_style_class_name?.(
                        DOCK_GLASS_BACKGROUND_CLASS
                    )
                );

            if (enabled && !active) {
                actor.add_style_class_name?.(
                    DOCK_GLASS_BACKGROUND_CLASS
                );
            } else if (!enabled && active) {
                actor.remove_style_class_name?.(
                    DOCK_GLASS_BACKGROUND_CLASS
                );
            }
        } catch {}
    }

    _dockPanelPaintShouldOwn(entry) {
        return Boolean(
            entry?.panelPaintActive ||
            this._dockIsPanelMode() ||
            this._dockModeTransitionTarget === false ||
            this._dockHandoffActive
        );
    }

    _disconnectDockPanelBackgroundWatcher(entry) {
        if (
            entry?.panelBackgroundActor &&
            entry.panelBackgroundStyleId
        ) {
            try {
                entry.panelBackgroundActor.disconnect(
                    entry.panelBackgroundStyleId
                );
            } catch {}
        }

        if (entry) {
            entry.panelBackgroundStyleId = 0;
            entry.panelBackgroundStyleGuard = false;
        }
    }

    _setDockPanelPremiumStyle(entry, actor) {
        if (
            !entry ||
            !actor ||
            entry.panelBackgroundStyleGuard
        ) {
            return;
        }

        const current =
            actor.get_style?.() ??
            actor.style ??
            '';

        if (current === DOCK_PANEL_PREMIUM_STYLE)
            return;

        entry.panelBackgroundStyleGuard = true;
        try {
            actor.set_style?.(
                DOCK_PANEL_PREMIUM_STYLE
            );
        } catch {}
        finally {
            entry.panelBackgroundStyleGuard = false;
        }
    }

    _watchDockPanelBackground(entry) {
        if (!entry?.container)
            return null;

        const actor =
            this._findDockPanelBackground(
                entry.container
            );
        if (!actor)
            return null;

        if (actor === entry.panelBackgroundActor)
            return actor;

        const previous =
            entry.panelBackgroundActor;

        if (previous) {
            this._removeDockPanelBlur(previous);
            this._disconnectDockPanelBackgroundWatcher(
                entry
            );

            try {
                previous.remove_style_class_name?.(
                    DOCK_PANEL_BACKGROUND_CLASS
                );
            } catch {}
        }

        entry.panelBackgroundActor = actor;
        entry.panelBackgroundOriginalStyle =
            actor.get_style?.() ??
            actor.style ??
            null;
        entry.panelBackgroundStyleId = 0;
        entry.panelBackgroundStyleGuard = false;

        try {
            entry.panelBackgroundStyleId =
                actor.connect(
                    'notify::style',
                    () => {
                        if (
                            !this._enabled ||
                            entry.panelBackgroundActor !==
                                actor ||
                            entry.panelBackgroundStyleGuard
                        ) {
                            return;
                        }

                        if (
                            this._dockPanelPaintShouldOwn(
                                entry
                            )
                        ) {
                            // Ubuntu Dock's ThemeManager can write its Yaru
                            // opaque style synchronously during
                            // changed::extend-height. Re-assert our premium
                            // paint in the SAME signal turn, before the stage
                            // gets a chance to paint the black intermediate.
                            this._setDockPanelPremiumStyle(
                                entry,
                                actor
                            );
                        } else {
                            // Outside panel/handoff mode, remember the latest
                            // native style so restoration never jumps back to
                            // a stale panel-era theme.
                            entry.panelBackgroundOriginalStyle =
                                actor.get_style?.() ??
                                actor.style ??
                                null;
                        }
                    }
                );
        } catch {
            entry.panelBackgroundStyleId = 0;
        }

        return actor;
    }

    _applyDockPanelPaint(entry, enabled) {
        if (!entry?.container)
            return;

        const actor =
            this._watchDockPanelBackground(
                entry
            );

        if (!enabled) {
            if (!entry.panelPaintActive)
                return;

            entry.panelPaintActive = false;

            if (actor) {
                this._removeDockPanelBlur(actor);

                try {
                    actor.remove_style_class_name?.(
                        DOCK_PANEL_BACKGROUND_CLASS
                    );
                } catch {}

                entry.panelBackgroundStyleGuard = true;
                try {
                    actor.set_style?.(
                        entry.panelBackgroundOriginalStyle ?? null
                    );
                } catch {}
                finally {
                    entry.panelBackgroundStyleGuard = false;
                }

                // Ask Ubuntu Dock to resolve the CURRENT mode's native style
                // now, instead of waiting for a later theme pass.
                try {
                    entry.nativeDock
                        ?._themeManager
                        ?.updateCustomTheme?.();
                } catch {}
            }

            return;
        }

        if (!actor)
            return;

        entry.panelPaintActive = true;

        actor.add_style_class_name?.(
            DOCK_PANEL_BACKGROUND_CLASS
        );
        this._ensureDockPanelBlur(actor);
        this._setDockPanelPremiumStyle(
            entry,
            actor
        );
    }

    _syncNativeDashEntryMode(entry) {
        if (!entry?.container)
            return false;

        const panelMode =
            this._dockIsPanelMode();

        this._syncNativeDockBinding(entry);
        this._watchDockPanelBackground(entry);

        if (panelMode) {
            this._syncDockGlassBackgroundClass(
                entry,
                false
            );
            this._setDockPanelModeClass(
                entry.container,
                true
            );
            this._applyDockPanelPaint(
                entry,
                true
            );

            // Panel mode deliberately has no Liquid Glass/refraction shader.
            this._cleanupNativeDashManager(entry);
            return true;
        }

        if (
            this._dockModeTransitionTarget === false
        ) {
            this._syncDockGlassBackgroundClass(
                entry,
                false
            );
            // Waiting for Ubuntu Dock's extended -> floating relayout to
            // settle. Preserve the known-good panel paint and keep glass off.
            this._setDockPanelModeClass(
                entry.container,
                true
            );
            this._applyDockPanelPaint(
                entry,
                true
            );
            this._cleanupNativeDashManager(entry);
            return true;
        }

        if (this._dockHandoffActive) {
            this._syncDockGlassBackgroundClass(
                entry,
                false
            );
            // Warm the floating glass behind the still-visible native fallback.
            this._setDockPanelModeClass(
                entry.container,
                true
            );
            this._applyDockPanelPaint(
                entry,
                true
            );

            if (this._externalGlobalStack)
                return true;

            if (
                !this._nativeDashIsReady(
                    entry.container
                )
            ) {
                this._cleanupNativeDashManager(
                    entry
                );
                return false;
            }

            return Boolean(
                this._attachNativeDashManager(
                    entry
                ) ||
                entry.manager
            );
        }

        this._setDockPanelModeClass(
            entry.container,
            false
        );
        this._applyDockPanelPaint(
            entry,
            false
        );
        this._syncDockGlassBackgroundClass(
            entry,
            true
        );

        if (this._externalGlobalStack)
            return true;

        if (
            !this._nativeDashIsReady(
                entry.container
            )
        ) {
            this._cleanupNativeDashManager(
                entry
            );
            return false;
        }

        return Boolean(
            this._attachNativeDashManager(entry) ||
            entry.manager
        );
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

    _nativeDashIsReady(container) {
        if (!container)
            return false;

        try {
            return (
                container.get_stage?.() === global.stage &&
                container.mapped &&
                container.visible
            );
        } catch {
            return false;
        }
    }

    _cleanupNativeDashManager(entry) {
        if (!entry?.manager)
            return;

        entry.nativeVisibilityGate = null;
        entry.nativeVisibilityGateInstalled = false;
        entry.nativeGlassVisible = null;
        entry.nativeDockStableW = NaN;
        entry.nativeDockStableH = NaN;

        try {
            entry.manager._veloraRestoreSceneThrottle?.();
        } catch {}

        try {
            entry.manager.cleanup();
        } catch (error) {
            console.error(
                '[Velora][LiquidGlass] native dock manager cleanup failed: ' +
                error
            );
        }
        entry.manager = null;
    }

    _prepareUbuntuDockManagerInstance(entry, manager) {
        if (!entry || !manager)
            return;

        if (manager._veloraUbuntuDockRuntimePatched)
            return;

        manager._veloraUbuntuDockRuntimePatched = true;

        // Hot-swapped Velora revisions reuse the already-loaded vendor module
        // graph. Patch the INSTANCE so these fixes work immediately without a
        // GNOME Shell restart, regardless of which vendor revision is cached.
        manager._marginValue = 0;
        manager._glassExpand = 0;
        manager._currentMarginStyle = '';

        const originalApplyMargin =
            typeof manager._applyMargin === 'function'
                ? manager._applyMargin.bind(manager)
                : null;

        manager._applyMargin = () => {
            manager._marginValue = 0;
            manager._glassExpand = 0;
            manager._currentMarginStyle = '';

            if (
                manager.targetActor &&
                manager._originalStyle !== undefined
            ) {
                try {
                    manager.targetActor.set_style(
                        manager._originalStyle
                    );
                } catch {}
            }

            // Intentionally do not call the vendor implementation: Ubuntu
            // Dock owns every geometry/margin decision.
            void originalApplyMargin;
        };

        manager._applyDockMargin =
            bounds => bounds;

        const originalReadDockBounds =
            typeof manager._readDockBounds === 'function'
                ? manager._readDockBounds.bind(manager)
                : null;

        if (originalReadDockBounds) {
            manager._readDockBounds = () => {
                const bounds = originalReadDockBounds();
                if (!bounds)
                    return bounds;

                const slider =
                    entry.nativeSlider ??
                    entry.nativeDock?._slider ??
                    null;
                const slide = Number(
                    slider?.slide_x ??
                    slider?.slideX ??
                    NaN
                );
                const animating =
                    Number.isFinite(slide) &&
                    slide > 0.001 &&
                    slide < 0.999;

                const valid =
                    Number.isFinite(bounds.baseW) &&
                    Number.isFinite(bounds.baseH) &&
                    bounds.baseW > 9 &&
                    bounds.baseH > 9;

                if (!animating && valid) {
                    entry.nativeDockStableW =
                        bounds.baseW;
                    entry.nativeDockStableH =
                        bounds.baseH;
                    return bounds;
                }

                if (
                    animating &&
                    Number.isFinite(
                        entry.nativeDockStableW
                    ) &&
                    Number.isFinite(
                        entry.nativeDockStableH
                    ) &&
                    entry.nativeDockStableW > 9 &&
                    entry.nativeDockStableH > 9
                ) {
                    // Autohide is a translation animation. Ubuntu Dock can
                    // expose a transient clipped allocation for one frame while
                    // relayout settles; never let that transient length/thickness
                    // become the glass shape. Position remains live.
                    return {
                        ...bounds,
                        baseW:
                            entry.nativeDockStableW,
                        baseH:
                            entry.nativeDockStableH,
                    };
                }

                return bounds;
            };
        }

        const originalSyncGeometry =
            typeof manager._syncGeometry ===
                'function'
                ? manager._syncGeometry.bind(
                    manager
                )
                : null;

        manager._syncGeometry = () => {
            manager._marginValue = 0;
            manager._glassExpand = 0;

            if (
                !this._nativeDockGlassVisible(
                    entry
                )
            ) {
                if (
                    manager.bgActor &&
                    manager.bgActor.opacity !== 0
                ) {
                    manager.bgActor.opacity = 0;
                }
                return;
            }

            originalSyncGeometry?.();
        };

        const originalLiveGeometry =
            typeof manager
                ._syncGlassGeometryLive ===
                'function'
                ? manager
                    ._syncGlassGeometryLive
                    .bind(manager)
                : null;

        manager._syncGlassGeometryLive = () => {
            if (
                !this._nativeDockGlassVisible(
                    entry
                )
            ) {
                return;
            }

            originalLiveGeometry?.();
        };
    }

    _finalizeUbuntuDockManagerInstance(entry) {
        const manager = entry?.manager;
        if (!manager)
            return;

        manager._marginValue = 0;
        manager._glassExpand = 0;
        manager._currentMarginStyle = '';

        // Older cached vendor managers add the generic transparency class to
        // the icon/reveal subtree during setup(). Remove it synchronously;
        // Velora transparently styles only the real .dash-background actor.
        try {
            manager.targetActor
                ?.remove_style_class_name?.(
                    'liquid-glass-transparent'
                );
        } catch {}

        try {
            manager._dockParent
                ?.remove_style_class_name?.(
                    'liquid-glass-transparent'
                );
        } catch {}

        const useGlassBackground =
            !this._dockIsPanelMode() &&
            this._dockModeTransitionTarget !== false &&
            !this._dockHandoffActive;

        this._syncDockGlassBackgroundClass(
            entry,
            useGlassBackground
        );

        try {
            // Prime the stable shape before the first autohide reveal so even
            // a dock that starts hidden has a valid non-transient geometry.
            manager._readDockBounds?.();
        } catch {}

        this._syncNativeDockVisualState(
            entry
        );
    }

    _attachNativeDashManager(entry) {
        if (
            !entry ||
            entry.manager ||
            this._externalGlobalStack ||
            this._dockIsPanelMode() ||
            !this._nativeDashIsReady(entry.container)
        ) {
            return false;
        }

        try {
            entry.manager =
                new this._vendor.DashManager(
                    this._vendor.root,
                    entry.container,
                    this._settings,
                    this._logger
                );

            this._prepareUbuntuDockManagerInstance(
                entry,
                entry.manager
            );

            // Supported by newer vendor revisions; harmless when the process
            // is still using an older cached module.
            entry.manager.setPreserveNativeGeometry?.(
                true
            );
            entry.manager.setSceneFpsLimit?.(
                Math.max(
                    15,
                    Math.min(
                        24,
                        this._readSharedCardAppearance()
                            ?.sceneFps ?? 24
                    )
                )
            );

            entry.manager.setup();

            entry.manager.setMaterialOverride?.(
                () => this._applySharedDashMaterial(
                    entry.manager,
                    'dock'
                )
            );
            this._applySharedDashMaterial(
                entry.manager,
                'dock'
            );

            this._syncNativeDockBinding(entry);
            this._finalizeUbuntuDockManagerInstance(
                entry
            );

            return true;
        } catch (error) {
            console.error(
                '[Velora][LiquidGlass] native dock attach failed: ' +
                error
            );
            this._cleanupNativeDashManager(entry);
            return false;
        }
    }

    _findNativeDashToDock() {
        const containers =
            this._collectNativeDashContainers();
        if (containers.length === 0)
            return false;

        let active = 0;

        for (const container of containers) {
            let entry = this._nativeDashEntries.find(
                item => item.container === container
            );

            if (!entry) {
                entry = {
                    container,
                    manager: null,
                    destroyId: 0,
                    mappedId: 0,
                    nativeDock: null,
                    nativeDockStateId: 0,
                    nativeIntellihide: null,
                    nativeIntellihideId: 0,
                    nativeSlider: null,
                    nativeSliderId: 0,
                    nativeVisibilityGate: null,
                    nativeVisibilityGateInstalled: false,
                    nativeGlassVisible: null,
                    nativeDockStableW: NaN,
                    nativeDockStableH: NaN,
                    panelBackgroundActor: null,
                    panelBackgroundOriginalStyle: null,
                    panelBackgroundStyleId: 0,
                    panelBackgroundStyleGuard: false,
                    panelPaintActive: false,
                };
                this._nativeDashEntries.push(entry);

                try {
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
                } catch {
                    entry.destroyId = 0;
                }

                try {
                    entry.mappedId = container.connect(
                        'notify::mapped',
                        () => {
                            if (!this._enabled)
                                return;

                            if (this._nativeDashIsReady(container)) {
                                this._syncNativeDashEntryMode(entry);
                            } else {
                                // Stop the vendored frame/theme sampler as soon
                                // as Ubuntu Dock leaves the stage. Continuing to
                                // query theme nodes on detached St actors causes
                                // the repeated "widget is not in the stage"
                                // warnings seen in the Shell journal.
                                this._cleanupNativeDashManager(entry);
                            }
                        }
                    );
                } catch {
                    entry.mappedId = 0;
                }
            }

            if (this._nativeDashIsReady(container)) {
                if (this._syncNativeDashEntryMode(entry))
                    active++;
            } else {
                this._cleanupNativeDashManager(entry);
            }
        }

        return active > 0 || containers.length > 0;
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

        if (entry.mappedId) {
            try {
                entry.container.disconnect(entry.mappedId);
            } catch {
                // Container may already be gone.
            }
            entry.mappedId = 0;
        }

        this._disconnectNativeDockSignals(
            entry
        );
        entry.nativeDock = null;

        this._disconnectDockPanelBackgroundWatcher(
            entry
        );

        this._cleanupNativeDashManager(entry);
        this._syncDockGlassBackgroundClass(
            entry,
            false
        );
        this._applyDockPanelPaint(
            entry,
            false
        );
        this._setDockPanelModeClass(
            entry.container,
            false
        );
    }

    _scheduleNativeDashRescan() {
        // One retry chain at a time. Restarting the timer on every caller can
        // turn unrelated Shell events into a permanent polling loop.
        if (this._dashReconnectTimeoutId)
            return;

        let attempts = 0;
        let sourceId = 0;

        sourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            DASH_RESCAN_INTERVAL_MS,
            () => {
                let keepGoing = false;

                try {
                    attempts++;
                    const tracked =
                        this._findNativeDashToDock();

                    // Once a dock container is tracked, its destroy/mapped
                    // signals own lifecycle changes. Polling after success is
                    // both unnecessary and harmful because mode sync touches
                    // native theme state.
                    keepGoing =
                        !tracked &&
                        attempts <
                            DASH_RESCAN_IDLE_TICKS;
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
                appGridBackdropManager: Boolean(
                    this._appGridBackdropManager
                ),
                overviewCloseGlassManager: Boolean(
                    this._overviewCloseGlassManager
                ),
                sharedAdaptiveTextManager: Boolean(
                    this._sharedAdaptiveTextManager
                ),
                orbGlassManager: Boolean(
                    this._orbGlassManager
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
        this._cancelDockModeTransition();

        for (const entry of [
            ...this._nativeDashEntries,
        ]) {
            this._releaseNativeDash(entry);
        }
        this._nativeDashEntries = [];
        this._cleanupDashToDockModeWatch();

        this._cleanupSharedCardAppearanceSync();

        cleanup('popupGlassManager', this._popupGlassManager);
        this._popupGlassManager = null;

        cleanup(
            'shellCardGlassManager',
            this._shellCardGlassManager
        );
        this._shellCardGlassManager = null;

        cleanup(
            'appGridBackdropManager',
            this._appGridBackdropManager
        );
        this._appGridBackdropManager = null;

        cleanup(
            'overviewCloseGlassManager',
            this._overviewCloseGlassManager
        );
        this._overviewCloseGlassManager = null;

        cleanup(
            'sharedAdaptiveTextManager',
            this._sharedAdaptiveTextManager
        );
        this._sharedAdaptiveTextManager = null;

        cleanup(
            'orbGlassManager',
            this._orbGlassManager
        );
        this._orbGlassManager = null;

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
        this._ubuntuDockModule = null;
        this._ubuntuDockManager = null;
        this._externalGlobalStack = false;
        this._managerHealth = {};
    }
}

