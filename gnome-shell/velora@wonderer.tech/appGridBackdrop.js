import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const APP_GRID_CLASS = 'apps-scroll-view';
const SEARCH_RESULTS_NAME = 'searchResults';
const OVERVIEW_WALLPAPER_CLASS = 'velora-overview-wallpaper';
const BLUR_RADIUS = 36;
const TRANSITION_BLUR_RADIUS = 12;
const BLUR_BRIGHTNESS = 0.82;

function classesOf(actor) {
    return String(
        actor?.get_style_class_name?.() ??
        actor?.style_class ??
        ''
    ).split(/\s+/).filter(Boolean);
}

export class AppGridBackdropManager {
    constructor() {
        this._enabled = false;
        this._layer = null;
        this._backgroundManagers = [];
        this._appGrid = null;
        this._searchResults = null;
        this._visibilitySignals = [];
        this._monitorsId = 0;
        this._scaleId = 0;
        this._settleBlurSourceId = 0;
        this._currentBlurRadius = BLUR_RADIUS;
    }

    setup() {
        if (this._enabled)
            return;

        const overview = Main.layoutManager.overviewGroup;
        if (!overview)
            throw new Error('GNOME overviewGroup unavailable');

        this._enabled = true;
        this._createLayer();
        this._findOverviewSurfaces();

        const connect = (object, signal, callback) => {
            if (!object)
                return;

            try {
                this._visibilitySignals.push({
                    object,
                    id: object.connect(signal, callback),
                });
            } catch {
                // Signal availability varies slightly between Shell builds.
            }
        };

        connect(
            Main.overview,
            'showing',
            () => this._syncVisibility('showing')
        );
        connect(
            Main.overview,
            'shown',
            () => this._syncVisibility('shown')
        );
        connect(
            Main.overview,
            'hiding',
            () => this._syncVisibility('hiding')
        );
        connect(
            Main.overview,
            'hidden',
            () => this._syncVisibility('hidden')
        );
        connect(
            overview,
            'notify::visible',
            () => this._syncVisibility()
        );
        connect(
            overview,
            'notify::mapped',
            () => this._syncVisibility()
        );

        this._syncVisibility();

        this._monitorsId = Main.layoutManager.connect(
            'monitors-changed',
            () => this._rebuildBackgrounds()
        );

        try {
            const themeContext =
                St.ThemeContext.get_for_stage(global.stage);
            this._scaleId = themeContext.connect(
                'notify::scale-factor',
                () => this._updateBlur()
            );
            this._themeContext = themeContext;
        } catch {
            this._themeContext = null;
            this._scaleId = 0;
        }

        console.log(
            '[Velora][OverviewBackdrop] full Overview native wallpaper blur active'
        );
    }

    _createLayer() {
        const overview = Main.layoutManager.overviewGroup;
        const layer = new St.Widget({
            name: 'velora-overview-native-backdrop',
            reactive: false,
            x_expand: true,
            y_expand: true,
        });
        layer.set_size(
            global.stage.width,
            global.stage.height
        );
        layer.hide();

        overview.insert_child_at_index?.(layer, 0);
        this._layer = layer;
        this._rebuildBackgrounds();
    }

    _rebuildBackgrounds() {
        for (const manager of this._backgroundManagers) {
            try {
                manager.destroy();
            } catch {}
        }
        this._backgroundManagers = [];

        try {
            this._layer?.destroy_all_children?.();
        } catch {}

        if (!this._layer)
            return;

        this._layer.set_size(
            global.stage.width,
            global.stage.height
        );

        const monitors =
            Main.layoutManager.monitors ?? [];

        for (let i = 0; i < monitors.length; i++) {
            const monitor = monitors[i];
            const widget = new St.Widget({
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
                reactive: false,
                effect: new Shell.BlurEffect({
                    name: 'velora-overview-native-blur',
                }),
            });

            const manager =
                new Background.BackgroundManager({
                    container: widget,
                    monitorIndex: i,
                    controlPosition: false,
                });

            this._backgroundManagers.push(manager);
            this._layer.add_child(widget);
        }

        this._updateBlur();
    }

    _updateBlur(radius = this._currentBlurRadius) {
        this._currentBlurRadius = radius;

        let scale = 1;
        try {
            scale =
                St.ThemeContext
                    .get_for_stage(global.stage)
                    .scale_factor ?? 1;
        } catch {}

        for (const widget of this._layer?.get_children?.() ?? []) {
            const effect =
                widget.get_effect?.(
                    'velora-overview-native-blur'
                );
            effect?.set?.({
                brightness: BLUR_BRIGHTNESS,
                radius: radius * scale,
            });
        }
    }

    _findOverviewSurfaces() {
        const overview =
            Main.layoutManager.overviewGroup;
        if (!overview)
            return;

        let appGrid = null;
        let searchResults = null;

        const walk = actor => {
            if (
                !actor ||
                (appGrid && searchResults)
            ) {
                return;
            }

            if (
                !appGrid &&
                classesOf(actor).includes(APP_GRID_CLASS)
            ) {
                appGrid = actor;
            }

            if (
                !searchResults &&
                actor.get_name?.() === SEARCH_RESULTS_NAME
            ) {
                searchResults = actor;
            }

            for (const child of actor.get_children?.() ?? [])
                walk(child);
        };

        walk(overview);
        this._appGrid = appGrid;
        this._searchResults = searchResults;
    }

    _surfaceVisible(actor) {
        if (!actor)
            return false;

        return Boolean(
            actor.visible &&
            actor.mapped &&
            (actor.get_paint_opacity?.() ??
                actor.opacity ??
                255) > 8
        );
    }

    _cancelSettledBlur() {
        if (!this._settleBlurSourceId)
            return;

        try {
            GLib.source_remove(
                this._settleBlurSourceId
            );
        } catch {}
        this._settleBlurSourceId = 0;
    }

    _scheduleSettledBlur() {
        this._cancelSettledBlur();

        this._settleBlurSourceId =
            GLib.idle_add(
                GLib.PRIORITY_DEFAULT_IDLE,
                () => {
                    this._settleBlurSourceId = 0;

                    if (
                        this._enabled &&
                        Main.overview?.visible
                    ) {
                        this._updateBlur(
                            BLUR_RADIUS
                        );
                    }

                    return GLib.SOURCE_REMOVE;
                }
            );
    }

    _syncVisibility(phase = null) {
        if (!this._enabled || !this._layer)
            return;

        const overview =
            Main.layoutManager.overviewGroup;
        // One cached native wallpaper blur is the background for the ENTIRE
        // GNOME Overview lifecycle: window picker, search and applications.
        // Keeping this independent of individual child-page visibility also
        // removes the gray/black base and prevents page-transition flashes.
        const visible = Boolean(
            overview?.visible &&
            overview?.mapped &&
            Main.overview?.visible
        );

        if (visible) {
            overview.add_style_class_name?.(
                OVERVIEW_WALLPAPER_CLASS
            );

            if (
                phase === 'showing' ||
                phase === 'hiding'
            ) {
                this._cancelSettledBlur();
                this._updateBlur(
                    TRANSITION_BLUR_RADIUS
                );
            } else if (phase === 'shown') {
                this._scheduleSettledBlur();
            }

            if (!this._layer.visible)
                this._layer.show?.();
        } else {
            this._cancelSettledBlur();
            overview?.remove_style_class_name?.(
                OVERVIEW_WALLPAPER_CLASS
            );
            if (this._layer.visible)
                this._layer.hide?.();
        }
    }

    updateAppearance() {
        // Deliberately no custom optics here. Native cached blur is the
        // performance contract for large Overview/App Grid/Search surfaces.
        this._updateBlur();
    }

    cleanup() {
        if (!this._enabled)
            return;
        this._enabled = false;
        this._cancelSettledBlur();

        for (const {object, id} of this._visibilitySignals) {
            try {
                object?.disconnect?.(id);
            } catch {}
        }
        this._visibilitySignals = [];

        if (this._monitorsId) {
            try {
                Main.layoutManager.disconnect(this._monitorsId);
            } catch {}
            this._monitorsId = 0;
        }

        if (this._scaleId && this._themeContext) {
            try {
                this._themeContext.disconnect(this._scaleId);
            } catch {}
        }
        this._scaleId = 0;
        this._themeContext = null;

        Main.layoutManager.overviewGroup
            ?.remove_style_class_name?.(
                OVERVIEW_WALLPAPER_CLASS
            );

        for (const manager of this._backgroundManagers) {
            try {
                manager.destroy();
            } catch {}
        }
        this._backgroundManagers = [];

        try {
            this._layer?.destroy?.();
        } catch {}
        this._layer = null;
        this._appGrid = null;
        this._searchResults = null;

        console.log(
            '[Velora][OverviewBackdrop] stopped'
        );
    }
}
