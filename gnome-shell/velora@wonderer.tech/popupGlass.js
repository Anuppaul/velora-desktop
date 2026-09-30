import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    GLASS_TEXT_PALETTE,
    VELORA_GLASS_ADAPTERS,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
    resolveGlassInteractionTarget,
    stepGlassInteraction,
} from './glassMaterialSystem.js';

const GLASS_CLASS = 'velora-liquid-popup-content';
const SHELL_CLASS = 'velora-liquid-popup-shell';
const DATE_SHELL_CLASS = 'velora-liquid-date-menu-shell';
const QUICK_SHELL_CLASS = 'velora-liquid-quick-menu-shell';
const QUICK_ROOT_CLASS = 'velora-liquid-quick-menu-root';
const DEFAULT_RADIUS = 18;
const GLASS_EDGE_PAD = 20;
const SAMPLE_MARGIN_MIN = 64;
const SAMPLE_MARGIN_MAX = 200;

const DATE_INNER_CARD_CLASSES = new Set([
    'datemenu-today-button',
    'calendar',
    'events-button',
    'world-clocks-button',
    'weather-button',
    'message',
    'message-list-clear-button',
]);
const DATE_INNER_CARD_PRIORITY = new Map([
    ['datemenu-today-button', 0],
    ['calendar', 1],
    ['events-button', 2],
    ['world-clocks-button', 3],
    ['weather-button', 4],
    ['message-list-clear-button', 5],
    ['message', 6],
]);
const QUICK_INNER_CARD_CLASSES = new Set([
    'quick-toggle-has-menu',
    'quick-toggle',
    'quick-slider',
    'quick-toggle-menu',
]);
const DATE_INNER_PAD = 20;
const DATE_INNER_SCAN_INTERVAL_US = 500000;
const DATE_TEXT_LIGHT_CLASS = 'velora-date-text-light';
const DATE_TEXT_DARK_CLASS = 'velora-date-text-dark';
const DATE_CARD_TEXT_LIGHT_CLASS = 'velora-date-card-text-light';
const DATE_CARD_TEXT_DARK_CLASS = 'velora-date-card-text-dark';
const QUICK_CARD_TEXT_LIGHT_CLASS = 'velora-quick-card-text-light';
const QUICK_CARD_TEXT_DARK_CLASS = 'velora-quick-card-text-dark';
const QUICK_ACTIVE_CLASS = 'velora-quick-active';
const DATE_LIGHT_TEXT = GLASS_TEXT_PALETTE.light;
const DATE_DARK_TEXT = GLASS_TEXT_PALETTE.dark;
const DATE_TEXT_SWITCH_ADVANTAGE = 1.18;
const DATE_MIN_READABLE_CONTRAST = 4.5;
const DATE_CARD_SAMPLE_GRID = 28;

function finiteRect(values) {
    return values.every(Number.isFinite) &&
        values[2] > 1 &&
        values[3] > 1;
}

function readRadius(actor) {
    try {
        actor.ensure_style?.();
        const node = actor.get_theme_node?.();
        const values = [
            St.Corner.TOPLEFT,
            St.Corner.TOPRIGHT,
            St.Corner.BOTTOMRIGHT,
            St.Corner.BOTTOMLEFT,
        ].map(corner => node?.get_border_radius?.(corner) ?? 0);
        const radius = Math.max(...values);
        if (Number.isFinite(radius) && radius > 0)
            return radius;
    } catch {
        // Theme-derived fallback below.
    }
    return DEFAULT_RADIUS;
}

function actorClasses(actor) {
    return String(
        actor?.get_style_class_name?.() ??
        actor?.style_class ??
        ''
    ).split(/\s+/).filter(Boolean);
}

function dateCardClass(actor) {
    for (const name of actorClasses(actor)) {
        if (DATE_INNER_CARD_CLASSES.has(name))
            return name;
    }
    return null;
}

function quickCardClass(actor, inSystemItem = false) {
    const classes = actorClasses(actor);

    for (const name of classes) {
        if (QUICK_INNER_CARD_CLASSES.has(name))
            return name;
    }

    if (inSystemItem && classes.includes('icon-button'))
        return 'system-icon-button';

    return null;
}

function hasPseudo(actor, name) {
    try {
        return Boolean(
            actor?.has_style_pseudo_class?.(name)
        );
    } catch {
        return false;
    }
}

function quickCardState(actor) {
    let pressed = false;
    let selected = false;
    let hovered = false;
    let focused = false;

    const walk = node => {
        if (!node)
            return;

        pressed ||= hasPseudo(node, 'active');
        selected ||=
            node?.checked === true ||
            node?.get_checked?.() === true ||
            hasPseudo(node, 'checked') ||
            hasPseudo(node, 'selected');
        hovered ||= hasPseudo(node, 'hover');
        focused ||= hasPseudo(node, 'focus');

        if (pressed && selected && hovered && focused)
            return;

        for (const child of node.get_children?.() ?? [])
            walk(child);
    };

    walk(actor);

    return {
        pressed,
        selected,
        engaged: pressed || hovered || focused,
    };
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function srgbToLinear(channel) {
    const n = channel / 255;
    return n <= 0.04045
        ? n / 12.92
        : Math.pow((n + 0.055) / 1.055, 2.4);
}

function rgbLuminance(r, g, b) {
    return (
        0.2126 * srgbToLinear(r) +
        0.7152 * srgbToLinear(g) +
        0.0722 * srgbToLinear(b)
    );
}

function hexLuminance(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return rgbLuminance(
        (value >> 16) & 255,
        (value >> 8) & 255,
        value & 255
    );
}

function trimmedMean(values, trimRatio = 0.30) {
    if (!values.length)
        return null;

    const sorted = values.slice().sort((a, b) => a - b);
    const trim = Math.min(
        Math.floor(sorted.length * trimRatio),
        Math.floor((sorted.length - 1) / 2)
    );
    const start = trim;
    const end = sorted.length - trim;

    let sum = 0;
    for (let i = start; i < end; i++)
        sum += sorted[i];

    return sum / Math.max(1, end - start);
}

function contrastRatio(a, b) {
    return (
        (Math.max(a, b) + 0.05) /
        (Math.min(a, b) + 0.05)
    );
}

const DATE_LIGHT_LUMA = hexLuminance(DATE_LIGHT_TEXT);
const DATE_DARK_LUMA = hexLuminance(DATE_DARK_TEXT);

/**
 * Standard GNOME PopupMenu Liquid Glass.
 *
 * Native hierarchy stays untouched:
 *
 *   Main.uiGroup
 *     └─ menu.actor = BoxPointer
 *          └─ BoxPointer.bin
 *               └─ menu.box (.popup-menu-content)
 *
 * Velora adds a separate, unpickable, full-monitor paint layer directly below
 * menu.actor in Main.uiGroup. Its shader mask follows menu.box's transformed
 * stage rect. This avoids participating in BoxPointer layout/allocation at all.
 */
class PopupGlassSurface {
    constructor(manager, menu) {
        this._manager = manager;
        this._vendor = manager._vendor;
        this._settings = manager._settings;
        this._menu = menu;
        this._box = menu?.box ?? null;
        this._boxPointer = menu?._boxPointer ?? menu?.actor ?? null;
        this._bin = menu?._boxPointer?.bin ?? null;
        this._paintRoot = null;
        this._nativeBoxPointerBorder = null;
        this._nativeBoxPointerBorderOpacity = null;

        this._root = null;
        this._liquidBox = null;
        this._sceneManager = null;
        this._filterLayer = null;
        this._effect = null;

        // Date Menu and Quick Settings share one nested multi-region
        // LiquidEffect. It clones the already-rendered outer glass and
        // refracts that clone inside the native card/pod bounds: the exact
        // same glass-on-glass pipeline for both surfaces.
        this._dateInnerRoot = null;
        this._dateInnerLiquidBox = null;
        this._dateInnerClone = null;
        this._dateInnerEffect = null;
        this._dateCardActors = [];
        this._dateCardResponses = new Map();
        this._dateCardTextState = new Map();
        this._quickSelectedState = new Map();
        this._dateInnerRegionCount = 0;
        this._dateInnerRadius = 16;
        this._lastDateCardScanUs = 0;

        this._dateScreenshot = null;
        this._dateTextSampleSourceId = 0;
        this._dateTextGeneration = 0;

        this._radius = DEFAULT_RADIUS;
        this._destroyed = false;
        this._openStateId = 0;
        const popupClasses = String(
            this._box?.get_style_class_name?.() ??
            this._box?.style_class ??
            ''
        ).split(/\s+/);

        this._isDateMenu =
            popupClasses.includes('datemenu-popover');
        this._isQuickSettings =
            popupClasses.includes('quick-settings');

        this._surfaceAdapter =
            this._isDateMenu
                ? VELORA_GLASS_ADAPTERS.dateMenu
                : (
                    this._isQuickSettings
                        ? VELORA_GLASS_ADAPTERS.quickMenu
                        : null
                );
        this._lastSceneSyncUs = 0;

        this._lastShaderX = NaN;
        this._lastShaderY = NaN;
        this._lastShaderW = NaN;
        this._lastShaderH = NaN;
        this._lastMonitorX = NaN;
        this._lastMonitorY = NaN;
        this._lastScreenW = 0;
        this._lastScreenH = 0;
    }

    _suppressNativeQuickBoxPointerBorder() {
        if (!this._isQuickSettings)
            return;

        const border =
            this._boxPointer?._border ??
            null;
        if (!border)
            return;

        if (!this._nativeBoxPointerBorder) {
            this._nativeBoxPointerBorder = border;
            this._nativeBoxPointerBorderOpacity =
                border.opacity ?? 255;
        }

        // BoxPointer._border is a St.DrawingArea that paints GNOME/Yaru's
        // own full rounded popover outline. Keeping it allocated but fully
        // transparent preserves native geometry while removing the second
        // visible card edge behind Velora's LiquidEffect rim.
        if (border.opacity !== 0)
            border.opacity = 0;
        border.queue_repaint?.();
    }

    _resolvePaintRoot() {
        let root =
            this._boxPointer ??
            this._menu?.actor ??
            null;

        let guard = 32;
        while (
            root?.get_parent?.() &&
            root.get_parent() !== Main.layoutManager.uiGroup &&
            guard-- > 0
        ) {
            root = root.get_parent();
        }

        return (
            root?.get_parent?.() === Main.layoutManager.uiGroup
                ? root
                : null
        );
    }

    attach() {
        if (
            this._destroyed ||
            !this._box ||
            !this._bin ||
            !this._boxPointer ||
            this._root
        ) {
            return Boolean(this._root);
        }

        // Recover stale wrapper/direct-material remnants from older Velora
        // revisions before installing the stage-level material.
        const currentChild = this._bin.get_child?.() ?? null;
        if (
            currentChild !== this._box &&
            currentChild?.get_name?.() === 'velora-popup-glass-stack' &&
            this._box.get_parent?.() === currentChild
        ) {
            try {
                currentChild.remove_child(this._box);
                this._bin.set_child(this._box);
                currentChild.destroy?.();
            } catch (error) {
                console.error(
                    '[Velora][PopupGlass] stale wrapper recovery failed: ' +
                    error
                );
                return false;
            }
        }

        for (const child of this._boxPointer.get_children?.() ?? []) {
            if (
                child !== this._bin &&
                child.get_name?.() === 'velora-popup-glass-material'
            ) {
                try {
                    child.destroy?.();
                } catch {
                    // Best-effort recovery from an older runtime.
                }
            }
        }

        if (this._bin.get_child?.() !== this._box)
            return false;

        this._radius = readRadius(this._box);
        this._paintRoot = this._resolvePaintRoot();

        const root = new this._vendor.UnpickableActor({
            name: 'velora-popup-material-root',
            reactive: false,
        });
        root.set_size(1, 1);
        root.hide();

        const liquidBox = new this._vendor.UnpickableActor({
            name: 'velora-popup-liquid-box',
            reactive: false,
        });
        liquidBox.set_clip_to_allocation(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(1, 1);
        root.add_child(liquidBox);

        // GPU-native scene source: shared wallpaper + live Meta.WindowActor
        // clones. No CPU screenshot/readback.
        const sceneManager =
            new this._vendor.WindowCloneManager(
                liquidBox,
                null,
                'velora-popup-scene'
            );

        const breaker = new this._vendor.UnpickableActor({
            name: 'velora-popup-optimization-breaker',
            reactive: false,
        });
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-popup',
        });
        effect.setPadding?.(20);
        effect.setIsDock?.(false);
        effect.setSurfaceLightEnabled?.(true);
        effect.setCornerRadius?.(this._radius);
        effect.setBlurMethod?.(1);
        liquidBox.add_effect(effect);

        const filterLayer = new St.Widget({
            name: 'velora-popup-white-filter',
            style_class: 'velora-glass-white-filter',
            reactive: false,
        });
        root.add_child(filterLayer);

        let dateInnerRoot = null;
        let dateInnerLiquidBox = null;
        let dateInnerClone = null;
        let dateInnerEffect = null;

        if (this._isDateMenu || this._isQuickSettings) {
            dateInnerRoot = new this._vendor.UnpickableActor({
                name: 'velora-popup-inner-material-root',
                reactive: false,
            });
            dateInnerRoot.set_size(1, 1);
            dateInnerRoot.hide();

            dateInnerLiquidBox = new this._vendor.UnpickableActor({
                name: 'velora-popup-inner-liquid-box',
                reactive: false,
            });
            dateInnerLiquidBox.set_clip_to_allocation(true);
            dateInnerLiquidBox.set_position(0, 0);
            dateInnerLiquidBox.set_size(1, 1);
            dateInnerRoot.add_child(dateInnerLiquidBox);

            // Safe non-recursive source: dateInnerRoot is a sibling ABOVE
            // root, while the clone points DOWN to root. root never contains
            // dateInnerRoot, so this cannot form a paint cycle.
            dateInnerClone = new Clutter.Clone({
                source: root,
                reactive: false,
            });
            dateInnerClone.set_position(0, 0);
            dateInnerClone.set_size(1, 1);
            dateInnerLiquidBox.add_child(dateInnerClone);

            dateInnerEffect = new this._vendor.LiquidEffect({
                extensionPath: this._vendor.root,
                settings: this._settings,
                owner: 'velora-popup-inner-cards',
            });
            dateInnerEffect.setPadding?.(DATE_INNER_PAD);
            dateInnerEffect.setIsDock?.(false);
            dateInnerEffect.setSurfaceLightEnabled?.(true);
            dateInnerEffect.setCornerRadius?.(16);
            dateInnerEffect.setBlurMethod?.(1);
            dateInnerEffect.setMultiRegionMode?.(true);
            dateInnerLiquidBox.add_effect(dateInnerEffect);
        }

        try {
            const paintRoot =
                this._paintRoot ??
                this._resolvePaintRoot();

            if (paintRoot) {
                // Both material layers must remain BELOW the full native popup
                // paint root. QuickSettingsMenu wraps BoxPointer + overlay in
                // an extra actor, unlike Date Menu; anchoring to BoxPointer
                // alone put glass above Quick Settings content.
                Main.layoutManager.uiGroup.insert_child_below(
                    root,
                    paintRoot
                );

                if (dateInnerRoot) {
                    Main.layoutManager.uiGroup.insert_child_above(
                        dateInnerRoot,
                        root
                    );
                    Main.layoutManager.uiGroup.set_child_below_sibling?.(
                        dateInnerRoot,
                        paintRoot
                    );
                }
            } else {
                // Unknown hierarchy: fail safe by keeping material below other
                // UI-group children rather than painting over native content.
                Main.layoutManager.uiGroup.insert_child_at_index?.(
                    root,
                    0
                );
                if (dateInnerRoot) {
                    Main.layoutManager.uiGroup.insert_child_above(
                        dateInnerRoot,
                        root
                    );
                }
            }
        } catch (error) {
            try {
                sceneManager.destroy?.();
            } catch {}
            try {
                dateInnerRoot?.destroy?.();
            } catch {}
            try {
                root.destroy?.();
            } catch {}

            console.error(
                '[Velora][PopupGlass] stage material attach failed: ' +
                error
            );
            return false;
        }

        this._box.add_style_class_name?.(GLASS_CLASS);
        this._boxPointer.add_style_class_name?.(SHELL_CLASS);
        if (this._isDateMenu)
            this._boxPointer.add_style_class_name?.(DATE_SHELL_CLASS);
        if (this._isQuickSettings) {
            this._boxPointer.add_style_class_name?.(QUICK_SHELL_CLASS);
            this._menu?.actor?.add_style_class_name?.(
                QUICK_ROOT_CLASS
            );
            this._suppressNativeQuickBoxPointerBorder();
        }

        this._root = root;
        this._liquidBox = liquidBox;
        this._sceneManager = sceneManager;
        this._filterLayer = filterLayer;
        this._effect = effect;
        this._dateInnerRoot = dateInnerRoot;
        this._dateInnerLiquidBox = dateInnerLiquidBox;
        this._dateInnerClone = dateInnerClone;
        this._dateInnerEffect = dateInnerEffect;

        try {
            this._openStateId = this._menu.connect(
                'open-state-changed',
                (_menu, isOpen) => {
                    if (!isOpen) {
                        this._root?.hide?.();
                        this._dateInnerRoot?.hide?.();
                        this._cancelDateTextSample();
                        return;
                    }

                    this._sceneManager?.rebuildClones?.();
                    this._lastSceneSyncUs = GLib.get_monotonic_time();

                    this._scanDateCardActors(true);
                    if (this._surfaceAdapter?.adaptiveText) {
                        this._scheduleDateTextSample(
                            this._surfaceAdapter.adaptiveSampleDelayMs
                                ?? 220
                        );
                    }
                    this._invalidateGeometry();
                    this._root?.queue_redraw?.();
                    this._dateInnerRoot?.queue_redraw?.();
                }
            );
        } catch {
            this._openStateId = 0;
        }

        effect.setLiveGeometryHook?.(() => {
            // Paint-time path is uniforms only; actor tree writes remain in
            // the stage before-update sync.
            this._syncShaderGeometry();
        });

        dateInnerEffect?.setLiveGeometryHook?.(() => {
            // Same rule as the outer effect: only update uniforms here.
            this._syncDateInnerShaderGeometry();
        });

        this.updateAppearance(this._manager._appearance);
        this._sync(false);

        console.log(
            '[Velora][PopupGlass] attached ' +
            this._manager.describeMenu(this._menu)
        );
        return true;
    }

    _invalidateGeometry() {
        this._lastShaderX = NaN;
        this._lastShaderY = NaN;
        this._lastShaderW = NaN;
        this._lastShaderH = NaN;
        this._lastMonitorX = NaN;
        this._lastMonitorY = NaN;
        this._lastScreenW = 0;
        this._lastScreenH = 0;
    }

    _scanDateCardActors(force = false) {
        if (
            !this._surfaceAdapter?.adaptiveText ||
            !this._box
        ) {
            return;
        }

        const nowUs = GLib.get_monotonic_time();
        if (
            !force &&
            this._dateCardActors.length > 0 &&
            nowUs - this._lastDateCardScanUs <
                DATE_INNER_SCAN_INTERVAL_US
        ) {
            return;
        }

        this._lastDateCardScanUs = nowUs;
        const found = [];

        const walk = (actor, inSystemItem = false) => {
            if (!actor)
                return;

            let systemItem = inSystemItem;
            if (actor !== this._box) {
                const classes = actorClasses(actor);
                systemItem =
                    systemItem ||
                    classes.includes('quick-settings-system-item');

                const klass = this._isDateMenu
                    ? dateCardClass(actor)
                    : quickCardClass(actor, systemItem);

                if (klass) {
                    if (
                        !this._isQuickSettings ||
                        actor.visible ||
                        actor.mapped
                    ) {
                        found.push({actor, klass});
                    }
                    return;
                }
            }

            for (const child of actor.get_children?.() ?? [])
                walk(child, systemItem);
        };

        walk(this._box);

        // GNOME QuickSettingsMenu renders expanded Wi-Fi/Bluetooth/Power
        // menus in a sibling overlay, not inside menu.box. Scan that overlay
        // as part of the same physical popup so collapsible cards receive the
        // exact same nested glass material.
        if (
            this._isQuickSettings &&
            this._menu?._overlay
        ) {
            walk(this._menu._overlay);
        }

        if (this._isDateMenu) {
            found.sort((a, b) =>
                (DATE_INNER_CARD_PRIORITY.get(a.klass) ?? 99) -
                (DATE_INNER_CARD_PRIORITY.get(b.klass) ?? 99)
            );
        } else {
            found.sort((a, b) => {
                const [ax, ay] =
                    a.actor.get_transformed_position?.() ?? [0, 0];
                const [bx, by] =
                    b.actor.get_transformed_position?.() ?? [0, 0];
                return (ay - by) || (ax - bx);
            });
        }

        this._dateCardActors =
            found.slice(0, 16).map(item => item.actor);

        const live = new Set(this._dateCardActors);
        for (const actor of this._dateCardResponses.keys()) {
            if (!live.has(actor))
                this._dateCardResponses.delete(actor);
        }

        for (const actor of this._quickSelectedState.keys()) {
            if (live.has(actor))
                continue;

            try {
                actor.remove_style_class_name?.(
                    QUICK_ACTIVE_CLASS
                );
            } catch {}
            this._quickSelectedState.delete(actor);
        }

        for (const actor of this._dateCardTextState.keys()) {
            if (live.has(actor))
                continue;

            try {
                actor.remove_style_class_name?.(
                    DATE_CARD_TEXT_LIGHT_CLASS
                );
                actor.remove_style_class_name?.(
                    DATE_CARD_TEXT_DARK_CLASS
                );
                actor.remove_style_class_name?.(
                    QUICK_CARD_TEXT_LIGHT_CLASS
                );
                actor.remove_style_class_name?.(
                    QUICK_CARD_TEXT_DARK_CLASS
                );
            } catch {}
            this._dateCardTextState.delete(actor);
        }

        const radii = this._dateCardActors
            .map(actor => readRadius(actor))
            .filter(radius =>
                Number.isFinite(radius) &&
                radius >= 6 &&
                radius <= 36
            )
            .sort((a, b) => a - b);

        if (radii.length) {
            const middle = Math.floor(radii.length / 2);
            const median =
                radii.length % 2
                    ? radii[middle]
                    : (radii[middle - 1] + radii[middle]) / 2;
            const nextRadius =
                clampNumber(Math.round(median), 10, 28);

            if (nextRadius !== this._dateInnerRadius) {
                this._dateInnerRadius = nextRadius;
                this._dateInnerEffect?.setCornerRadius?.(
                    nextRadius
                );
            }
        }
    }

    _dateCardResponse(actor, klass, quickState = null) {
        if (this._isDateMenu && klass === 'calendar')
            return 0;

        let pressed;
        let selected;
        let engaged;

        if (this._isQuickSettings) {
            const state =
                quickState ?? quickCardState(actor);
            ({pressed, selected, engaged} = state);
        } else {
            pressed = hasPseudo(actor, 'active');
            selected =
                hasPseudo(actor, 'checked') ||
                hasPseudo(actor, 'selected');
            engaged =
                pressed ||
                hasPseudo(actor, 'hover') ||
                hasPseudo(actor, 'focus');
        }

        const role = VELORA_GLASS_ROLES.innerCard;
        const target = resolveGlassInteractionTarget(
            {
                pressed,
                engaged,
                // Quick Settings active state is foreground-only. Selected
                // must not alter tile body/material at rest.
                selected:
                    this._isQuickSettings
                        ? false
                        : selected,
            },
            role.interaction
        );
        const previous =
            this._dateCardResponses.get(actor) ?? 0.0;
        const next = stepGlassInteraction(
            previous,
            target,
            role.interaction
        );

        this._dateCardResponses.set(actor, next);
        return next;
    }

    _syncDateInnerRegions(
        monitorX,
        monitorY,
        screenW,
        screenH,
        allowScan = true
    ) {
        if (!this._dateInnerEffect)
            return;

        if (allowScan)
            this._scanDateCardActors(false);

        const regions = [];

        for (const actor of this._dateCardActors) {
            if (
                !actor?.visible ||
                !actor?.mapped ||
                (actor.get_paint_opacity?.() ?? actor.opacity ?? 255) <= 0
            ) {
                continue;
            }

            const rect = this._vendor.getTransformedRect(actor);
            if (!finiteRect(rect))
                continue;

            const [absX, absY, width, height] = rect;
            const klass = this._isDateMenu
                ? dateCardClass(actor)
                : quickCardClass(actor);

            const quickAdapter =
                VELORA_GLASS_ADAPTERS.quickMenu;
            const state =
                this._isQuickSettings
                    ? quickCardState(actor)
                    : null;
            const quickSelected =
                Boolean(state?.selected);

            if (this._isQuickSettings) {
                const previousSelected =
                    this._quickSelectedState.get(actor);

                if (previousSelected !== quickSelected) {
                    if (quickSelected) {
                        actor.add_style_class_name?.(
                            QUICK_ACTIVE_CLASS
                        );
                    } else {
                        actor.remove_style_class_name?.(
                            QUICK_ACTIVE_CLASS
                        );
                    }
                    this._quickSelectedState.set(
                        actor,
                        quickSelected
                    );
                }
            }

            const baseStrength = (() => {
                if (this._isQuickSettings)
                    return quickAdapter.neutralBaseStrength;

                switch (klass) {
                case 'calendar':
                    return 0.024;
                case 'message':
                    return 0.036;
                case 'datemenu-today-button':
                    return 0.052;
                case 'message-list-clear-button':
                    return 0.058;
                default:
                    return 0.046;
                }
            })();

            const response =
                this._dateCardResponse(
                    actor,
                    klass,
                    state
                );

            const strengthCeiling = 0.11;

            const reactiveStrength =
                Math.min(
                    strengthCeiling,
                    baseStrength + response * 0.025
                );

            const tint =
                this._isQuickSettings
                    ? quickAdapter.neutralTint
                    : [1.0, 1.0, 1.0];

            regions.push({
                x: absX - monitorX - DATE_INNER_PAD,
                y: absY - monitorY - DATE_INNER_PAD,
                w: width + DATE_INNER_PAD * 2,
                h: height + DATE_INNER_PAD * 2,
                tintR: tint[0],
                tintG: tint[1],
                tintB: tint[2],
                baseStrength: reactiveStrength,
                response,
            });
        }

        this._dateInnerRegionCount = regions.length;
        this._dateInnerEffect.setResolution?.(screenW, screenH);
        this._dateInnerEffect.setGlassRegions?.(regions);
    }

    _syncDateInnerShaderGeometry() {
        if (
            this._destroyed ||
            !this._dateInnerEffect ||
            !this._dateInnerRoot?.mapped
        ) {
            return;
        }

        const measured = this._measure();
        if (!measured)
            return;

        const monitor = measured.monitor;
        const monitorX = monitor.x ?? 0;
        const monitorY = monitor.y ?? 0;
        const screenW = Math.max(
            1,
            monitor.width ?? global.stage.width
        );
        const screenH = Math.max(
            1,
            monitor.height ?? global.stage.height
        );

        this._syncDateInnerRegions(
            monitorX,
            monitorY,
            screenW,
            screenH,
            false
        );
    }

    _captureDateMenuFrame(rect) {
        if (!rect || rect.length < 4)
            return Promise.resolve(null);

        const [x, y, width, height] = rect;
        const left = Math.max(0, Math.floor(x));
        const top = Math.max(0, Math.floor(y));
        const right = Math.min(
            global.stage.width,
            Math.ceil(x + width)
        );
        const bottom = Math.min(
            global.stage.height,
            Math.ceil(y + height)
        );

        if (right <= left || bottom <= top)
            return Promise.resolve(null);

        if (!this._dateScreenshot)
            this._dateScreenshot = new Shell.Screenshot();

        return new Promise(resolve => {
            let stream = null;

            try {
                stream = Gio.MemoryOutputStream.new_resizable();
                this._dateScreenshot.screenshot_area(
                    left,
                    top,
                    right - left,
                    bottom - top,
                    stream,
                    (object, result) => {
                        try {
                            if (!object)
                                throw new Error('null screenshot object');

                            const [ok] =
                                object.screenshot_area_finish(result);
                            stream.close(null);

                            if (!ok) {
                                resolve(null);
                                return;
                            }

                            const bytes = stream.steal_as_bytes();
                            const pixbuf =
                                GdkPixbuf.Pixbuf.new_from_stream(
                                    Gio.MemoryInputStream.new_from_bytes(
                                        bytes
                                    ),
                                    null
                                );

                            if (!pixbuf) {
                                resolve(null);
                                return;
                            }

                            resolve({
                                x: left,
                                y: top,
                                width: pixbuf.get_width(),
                                height: pixbuf.get_height(),
                                stride: pixbuf.get_rowstride(),
                                channels: pixbuf.get_n_channels(),
                                data: pixbuf.get_pixels(),
                            });
                        } catch {
                            try {
                                stream?.close?.(null);
                            } catch {}
                            resolve(null);
                        }
                    }
                );
            } catch {
                try {
                    stream?.close?.(null);
                } catch {}
                resolve(null);
            }
        });
    }

    _dateCardLuminance(frame, actor) {
        if (!frame || !actor)
            return null;

        const rect = this._vendor.getTransformedRect(actor);
        if (!finiteRect(rect))
            return null;

        let [x, y, width, height] = rect;

        // Sample the optical body, not the antialiased rim. Media cards also
        // get a little more horizontal inset so album art cannot dominate the
        // text polarity decision.
        const klass = dateCardClass(actor);
        const insetX = klass === 'message'
            ? Math.min(18, width * 0.08)
            : Math.min(8, width * 0.04);
        const insetY = Math.min(8, height * 0.08);

        x += insetX;
        y += insetY;
        width -= insetX * 2;
        height -= insetY * 2;

        const left = clampNumber(
            Math.floor(x - frame.x),
            0,
            frame.width - 1
        );
        const top = clampNumber(
            Math.floor(y - frame.y),
            0,
            frame.height - 1
        );
        const right = clampNumber(
            Math.ceil(x + width - frame.x),
            left + 1,
            frame.width
        );
        const bottom = clampNumber(
            Math.ceil(y + height - frame.y),
            top + 1,
            frame.height
        );

        if (right <= left || bottom <= top)
            return null;

        const sampleWidth = right - left;
        const sampleHeight = bottom - top;
        const step = Math.max(
            1,
            Math.floor(
                Math.min(sampleWidth, sampleHeight) /
                DATE_CARD_SAMPLE_GRID
            )
        );

        const values = [];
        const {data, stride, channels} = frame;

        for (let py = top; py < bottom; py += step) {
            const row = py * stride;

            for (let px = left; px < right; px += step) {
                const index = row + px * channels;
                let r = data[index];
                let g = data[index + 1];
                let b = data[index + 2];

                if (channels > 3) {
                    const alpha = data[index + 3];
                    if (alpha < 32)
                        continue;

                    if (alpha < 255) {
                        const inv = 255 / alpha;
                        r = clampNumber(
                            Math.round(r * inv),
                            0,
                            255
                        );
                        g = clampNumber(
                            Math.round(g * inv),
                            0,
                            255
                        );
                        b = clampNumber(
                            Math.round(b * inv),
                            0,
                            255
                        );
                    }
                }

                values.push(rgbLuminance(r, g, b));
            }
        }

        return trimmedMean(values, 0.30);
    }

    _chooseDateCardDarkText(actor, luminance) {
        if (!Number.isFinite(luminance))
            return null;

        const lightContrast = contrastRatio(
            luminance,
            DATE_LIGHT_LUMA
        );
        const darkContrast = contrastRatio(
            luminance,
            DATE_DARK_LUMA
        );

        const previous =
            this._dateCardTextState.get(actor);

        if (previous === undefined)
            return darkContrast > lightContrast;

        const current =
            previous ? darkContrast : lightContrast;
        const alternative =
            previous ? lightContrast : darkContrast;

        // A hard readability failure always wins immediately. Otherwise
        // require a real contrast advantage before changing polarity, which
        // keeps moving wallpaper/video highlights from making text ping-pong.
        if (
            current < DATE_MIN_READABLE_CONTRAST &&
            alternative >= DATE_MIN_READABLE_CONTRAST
        ) {
            return !previous;
        }

        if (
            alternative >
            current * DATE_TEXT_SWITCH_ADVANTAGE
        ) {
            return !previous;
        }

        return previous;
    }

    _applyDateCardTextPolarity(actor, useDarkText) {
        if (!actor || useDarkText === null)
            return;

        const previous =
            this._dateCardTextState.get(actor);
        if (previous === useDarkText)
            return;

        const lightClass =
            this._isQuickSettings
                ? QUICK_CARD_TEXT_LIGHT_CLASS
                : DATE_CARD_TEXT_LIGHT_CLASS;
        const darkClass =
            this._isQuickSettings
                ? QUICK_CARD_TEXT_DARK_CLASS
                : DATE_CARD_TEXT_DARK_CLASS;

        actor.remove_style_class_name?.(lightClass);
        actor.remove_style_class_name?.(darkClass);
        actor.add_style_class_name?.(
            useDarkText ? darkClass : lightClass
        );

        this._dateCardTextState.set(
            actor,
            useDarkText
        );

        // Polarity also drives the adaptive material tint on Quick Settings,
        // so repaint only when the decision actually changes.
        if (this._isQuickSettings) {
            this._dateInnerEffect?.queue_repaint?.();
            this._dateInnerRoot?.queue_redraw?.();
        }
    }

    _cancelDateTextSample() {
        this._dateTextGeneration++;

        if (this._dateTextSampleSourceId) {
            try {
                GLib.source_remove(this._dateTextSampleSourceId);
            } catch {}
            this._dateTextSampleSourceId = 0;
        }
    }

    _scheduleDateTextSample(delayMs = 220) {
        if (
            (!this._isDateMenu && !this._isQuickSettings) ||
            !this._box
        ) {
            return;
        }

        this._cancelDateTextSample();
        const generation = this._dateTextGeneration;

        this._dateTextSampleSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delayMs,
            () => {
                this._dateTextSampleSourceId = 0;
                this._sampleDateTextPolarity(generation);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async _sampleDateTextPolarity(generation) {
        if (
            this._destroyed ||
            generation !== this._dateTextGeneration ||
            !this._menu?.isOpen
        ) {
            return;
        }

        const measured = this._measure();
        if (!measured)
            return;

        this._scanDateCardActors(false);

        let frame = null;
        try {
            frame = await this._captureDateMenuFrame(
                measured.rect
            );
        } catch {
            frame = null;
        }

        if (
            this._destroyed ||
            generation !== this._dateTextGeneration ||
            !frame
        ) {
            return;
        }

        // One captured popup frame, many card decisions. No per-card
        // screenshot/readback round trip.
        for (const actor of this._dateCardActors) {
            if (
                !actor?.visible ||
                !actor?.mapped
            ) {
                continue;
            }

            const luminance =
                this._dateCardLuminance(frame, actor);
            const dark =
                this._chooseDateCardDarkText(
                    actor,
                    luminance
                );

            this._applyDateCardTextPolarity(
                actor,
                dark
            );
        }

        // Remove the previous menu-wide polarity classes. Kept here as a
        // hot-swap cleanup path so a runtime revision can transition from the
        // old global scheme without requiring a Shell restart.
        this._box?.remove_style_class_name?.(
            DATE_TEXT_LIGHT_CLASS
        );
        this._box?.remove_style_class_name?.(
            DATE_TEXT_DARK_CLASS
        );

        if (
            !this._destroyed &&
            generation === this._dateTextGeneration &&
            this._menu?.isOpen
        ) {
            this._scheduleDateTextSample(
                this._surfaceAdapter?.adaptiveResampleMs
                    ?? 3000
            );
        }
    }

    updateAppearance(state) {
        if (!this._effect || !state)
            return;

        this._radius = readRadius(this._box);

        const appearanceProfile =
            this._surfaceAdapter?.appearanceProfile ?? null;
        const scopedAppearance =
            appearanceProfile
                ? state?.[appearanceProfile]
                : (
                    this._isDateMenu
                        ? state.dateMenu
                        : null
                );

        const profile =
            scopedAppearance
                ? {
                    ...state,
                    ...scopedAppearance,
                }
                : state;

        this._effect.setTintColor?.(
            (profile.r ?? 255) / 255,
            (profile.g ?? 255) / 255,
            (profile.b ?? 255) / 255
        );
        this._effect.setTintStrength?.(profile.opacity ?? 0.02);
        this._effect.setBlurRadius?.(profile.blur ?? 7);
        this._effect.setCornerRadius?.(this._radius);
        this._effect.setBlurMethod?.(1);

        if (
            this._dateInnerEffect &&
            (this._isDateMenu || this._isQuickSettings)
        ) {
            let brightness = null;
            let contrast = null;
            let saturation = null;

            try {
                brightness =
                    this._settings.get_double('menu-brightness');
                contrast =
                    this._settings.get_double('menu-contrast');
                saturation =
                    this._settings.get_double('menu-saturation');
            } catch {
                // Shared role defaults still produce the approved material.
            }

            applyVeloraGlassRole(
                this._dateInnerEffect,
                VELORA_GLASS_ROLES.innerCard,
                {
                    tintColor: [
                        (profile.r ?? 255) / 255,
                        (profile.g ?? 255) / 255,
                        (profile.b ?? 255) / 255,
                    ],
                    baseBlur: profile.blur ?? 7,
                    cornerRadius: this._dateInnerRadius,
                    brightness,
                    contrast,
                    saturation,
                }
            );
        }

        const popupChrome =
            this._surfaceAdapter?.popupChrome ?? null;

        if (popupChrome?.shadow === false) {
            // Single-rim popup policy: LiquidEffect owns depth; no second
            // outer drop shadow from the popup material.
            try {
                this._effect._uniforms?.set?.('shadow_radius', 0);
                this._effect._uniforms?.set?.('shadow_intensity', 0);
                this._effect.queue_repaint?.();
            } catch {
                // Renderer internals are optional.
            }
        }

        const filterOpacity = Math.max(
            0,
            Math.min(
                0.20,
                this._surfaceAdapter?.filterOpacityOverride ??
                    profile.filterOpacity ??
                    0.04
            )
        );
        const filterBorder =
            popupChrome?.filterBorder === false
                ? 'border: none;'
                : (
                    'border: 1px solid rgba(255,255,255,' +
                    Math.min(0.12, filterOpacity + 0.025).toFixed(3) +
                    ');'
                );

        this._filterLayer?.set_style?.(
            'background-color: rgba(255,255,255,' +
            filterOpacity.toFixed(3) +
            '); border-radius: ' +
            Math.round(this._radius) +
            'px; ' +
            filterBorder +
            ' box-shadow: none;'
        );

        try {
            this._effect.setBrightness?.(
                this._settings.get_double('menu-brightness')
            );
            this._effect.setContrast?.(
                this._settings.get_double('menu-contrast')
            );
            this._effect.setSaturation?.(
                this._settings.get_double('menu-saturation')
            );

            // Nested cards consume the same values through the shared role.
        } catch {
            // Renderer defaults remain valid.
        }

        this._root?.queue_redraw?.();
        this._dateInnerRoot?.queue_redraw?.();
    }

    syncFrame() {
        if (this._destroyed)
            return;

        this._sync(false);
    }

    _measure() {
        const box = this._box;
        const actor = this._boxPointer;
        if (!box || !actor)
            return null;

        const rect = this._vendor.getTransformedRect(box);
        if (!finiteRect(rect))
            return null;

        const opacity =
            actor.get_paint_opacity?.() ??
            actor.opacity ??
            255;

        if (
            !actor.mapped ||
            !actor.visible ||
            opacity <= 0
        ) {
            return null;
        }

        const monitor =
            this._vendor.resolveMonitorGeometry([
                box,
                actor,
                this._menu?.sourceActor,
            ]) ??
            Main.layoutManager.primaryMonitor ??
            {
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
            };

        return {
            rect,
            opacity,
            monitor,
        };
    }

    _sync(shaderOnly) {
        const paintRoot =
            this._paintRoot ??
            this._resolvePaintRoot();

        if (!shaderOnly && this._isQuickSettings)
            this._suppressNativeQuickBoxPointerBorder();

        if (
            !shaderOnly &&
            paintRoot?.get_parent?.() === Main.layoutManager.uiGroup
        ) {
            try {
                if (this._root?.get_parent?.() === Main.layoutManager.uiGroup) {
                    Main.layoutManager.uiGroup.set_child_below_sibling?.(
                        this._root,
                        paintRoot
                    );
                }
                if (
                    this._dateInnerRoot?.get_parent?.() ===
                    Main.layoutManager.uiGroup
                ) {
                    Main.layoutManager.uiGroup.set_child_above_sibling?.(
                        this._dateInnerRoot,
                        this._root
                    );
                    Main.layoutManager.uiGroup.set_child_below_sibling?.(
                        this._dateInnerRoot,
                        paintRoot
                    );
                }
            } catch {
                // Ordering self-heal is best effort.
            }
        }

        const measured = this._measure();
        if (!measured) {
            if (!shaderOnly && this._root?.visible)
                this._root.hide?.();
            if (!shaderOnly && this._dateInnerRoot?.visible)
                this._dateInnerRoot.hide?.();
            return;
        }

        const {
            rect: [absX, absY, width, height],
            opacity,
            monitor,
        } = measured;

        const monitorX = monitor.x ?? 0;
        const monitorY = monitor.y ?? 0;
        const screenW = Math.max(
            1,
            monitor.width ?? global.stage.width
        );
        const screenH = Math.max(
            1,
            monitor.height ?? global.stage.height
        );

        // GNOME's menu children (notably message cards) intentionally paint
        // shadows slightly outside menu.box. The vendored UIManager reserves
        // shader padding for this exact reason. Expand only the material mask;
        // native layout/position remains untouched.
        const glassAbsX = absX - GLASS_EDGE_PAD;
        const glassAbsY = absY - GLASS_EDGE_PAD;
        const glassW = width + GLASS_EDGE_PAD * 2;
        const glassH = height + GLASS_EDGE_PAD * 2;

        const glassX = glassAbsX - monitorX;
        const glassY = glassAbsY - monitorY;

        const geometryChanged =
            this._lastShaderX !== glassX ||
            this._lastShaderY !== glassY ||
            this._lastShaderW !== glassW ||
            this._lastShaderH !== glassH;

        if (geometryChanged) {
            this._lastShaderX = glassX;
            this._lastShaderY = glassY;
            this._lastShaderW = glassW;
            this._lastShaderH = glassH;

            this._effect?.setGlassGeometry?.(
                glassX,
                glassY,
                glassW,
                glassH
            );
        }

        this._effect?.setResolution?.(
            screenW,
            screenH
        );

        if (this._isDateMenu || this._isQuickSettings) {
            this._syncDateInnerRegions(
                monitorX,
                monitorY,
                screenW,
                screenH,
                !shaderOnly
            );
        }

        if (shaderOnly)
            return;

        const rootChanged =
            this._lastMonitorX !== monitorX ||
            this._lastMonitorY !== monitorY ||
            this._lastScreenW !== screenW ||
            this._lastScreenH !== screenH;

        if (rootChanged) {
            this._vendor.setPositionIfChanged(
                this._root,
                monitorX,
                monitorY
            );
            this._vendor.setSizeIfChanged(
                this._root,
                screenW,
                screenH
            );
            this._vendor.setPositionIfChanged(
                this._liquidBox,
                0,
                0
            );
            this._vendor.setSizeIfChanged(
                this._liquidBox,
                screenW,
                screenH
            );

            if (this._dateInnerRoot) {
                this._vendor.setPositionIfChanged(
                    this._dateInnerRoot,
                    monitorX,
                    monitorY
                );
                this._vendor.setSizeIfChanged(
                    this._dateInnerRoot,
                    screenW,
                    screenH
                );
                this._vendor.setPositionIfChanged(
                    this._dateInnerLiquidBox,
                    0,
                    0
                );
                this._vendor.setSizeIfChanged(
                    this._dateInnerLiquidBox,
                    screenW,
                    screenH
                );
                this._vendor.setPositionIfChanged(
                    this._dateInnerClone,
                    0,
                    0
                );
                this._vendor.setSizeIfChanged(
                    this._dateInnerClone,
                    screenW,
                    screenH
                );
            }

            this._lastMonitorX = monitorX;
            this._lastMonitorY = monitorY;
            this._lastScreenW = screenW;
            this._lastScreenH = screenH;
        }

        const filterUsesContentBounds =
            this._surfaceAdapter?.filterUsesContentBounds === true;

        const filterX =
            filterUsesContentBounds
                ? absX - monitorX
                : glassX;
        const filterY =
            filterUsesContentBounds
                ? absY - monitorY
                : glassY;
        const filterW =
            filterUsesContentBounds
                ? width
                : glassW;
        const filterH =
            filterUsesContentBounds
                ? height
                : glassH;

        this._vendor.setPositionIfChanged(
            this._filterLayer,
            filterX,
            filterY
        );
        this._vendor.setSizeIfChanged(
            this._filterLayer,
            filterW,
            filterH
        );

        const appearanceProfile =
            this._surfaceAdapter?.appearanceProfile ??
            (this._isDateMenu ? 'dateMenu' : null);

        const surfaceAppearance =
            appearanceProfile
                ? {
                    ...this._manager._appearance,
                    ...(this._manager._appearance?.[appearanceProfile] ?? {}),
                }
                : this._manager._appearance;

        const blur = Math.max(
            0,
            surfaceAppearance?.blur ?? 0
        );
        const margin = Math.max(
            SAMPLE_MARGIN_MIN,
            Math.min(
                SAMPLE_MARGIN_MAX,
                Math.round(blur * 3 + 48)
            )
        );

        this._vendor.setClipIfChanged(
            this._root,
            glassX - margin,
            glassY - margin,
            glassW + margin * 2,
            glassH + margin * 2
        );
        if (this._dateInnerRoot) {
            this._vendor.setClipIfChanged(
                this._dateInnerRoot,
                glassX - margin,
                glassY - margin,
                glassW + margin * 2,
                glassH + margin * 2
            );
        }

        this._effect?.setShadowMaxRadius?.(
            Math.max(0, margin - 16)
        );

        const captureRect = [
            glassAbsX - margin,
            glassAbsY - margin,
            glassW + margin * 2,
            glassH + margin * 2,
        ];

        const sceneFps = Math.max(
            15,
            Math.min(
                60,
                this._manager._appearance?.sceneFps ?? 30
            )
        );
        const nowUs = GLib.get_monotonic_time();
        const intervalUs = 1000000 / sceneFps;
        const sceneDue =
            geometryChanged ||
            rootChanged ||
            this._lastSceneSyncUs === 0 ||
            nowUs - this._lastSceneSyncUs >= intervalUs;

        if (sceneDue) {
            this._sceneManager?.setOffset?.(
                -monitorX,
                -monitorY
            );
            this._sceneManager?.setCullRect?.(captureRect);
            this._sceneManager?.applyBgCloneClip?.(captureRect);
            this._sceneManager?.sync?.();
            this._lastSceneSyncUs = nowUs;
        }

        if (this._root.opacity !== opacity)
            this._root.opacity = opacity;

        if (
            this._dateInnerRoot &&
            this._dateInnerRoot.opacity !== opacity
        ) {
            this._dateInnerRoot.opacity = opacity;
        }

        if (!this._root.visible)
            this._root.show?.();

        if (
            this._dateInnerRoot &&
            this._dateInnerRegionCount > 0 &&
            !this._dateInnerRoot.visible
        ) {
            this._dateInnerRoot.show?.();
        }
    }

    _syncShaderGeometry() {
        if (
            this._destroyed ||
            !this._effect ||
            !this._root?.mapped
        ) {
            return;
        }

        this._sync(true);
    }

    detach() {
        if (this._destroyed)
            return;
        this._destroyed = true;

        this._cancelDateTextSample();

        try {
            this._effect?.setLiveGeometryHook?.(null);
        } catch {}
        try {
            this._dateInnerEffect?.setLiveGeometryHook?.(null);
        } catch {}

        if (this._openStateId && this._menu) {
            try {
                this._menu.disconnect(this._openStateId);
            } catch {}
        }
        this._openStateId = 0;

        try {
            if (
                this._nativeBoxPointerBorder &&
                this._nativeBoxPointerBorderOpacity !== null
            ) {
                this._nativeBoxPointerBorder.opacity =
                    this._nativeBoxPointerBorderOpacity;
                this._nativeBoxPointerBorder.queue_repaint?.();
            }
        } catch {}

        try {
            this._box?.remove_style_class_name?.(GLASS_CLASS);
            this._box?.remove_style_class_name?.(DATE_TEXT_LIGHT_CLASS);
            this._box?.remove_style_class_name?.(DATE_TEXT_DARK_CLASS);

            for (const actor of this._dateCardActors) {
                try {
                    actor.remove_style_class_name?.(
                        DATE_CARD_TEXT_LIGHT_CLASS
                    );
                    actor.remove_style_class_name?.(
                        DATE_CARD_TEXT_DARK_CLASS
                    );
                    actor.remove_style_class_name?.(
                        QUICK_CARD_TEXT_LIGHT_CLASS
                    );
                    actor.remove_style_class_name?.(
                        QUICK_CARD_TEXT_DARK_CLASS
                    );
                    actor.remove_style_class_name?.(
                        QUICK_ACTIVE_CLASS
                    );
                } catch {}
            }
            this._boxPointer?.remove_style_class_name?.(SHELL_CLASS);
            this._boxPointer?.remove_style_class_name?.(DATE_SHELL_CLASS);
            this._boxPointer?.remove_style_class_name?.(QUICK_SHELL_CLASS);
            this._menu?.actor?.remove_style_class_name?.(
                QUICK_ROOT_CLASS
            );
        } catch {}

        // Destroy the clone layer before its source (root).
        try {
            this._dateInnerRoot?.destroy?.();
        } catch {}

        try {
            this._sceneManager?.destroy?.();
        } catch {}

        try {
            this._root?.destroy?.();
        } catch {}

        this._root = null;
        this._liquidBox = null;
        this._sceneManager = null;
        this._filterLayer = null;
        this._effect = null;
        this._dateInnerRoot = null;
        this._dateInnerLiquidBox = null;
        this._dateInnerClone = null;
        this._dateInnerEffect = null;
        this._dateCardActors = [];
        this._dateCardResponses.clear();
        this._dateCardTextState.clear();
        this._quickSelectedState.clear();
        this._dateInnerRegionCount = 0;
        this._dateScreenshot = null;
        this._menu = null;
        this._box = null;
        this._boxPointer = null;
        this._paintRoot = null;
        this._nativeBoxPointerBorder = null;
        this._nativeBoxPointerBorderOpacity = null;
        this._bin = null;
    }
}

export class PopupGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;
        this._surfaces = new Map();
        this._enabled = false;
        this._originalOpen = null;
        this._originalDestroy = null;
        this._patchedOpen = null;
        this._patchedDestroy = null;
        this._appearance = null;
        this._stageSyncId = 0;
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._appearance = this._readAppearance();

        const prototype = PopupMenu.PopupMenu.prototype;

        this._originalOpen =
            prototype.open?._veloraOriginalOpen ??
            prototype.open;
        this._originalDestroy =
            prototype.destroy?._veloraOriginalDestroy ??
            prototype.destroy;

        const manager = this;

        this._patchedOpen = function (...args) {
            if (manager._enabled)
                manager.attach(this);
            return manager._originalOpen.apply(this, args);
        };

        this._patchedDestroy = function (...args) {
            manager.detach(this);
            return manager._originalDestroy.apply(this, args);
        };

        this._patchedOpen._veloraOriginalOpen =
            this._originalOpen;
        this._patchedDestroy._veloraOriginalDestroy =
            this._originalDestroy;

        prototype.open = this._patchedOpen;
        prototype.destroy = this._patchedDestroy;

        this._stageSyncId = global.stage.connect(
            'before-update',
            () => {
                if (!this._enabled)
                    return;

                for (const [menu, surface] of [...this._surfaces]) {
                    if (menu?.isOpen === false)
                        continue;

                    try {
                        surface.syncFrame();
                    } catch (error) {
                        console.error(
                            '[Velora][PopupGlass] frame sync failed; restoring native popup: ' +
                            error +
                            '\n' +
                            (error?.stack ?? '')
                        );
                        this.detach(menu);
                    }
                }
            }
        );

        console.log(
            '[Velora][PopupGlass] global PopupMenu adapter active'
        );
    }

    describeMenu(menu) {
        if (!menu)
            return 'unknown-menu';

        const boxClasses =
            menu.box?.get_style_class_name?.() ??
            menu.box?.style_class ??
            '';
        const sourceName =
            menu.sourceActor?.get_name?.() ??
            menu.sourceActor?.constructor?.name ??
            '';

        return (
            (sourceName ? sourceName + ' ' : '') +
            '[' + boxClasses + ']'
        ).trim();
    }

    attach(menu) {
        if (!this._enabled || !menu)
            return null;

        const existing = this._surfaces.get(menu);
        if (existing)
            return existing;

        const surface = new PopupGlassSurface(this, menu);
        if (!surface.attach())
            return null;

        this._surfaces.set(menu, surface);
        return surface;
    }

    detach(menu) {
        const surface = this._surfaces.get(menu);
        if (!surface)
            return;

        this._surfaces.delete(menu);
        surface.detach();
    }

    updateAppearance(state = this._readAppearance()) {
        this._appearance = state;
        for (const surface of this._surfaces.values())
            surface.updateAppearance(state);
    }

    cleanup() {
        if (!this._enabled)
            return;

        this._enabled = false;

        if (this._stageSyncId) {
            try {
                global.stage.disconnect(this._stageSyncId);
            } catch {}
            this._stageSyncId = 0;
        }

        const prototype = PopupMenu.PopupMenu.prototype;
        if (prototype.open === this._patchedOpen)
            prototype.open = this._originalOpen;
        if (prototype.destroy === this._patchedDestroy)
            prototype.destroy = this._originalDestroy;

        for (const [menu, surface] of [...this._surfaces]) {
            this._surfaces.delete(menu);
            surface.detach();
        }

        this._originalOpen = null;
        this._originalDestroy = null;
        this._patchedOpen = null;
        this._patchedDestroy = null;
        this._appearance = null;

        console.log(
            '[Velora][PopupGlass] global PopupMenu adapter stopped'
        );
    }
}
