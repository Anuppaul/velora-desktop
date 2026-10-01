import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const APP_GRID_CLASS = 'apps-scroll-view';
const SEARCH_RESULTS_NAME = 'searchResults';
const OVERVIEW_WALLPAPER_CLASS = 'velora-overview-wallpaper';
const BLUR_RADIUS = 36;
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
        this._stageId = 0;
        this._monitorsId = 0;
        this._scaleId = 0;
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

        this._stageId = global.stage.connect(
            'before-update',
            () => this._syncVisibility()
        );

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
            '[Velora][OverviewBackdrop] native cached wallpaper blur active'
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

    _updateBlur() {
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
                radius: BLUR_RADIUS * scale,
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

    _syncVisibility() {
        if (!this._enabled || !this._layer)
            return;

        const overview =
            Main.layoutManager.overviewGroup;
        let appGrid = this._appGrid;
        let searchResults = this._searchResults;

        if (
            !appGrid?.get_stage?.() ||
            !searchResults?.get_stage?.()
        ) {
            this._findOverviewSurfaces();
            appGrid = this._appGrid;
            searchResults = this._searchResults;
        }

        const searchActive = Boolean(
            Main.overview?.searchController?.searchActive
        );

        // searchActive turns true immediately when GNOME enters find-as-you-
        // type search, before SearchResultsView necessarily has visible result
        // children. Keep the results actor as a transition fallback so closing
        // animations never flash the opaque overview base for one frame.
        const visible = Boolean(
            overview?.visible &&
            overview?.mapped &&
            (
                this._surfaceVisible(appGrid) ||
                searchActive ||
                this._surfaceVisible(searchResults)
            )
        );

        if (visible) {
            overview.add_style_class_name?.(
                OVERVIEW_WALLPAPER_CLASS
            );
            if (!this._layer.visible)
                this._layer.show?.();
        } else {
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

        if (this._stageId) {
            try {
                global.stage.disconnect(this._stageId);
            } catch {}
            this._stageId = 0;
        }

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
