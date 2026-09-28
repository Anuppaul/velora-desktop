import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ControlsState} from 'resource:///org/gnome/shell/ui/overviewControls.js';

import {collectDockApps} from './apps.js';
import {DockController} from './dock.js';
import {
    allocateAcrossRings,
    arcForPosition,
    clamp,
    effectiveRingGap,
    ICON_HOVER_SCALE,
    selectEvenlySpacedSlots,
    slotsForRings,
    totalCapacity,
} from './geometry.js';

const DEFAULT_ORB_ICON = 'start-here-symbolic';
const FALLBACK_ORB_ICON = 'view-app-grid-symbolic';
const ORB_AUTO_HIDE_REVEAL_PX = 7;
const SCREEN_MARGIN = 8;

export default class VeloraRuntime extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._shellSettings = new Gio.Settings({schema_id: 'org.gnome.shell'});
        this._appSystem = Shell.AppSystem.get_default();
        this._dock = new DockController(this._settings);
        this._radialActors = [];
        this._closingActors = new Set();
        this._tooltip = null;
        this._menuOpen = false;
        this._dragging = false;
        this._openTimeoutId = 0;
        this._closeTimeoutId = 0;
        this._orbAutoHideTimeoutId = 0;
        this._orbHidden = false;
        this._suppressClickUntil = 0;
        this._writingOrbPosition = false;
        this._dragCurrentX = 0;
        this._dragCurrentY = 0;
        this._dragGrab = null;

        this._createLayer();
        this._createOrb();
        this._connectSignals();
        this._dock.apply(this._settings.get_boolean('hide-ubuntu-dock'));
        this._syncOrbFromSettings();
        this._scheduleOrbAutoHide();
    }

    disable() {
        this._cancelOpenTimer();
        this._cancelCloseTimer();
        this._cancelOrbAutoHideTimer();
        this._closeMenu(true);
        this._destroyClosingActors();
        this._dock?.destroy();

        if (this._settings && this._settingsChangedId)
            this._settings.disconnect(this._settingsChangedId);
        if (this._shellSettings && this._favoritesChangedId)
            this._shellSettings.disconnect(this._favoritesChangedId);
        if (this._appSystem && this._installedChangedId)
            this._appSystem.disconnect(this._installedChangedId);
        if (this._appSystem && this._appStateChangedId)
            this._appSystem.disconnect(this._appStateChangedId);
        if (this._monitorsChangedId)
            Main.layoutManager.disconnect(this._monitorsChangedId);

        if (this._dragGrab) {
            const dragGrab = this._dragGrab;
            this._dragGrab = null;
            this._dragging = false;
            dragGrab.dismiss();
        }

        this._layer?.destroy();
        this._layer = null;
        this._orb = null;
        this._orbMark = null;
        this._panGesture = null;
        this._tooltip = null;
        this._radialActors = [];
        this._closingActors.clear();
        this._closingActors = null;
        this._dock = null;
        this._appSystem = null;
        this._shellSettings = null;
        this._settings = null;
    }

    _createLayer() {
        this._layer = new St.Widget({
            name: 'velora-desktop-layer',
            reactive: false,
            x: 0,
            y: 0,
            layout_manager: new Clutter.FixedLayout(),
        });
        Main.uiGroup.add_child(this._layer);
        this._syncLayerSize();
    }

    _createOrb() {
        this._orbMark = new St.Icon({
            icon_name: DEFAULT_ORB_ICON,
            fallback_icon_name: FALLBACK_ORB_ICON,
            icon_size: 24,
            style_class: 'velora-orb-mark',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._orb = new St.Button({
            style_class: 'velora-orb',
            accessible_name: 'Velora',
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: this._orbMark,
        });
        this._layer.add_child(this._orb);
        this._applyOrbAppearance();

        this._orb.connect('notify::hover', () => {
            if (this._dragging)
                return;

            if (this._orb.get_hover()) {
                this._revealOrb();
                this._cancelOrbAutoHideTimer();
                this._scheduleOpen();
            } else {
                this._scheduleClose();
                this._scheduleOrbAutoHide();
            }
        });

        this._orb.connect('clicked', () => {
            if (GLib.get_monotonic_time() < this._suppressClickUntil)
                return;

            this._revealOrb();
            this._showAllApps();
        });

        this._panGesture = new Clutter.PanGesture();
        this._panGesture.set_required_button(Clutter.BUTTON_PRIMARY);
        this._panGesture.set_begin_threshold(2);
        this._orb.add_action(this._panGesture);

        this._panGesture.connect('recognize', () => {
            const [x, y] = this._orb.get_position();
            this._dragCurrentX = x;
            this._dragCurrentY = y;
            this._dragging = true;
            this._cancelOpenTimer();
            this._cancelCloseTimer();
            this._cancelOrbAutoHideTimer();
            this._revealOrb();
            this._closeMenu(true);
            this._orb.fake_release();
            this._dragGrab = global.stage.grab(this._orb);
            this._orb.add_style_pseudo_class('dragging');
            return Clutter.EVENT_STOP;
        });

        this._panGesture.connect('pan-update', gesture => {
            if (!this._dragging)
                return;

            const delta = gesture.get_delta_abs();
            const size = this._settings.get_int('orb-size');

            const [nextX, nextY] = this._clampPositionToVisibleMonitor(
                this._dragCurrentX + delta.get_x(),
                this._dragCurrentY + delta.get_y(),
                size
            );

            this._dragCurrentX = nextX;
            this._dragCurrentY = nextY;
            this._orb.set_position(nextX, nextY);
        });

        const finishDrag = () => {
            if (!this._dragging)
                return;

            this._dragging = false;

            if (this._dragGrab) {
                this._dragGrab.dismiss();
                this._dragGrab = null;
            }

            this._orb.remove_style_pseudo_class('dragging');
            this._clampOrbToStage();
            this._storeOrbPosition();
            this._suppressClickUntil = GLib.get_monotonic_time() + 250000;
            this._scheduleOrbAutoHide();
        };

        this._panGesture.connect('end', finishDrag);
        this._panGesture.connect('cancel', finishDrag);
    }

    _connectSignals() {
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'orb-x' || key === 'orb-y') {
                if (!this._writingOrbPosition) {
                    this._syncOrbFromSettings();
                    this._refreshOpenMenu();
                }
                return;
            }

            if (key === 'hide-ubuntu-dock')
                this._dock.apply(this._settings.get_boolean('hide-ubuntu-dock'));

            if (['orb-size', 'orb-opacity', 'orb-icon'].includes(key)) {
                this._applyOrbAppearance();
                this._syncOrbFromSettings();
            }

            if (key === 'auto-hide-orb') {
                if (this._settings.get_boolean('auto-hide-orb'))
                    this._scheduleOrbAutoHide();
                else {
                    this._cancelOrbAutoHideTimer();
                    this._revealOrb();
                }
            }

            if (key === 'auto-hide-delay' && this._settings.get_boolean('auto-hide-orb')) {
                this._cancelOrbAutoHideTimer();
                this._scheduleOrbAutoHide();
            }

            if ([
                'ring-mode',
                'orb-size',
                'icon-size',
                'icon-gap',
                'ring-gap',
                'show-tooltips',
                'show-running-indicator',
                'animation-ms',
            ].includes(key) && this._menuOpen) {
                this._reopenMenu();
            }
        });

        this._favoritesChangedId = this._shellSettings.connect(
            'changed::favorite-apps',
            () => this._refreshOpenMenu()
        );
        this._installedChangedId = this._appSystem.connect(
            'installed-changed',
            () => this._refreshOpenMenu()
        );
        this._appStateChangedId = this._appSystem.connect(
            'app-state-changed',
            () => this._refreshOpenMenu()
        );
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._syncLayerSize();
            this._syncOrbFromSettings();
            this._refreshOpenMenu();
        });
    }

    _syncLayerSize() {
        if (this._layer)
            this._layer.set_size(global.stage.width, global.stage.height);
    }

    _applyOrbAppearance() {
        if (!this._orb)
            return;

        const size = this._settings.get_int('orb-size');
        const opacity = this._settings.get_int('orb-opacity');

        this._orb.set_size(size, size);
        this._orb.opacity = Math.round(opacity * 2.55);
        this._orbMark.set_icon_size(
            Math.max(18, Math.round(size * 0.44))
        );
        this._applyOrbIcon();
    }

    _applyOrbIcon() {
        if (!this._orbMark)
            return;

        const configured =
            this._settings.get_string('orb-icon').trim() || DEFAULT_ORB_ICON;

        this._orbMark.fallback_icon_name = FALLBACK_ORB_ICON;

        if (configured.startsWith('/')) {
            const file = Gio.File.new_for_path(configured);
            if (file.query_exists(null)) {
                this._orbMark.gicon = new Gio.FileIcon({file});
                return;
            }

            this._orbMark.icon_name = DEFAULT_ORB_ICON;
            return;
        }

        if (configured.startsWith('file://')) {
            const file = Gio.File.new_for_uri(configured);
            if (file.query_exists(null)) {
                this._orbMark.gicon = new Gio.FileIcon({file});
                return;
            }

            this._orbMark.icon_name = DEFAULT_ORB_ICON;
            return;
        }

        this._orbMark.icon_name = configured;
    }

    _syncOrbFromSettings() {
        if (!this._orb)
            return;

        const size = this._settings.get_int('orb-size');
        const maxX = Math.max(0, global.stage.width - size);
        const maxY = Math.max(0, global.stage.height - size);

        const desiredX =
            clamp(this._settings.get_double('orb-x'), 0, 1) * maxX;
        const desiredY =
            clamp(this._settings.get_double('orb-y'), 0, 1) * maxY;
        const [x, y] = this._clampPositionToVisibleMonitor(
            desiredX,
            desiredY,
            size
        );

        this._orb.set_position(x, y);

        if (this._orbHidden)
            this._applyOrbHiddenPosition(x, y, size, false);
    }

    _scheduleOrbAutoHide() {
        this._cancelOrbAutoHideTimer();

        if (
            !this._orb ||
            !this._settings.get_boolean('auto-hide-orb') ||
            this._dragging ||
            this._menuOpen ||
            this._orb.get_hover()
        ) {
            return;
        }

        const delay = this._settings.get_int('auto-hide-delay');
        this._orbAutoHideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._orbAutoHideTimeoutId = 0;

                if (
                    !this._orb ||
                    !this._settings.get_boolean('auto-hide-orb') ||
                    this._dragging ||
                    this._menuOpen ||
                    this._orb.get_hover()
                ) {
                    return GLib.SOURCE_REMOVE;
                }

                this._hideOrbToEdge();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelOrbAutoHideTimer() {
        if (this._orbAutoHideTimeoutId) {
            GLib.source_remove(this._orbAutoHideTimeoutId);
            this._orbAutoHideTimeoutId = 0;
        }
    }

    _hideOrbToEdge() {
        if (!this._orb || this._orbHidden)
            return;

        const size = this._settings.get_int('orb-size');
        const [x, y] = this._orb.get_position();

        this._orb.remove_all_transitions();
        this._orbHidden = true;
        this._applyOrbHiddenPosition(x, y, size, true);
    }

    _applyOrbHiddenPosition(x, y, size, animate = false) {
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const monitor = this._nearestMonitor(centerX, centerY);

        const candidates = [
            {
                edge: 'left',
                x: monitor.x - size + ORB_AUTO_HIDE_REVEAL_PX,
                y,
                distance: Math.abs(centerX - monitor.x),
            },
            {
                edge: 'right',
                x: monitor.x + monitor.width - ORB_AUTO_HIDE_REVEAL_PX,
                y,
                distance: Math.abs(monitor.x + monitor.width - centerX),
            },
            {
                edge: 'bottom',
                x,
                y: monitor.y + monitor.height - ORB_AUTO_HIDE_REVEAL_PX,
                distance: Math.abs(monitor.y + monitor.height - centerY),
            },
        ];

        for (const candidate of candidates) {
            candidate.visibleArea = this._visibleAreaAcrossMonitors(
                candidate.x,
                candidate.y,
                size
            );
        }

        candidates.sort((a, b) =>
            a.visibleArea - b.visibleArea ||
            a.distance - b.distance
        );

        const target = candidates[0];

        this._orb.remove_all_transitions();

        if (animate) {
            this._orb.ease({
                x: target.x,
                y: target.y,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._orb.set_position(target.x, target.y);
        }
    }

    _visibleAreaAcrossMonitors(x, y, size) {
        let visibleArea = 0;

        for (const monitor of Main.layoutManager.monitors) {
            const left = Math.max(x, monitor.x);
            const top = Math.max(y, monitor.y);
            const right = Math.min(x + size, monitor.x + monitor.width);
            const bottom = Math.min(y + size, monitor.y + monitor.height);

            if (right > left && bottom > top)
                visibleArea += (right - left) * (bottom - top);
        }

        return visibleArea;
    }

    _revealOrb() {
        if (!this._orb || !this._orbHidden)
            return;

        this._orb.remove_all_transitions();
        this._orbHidden = false;
        this._syncOrbFromSettings();
    }

    _clampOrbToStage() {
        const [x, y] = this._orb.get_position();
        const size = this._settings.get_int('orb-size');
        const [safeX, safeY] = this._clampPositionToVisibleMonitor(
            x,
            y,
            size
        );

        this._orb.set_position(safeX, safeY);
    }

    _clampPositionToVisibleMonitor(x, y, size) {
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const monitor = this._nearestMonitor(centerX, centerY);

        const minX = monitor.x;
        const minY = monitor.y;
        const maxX = Math.max(minX, monitor.x + monitor.width - size);
        const maxY = Math.max(minY, monitor.y + monitor.height - size);

        return [
            clamp(x, minX, maxX),
            clamp(y, minY, maxY),
        ];
    }

    _nearestMonitor(x, y) {
        const monitors = Main.layoutManager.monitors;
        if (!monitors || monitors.length === 0) {
            return {
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
            };
        }

        let nearest = monitors[0];
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const monitor of monitors) {
            if (
                x >= monitor.x &&
                x < monitor.x + monitor.width &&
                y >= monitor.y &&
                y < monitor.y + monitor.height
            ) {
                return monitor;
            }

            const dx =
                x < monitor.x
                    ? monitor.x - x
                    : x >= monitor.x + monitor.width
                        ? x - (monitor.x + monitor.width)
                        : 0;
            const dy =
                y < monitor.y
                    ? monitor.y - y
                    : y >= monitor.y + monitor.height
                        ? y - (monitor.y + monitor.height)
                        : 0;
            const distance = dx * dx + dy * dy;

            if (distance < nearestDistance) {
                nearest = monitor;
                nearestDistance = distance;
            }
        }

        return nearest;
    }

    _storeOrbPosition() {
        const [x, y] = this._orb.get_position();
        const size = this._settings.get_int('orb-size');
        const maxX = Math.max(1, global.stage.width - size);
        const maxY = Math.max(1, global.stage.height - size);

        this._writingOrbPosition = true;
        try {
            this._settings.set_double('orb-x', clamp(x / maxX, 0, 1));
            this._settings.set_double('orb-y', clamp(y / maxY, 0, 1));
        } finally {
            this._writingOrbPosition = false;
        }
    }

    _showAllApps() {
        this._cancelOpenTimer();
        this._cancelCloseTimer();
        this._closeMenu(true);

        const showAppsButton = Main.overview?.dash?.showAppsButton;
        if (!showAppsButton) {
            logError(
                new Error('GNOME Applications button is unavailable'),
                'Velora Desktop: failed to open Applications view'
            );
            return;
        }

        if (Main.overview.visible && showAppsButton.checked) {
            showAppsButton.checked = false;
            Main.overview.hide();
            return;
        }

        Main.overview.show(ControlsState.APP_GRID);
    }

    _scheduleOpen() {
        this._cancelCloseTimer();
        if (this._menuOpen || this._openTimeoutId)
            return;

        const delay = this._settings.get_int('hover-delay');
        if (delay <= 0) {
            this._openMenu();
            return;
        }

        this._openTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._openTimeoutId = 0;
                if (!this._dragging && this._orb?.get_hover())
                    this._openMenu();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _scheduleClose() {
        this._cancelOpenTimer();
        if (!this._menuOpen || this._closeTimeoutId)
            return;

        this._closeTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            this._settings.get_int('close-delay'),
            () => {
                this._closeTimeoutId = 0;
                this._closeMenu();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelOpenTimer() {
        if (this._openTimeoutId) {
            GLib.source_remove(this._openTimeoutId);
            this._openTimeoutId = 0;
        }
    }

    _cancelCloseTimer() {
        if (this._closeTimeoutId) {
            GLib.source_remove(this._closeTimeoutId);
            this._closeTimeoutId = 0;
        }
    }

    _openMenu() {
        this._cancelOpenTimer();
        this._cancelCloseTimer();
        this._cancelOrbAutoHideTimer();
        this._revealOrb();

        if (this._menuOpen || this._dragging)
            return;

        this._destroyClosingActors();

        const requestedApps = collectDockApps(
            this._appSystem,
            this._shellSettings
        );
        if (requestedApps.length === 0)
            return;

        this._menuOpen = true;
        this._orb.add_style_pseudo_class('open');

        const orbSize = this._settings.get_int('orb-size');
        const iconSize = this._settings.get_int('icon-size');
        const iconGap = this._settings.get_int('icon-gap');
        const ringGap = effectiveRingGap(
            iconSize,
            this._settings.get_int('ring-gap')
        );
        const animationMs = this._settings.get_int('animation-ms');
        const [orbX, orbY] = this._orb.get_position();
        const centerX = orbX + orbSize / 2;
        const centerY = orbY + orbSize / 2;
        const monitor = this._monitorAt(centerX, centerY);
        const configuredRingMode = this._settings.get_string('ring-mode');
        const ringMode = ['auto', '2', '3', '4'].includes(configuredRingMode)
            ? configuredRingMode
            : 'auto';

        let rings = ringMode === 'auto' ? 2 : Number(ringMode);
        let slotRings = null;
        let capacities = null;

        for (let candidate = rings; candidate <= 4; candidate++) {
            const outerRadius = orbSize / 2 + candidate * ringGap;
            const candidateArc = arcForPosition(
                centerX,
                centerY,
                outerRadius,
                iconSize,
                monitor
            );
            const candidateSlotRings = slotsForRings(
                centerX,
                centerY,
                orbSize,
                ringGap,
                candidate,
                candidateArc,
                iconSize,
                iconGap,
                monitor,
                SCREEN_MARGIN
            );
            const candidateCapacities = candidateSlotRings.map(
                slots => slots.length
            );

            rings = candidate;
            slotRings = candidateSlotRings;
            capacities = candidateCapacities;

            if (
                ringMode !== 'auto' ||
                totalCapacity(capacities) >= requestedApps.length
            ) {
                break;
            }
        }

        const visibleCapacity = totalCapacity(capacities);
        if (visibleCapacity === 0) {
            this._menuOpen = false;
            this._orb.remove_style_pseudo_class('open');
            return;
        }

        const apps = requestedApps.slice(0, visibleCapacity);
        const counts = allocateAcrossRings(apps.length, capacities);

        let appIndex = 0;
        for (let ring = 0; ring < rings; ring++) {
            const count = counts[ring];
            const selectedSlots = selectEvenlySpacedSlots(
                slotRings[ring],
                count
            );

            for (const slot of selectedSlots) {
                if (appIndex >= apps.length)
                    break;

                const actor = this._createAppButton(
                    apps[appIndex],
                    iconSize
                );
                actor.set_position(
                    centerX - iconSize / 2,
                    centerY - iconSize / 2
                );
                actor.opacity = 0;
                actor.scale_x = 0.35;
                actor.scale_y = 0.35;
                this._layer.add_child(actor);
                this._radialActors.push(actor);

                if (animationMs <= 0) {
                    actor.set_position(slot.x, slot.y);
                    actor.opacity = 255;
                    actor.scale_x = 1;
                    actor.scale_y = 1;
                } else {
                    actor.ease({
                        x: slot.x,
                        y: slot.y,
                        opacity: 255,
                        scale_x: 1,
                        scale_y: 1,
                        duration: animationMs,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }

                appIndex++;
            }
        }
    }

    _createAppButton(app, iconSize) {
        const running = app.get_state() !== Shell.AppState.STOPPED;
        const textureSize = Math.max(20, iconSize - 10);
        const content = new St.Widget({
            style_class: 'velora-app-content',
            layout_manager: new Clutter.FixedLayout(),
        });
        content.set_size(iconSize, iconSize);

        const icon = app.create_icon_texture(textureSize);
        icon.set_position(
            (iconSize - textureSize) / 2,
            (iconSize - textureSize) / 2 - 1
        );
        content.add_child(icon);

        if (
            running &&
            this._settings.get_boolean('show-running-indicator')
        ) {
            const dot = new St.Widget({
                style_class: 'velora-running-dot',
                reactive: false,
            });
            dot.set_size(5, 5);
            dot.set_position(
                (iconSize - 5) / 2,
                iconSize - 7
            );
            content.add_child(dot);
        }

        const button = new St.Button({
            style_class: 'velora-app-button',
            accessible_name: app.get_name(),
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: content,
        });
        button.set_size(iconSize, iconSize);
        button.set_pivot_point(0.5, 0.5);

        button.connect('notify::hover', () => {
            if (button.get_hover()) {
                this._cancelCloseTimer();
                button.ease({
                    scale_x: ICON_HOVER_SCALE,
                    scale_y: ICON_HOVER_SCALE,
                    duration: 110,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });

                if (this._settings.get_boolean('show-tooltips'))
                    this._showTooltip(app.get_name(), button);
            } else {
                this._hideTooltip();
                button.ease({
                    scale_x: 1,
                    scale_y: 1,
                    duration: 110,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                this._scheduleClose();
            }
        });

        button.connect('clicked', () => {
            this._hideTooltip();
            this._closeMenu();
            Main.overview.hide();
            app.activate();
        });

        return button;
    }

    _closeMenu(immediate = false) {
        this._cancelOpenTimer();
        this._cancelCloseTimer();
        this._hideTooltip();

        if (!this._menuOpen && this._radialActors.length === 0) {
            this._scheduleOrbAutoHide();
            return;
        }

        this._menuOpen = false;
        this._orb?.remove_style_pseudo_class('open');
        const actors = this._radialActors;
        this._radialActors = [];

        if (!this._orb || immediate) {
            for (const actor of actors)
                actor.destroy();
            this._scheduleOrbAutoHide();
            return;
        }

        const duration = Math.min(
            150,
            this._settings.get_int('animation-ms')
        );
        const orbSize = this._settings.get_int('orb-size');
        const iconSize = this._settings.get_int('icon-size');
        const [orbX, orbY] = this._orb.get_position();
        const targetX = orbX + orbSize / 2 - iconSize / 2;
        const targetY = orbY + orbSize / 2 - iconSize / 2;

        for (const actor of actors) {
            if (duration <= 0) {
                actor.destroy();
                continue;
            }

            this._closingActors.add(actor);
            actor.ease({
                x: targetX,
                y: targetY,
                opacity: 0,
                scale_x: 0.35,
                scale_y: 0.35,
                duration,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    this._closingActors?.delete(actor);
                    actor.destroy();
                },
            });
        }

        this._scheduleOrbAutoHide();
    }

    _destroyClosingActors() {
        if (!this._closingActors || this._closingActors.size === 0)
            return;

        for (const actor of this._closingActors) {
            actor.remove_all_transitions();
            actor.destroy();
        }

        this._closingActors.clear();
    }

    _reopenMenu() {
        this._closeMenu(true);
        this._openMenu();
    }

    _refreshOpenMenu() {
        if (this._menuOpen)
            this._reopenMenu();
    }

    _monitorAt(x, y) {
        for (const monitor of Main.layoutManager.monitors) {
            if (
                x >= monitor.x &&
                x < monitor.x + monitor.width &&
                y >= monitor.y &&
                y < monitor.y + monitor.height
            ) {
                return monitor;
            }
        }

        return Main.layoutManager.primaryMonitor ?? {
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        };
    }

    _showTooltip(text, actor) {
        this._hideTooltip();

        this._tooltip = new St.Label({
            text,
            style_class: 'velora-tooltip',
            reactive: false,
        });
        this._layer.add_child(this._tooltip);

        const [x, y] = actor.get_transformed_position();
        const [, width] = this._tooltip.get_preferred_width(-1);

        this._tooltip.set_position(
            clamp(
                x + actor.width / 2 - width / 2,
                SCREEN_MARGIN,
                global.stage.width - width - SCREEN_MARGIN
            ),
            clamp(
                y + actor.height + 8,
                SCREEN_MARGIN,
                global.stage.height - 38
            )
        );
    }

    _hideTooltip() {
        this._tooltip?.destroy();
        this._tooltip = null;
    }
}
