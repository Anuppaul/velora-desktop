import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Keyboard from 'resource:///org/gnome/shell/ui/status/keyboard.js';

const KEYBINDING_NAME = 'spotlight-keybinding';
const INPUT_SOURCE_KEYBINDING = 'switch-input-source';
const INPUT_SOURCE_SCHEMA = 'org.gnome.desktop.wm.keybindings';
const MAX_RESULTS = 6;
const CARD_MAX_WIDTH = 720;
const CARD_MIN_WIDTH = 460;
const CARD_MARGIN = 32;
const SEARCH_BAR_HEIGHT = 64;

function isSuperSpace(accelerator) {
    return String(accelerator ?? '')
        .replace(/\s+/g, '')
        .toLowerCase() === '<super>space';
}

function safeDescription(app) {
    try {
        return (
            app?.get_app_info?.()?.get_description?.() ??
            ''
        ).trim();
    } catch {
        return '';
    }
}

export class SpotlightSearchController {
    constructor(params) {
        this._settings = params.settings;
        this._appSystem =
            params.appSystem ??
            Shell.AppSystem.get_default();
        this._beforeOpen =
            params.beforeOpen ?? null;

        this._enabled = false;
        this._visible = false;

        this._layer = null;
        this._card = null;
        this._entry = null;
        this._resultsBox = null;
        this._emptyLabel = null;

        this._resultApps = [];
        this._resultButtons = [];
        this._selectedIndex = -1;

        this._modalGrab = null;
        this._overviewHiddenId = 0;
        this._pendingOpen = false;

        this._settingsChangedId = 0;
        this._monitorsChangedId = 0;
        this._installedChangedId = 0;

        this._wmKeySettings = null;
        this._inputSourceManager = null;
        this._spotlightKeybindingInstalled = false;
        this._removedInputSourceBinding = false;
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._wmKeySettings =
            new Gio.Settings({
                schema_id: INPUT_SOURCE_SCHEMA,
            });

        try {
            this._inputSourceManager =
                Keyboard.getInputSourceManager?.() ??
                null;
        } catch {
            this._inputSourceManager = null;
        }

        this._settingsChangedId =
            this._settings.connect(
                'changed',
                (_settings, key) => {
                    if (
                        key === 'spotlight-enabled' ||
                        key === KEYBINDING_NAME
                    ) {
                        this._syncShortcut();
                    }
                }
            );

        this._monitorsChangedId =
            Main.layoutManager.connect(
                'monitors-changed',
                () => {
                    if (this._visible)
                        this._syncGeometry();
                }
            );

        this._installedChangedId =
            this._appSystem.connect(
                'installed-changed',
                () => {
                    if (this._visible)
                        this._updateResults();
                }
            );

        this._syncShortcut();
    }

    _syncShortcut() {
        this._uninstallShortcut();

        if (
            !this._enabled ||
            !this._settings.get_boolean(
                'spotlight-enabled'
            )
        ) {
            this.close(true);
            return;
        }

        let inputSourceUsesSuperSpace = false;
        try {
            inputSourceUsesSuperSpace =
                this._wmKeySettings
                    .get_strv(INPUT_SOURCE_KEYBINDING)
                    .some(isSuperSpace);
        } catch {}

        if (inputSourceUsesSuperSpace) {
            try {
                Main.wm.removeKeybinding(
                    INPUT_SOURCE_KEYBINDING
                );
                this._removedInputSourceBinding = true;
            } catch {
                this._removedInputSourceBinding = false;
            }
        }

        try {
            // Clean up a stale hot-swap binding before registering the current
            // runtime's handler.
            Main.wm.removeKeybinding(
                KEYBINDING_NAME
            );
        } catch {}

        let action = Meta.KeyBindingAction.NONE;
        try {
            action = Main.wm.addKeybinding(
                KEYBINDING_NAME,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW,
                () => this.toggle()
            );
        } catch {
            action = Meta.KeyBindingAction.NONE;
        }

        this._spotlightKeybindingInstalled =
            action !== Meta.KeyBindingAction.NONE;

        if (!this._spotlightKeybindingInstalled) {
            this._restoreInputSourceBinding();
            console.error(
                '[Velora][Spotlight] unable to register Super+Space'
            );
        }
    }

    _uninstallShortcut() {
        if (this._spotlightKeybindingInstalled) {
            try {
                Main.wm.removeKeybinding(
                    KEYBINDING_NAME
                );
            } catch {}
        }
        this._spotlightKeybindingInstalled = false;

        this._restoreInputSourceBinding();
    }

    _restoreInputSourceBinding() {
        if (!this._removedInputSourceBinding)
            return;

        try {
            const inputSourceManager =
                this._inputSourceManager ??
                Keyboard.getInputSourceManager?.() ??
                null;

            if (
                inputSourceManager &&
                typeof inputSourceManager
                    ._switchInputSource === 'function'
            ) {
                Main.wm.addKeybinding(
                    INPUT_SOURCE_KEYBINDING,
                    this._wmKeySettings,
                    Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.ALL,
                    inputSourceManager
                        ._switchInputSource
                        .bind(inputSourceManager)
                );
            }
        } catch (error) {
            console.error(
                '[Velora][Spotlight] failed to restore input-source shortcut: ' +
                error
            );
        }

        this._removedInputSourceBinding = false;
    }

    toggle() {
        if (!this._enabled)
            return;

        if (this._visible || this._pendingOpen) {
            this.close();
            return;
        }

        if (Main.overview?.visible) {
            this._pendingOpen = true;

            if (!this._overviewHiddenId) {
                this._overviewHiddenId =
                    Main.overview.connect(
                        'hidden',
                        () => {
                            if (this._overviewHiddenId) {
                                Main.overview.disconnect(
                                    this._overviewHiddenId
                                );
                                this._overviewHiddenId = 0;
                            }

                            if (
                                !this._enabled ||
                                !this._pendingOpen
                            ) {
                                return;
                            }

                            this._pendingOpen = false;
                            this._open();
                        }
                    );
            }

            Main.overview.hide();
            return;
        }

        this._open();
    }

    _open() {
        if (
            !this._enabled ||
            this._visible ||
            !this._settings.get_boolean(
                'spotlight-enabled'
            )
        ) {
            return;
        }

        this._pendingOpen = false;

        try {
            this._beforeOpen?.();
        } catch {}

        this._ensureUi();
        this._syncGeometry();
        this._clearSearch();

        this._visible = true;
        this._layer.opacity = 0;
        this._card.scale_x = 0.985;
        this._card.scale_y = 0.985;
        this._layer.show();

        try {
            this._modalGrab =
                Main.pushModal(
                    this._layer,
                    {
                        actionMode:
                            Shell.ActionMode.NORMAL |
                            Shell.ActionMode.OVERVIEW,
                    }
                );
        } catch {
            this._modalGrab = null;
        }

        this._entry.grab_key_focus();
        this._entry.clutter_text
            ?.set_cursor_visible?.(true);

        this._layer.ease({
            opacity: 255,
            duration: 90,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._card.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 130,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close(immediate = false) {
        this._pendingOpen = false;

        if (this._overviewHiddenId) {
            try {
                Main.overview.disconnect(
                    this._overviewHiddenId
                );
            } catch {}
            this._overviewHiddenId = 0;
        }

        if (!this._visible) {
            if (this._layer)
                this._layer.hide();
            return;
        }

        this._visible = false;

        if (this._modalGrab) {
            try {
                Main.popModal(
                    this._modalGrab
                );
            } catch {}
            this._modalGrab = null;
        }

        if (!this._layer)
            return;

        if (immediate) {
            this._layer.remove_all_transitions?.();
            this._card?.remove_all_transitions?.();
            this._layer.hide();
            this._clearSearch();
            return;
        }

        this._layer.ease({
            opacity: 0,
            duration: 80,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._visible) {
                    this._layer?.hide?.();
                    this._clearSearch();
                }
            },
        });
    }

    _ensureUi() {
        if (this._layer)
            return;

        this._layer = new St.Widget({
            name: 'velora-spotlight-layer',
            style_class: 'velora-spotlight-layer',
            reactive: true,
            can_focus: false,
            layout_manager:
                new Clutter.FixedLayout(),
        });
        this._layer.set_size(
            global.stage.width,
            global.stage.height
        );
        this._layer.hide();

        this._card = new St.BoxLayout({
            name: 'velora-spotlight-card',
            style_class: 'velora-spotlight-card',
            reactive: true,
            vertical: true,
        });
        this._card.set_pivot_point?.(0.5, 0.5);

        this._entry = new St.Entry({
            style_class: 'velora-spotlight-entry',
            hint_text: 'Search applications',
            can_focus: true,
            track_hover: true,
        });
        this._entry.set_primary_icon(
            new St.Icon({
                icon_name: 'system-search-symbolic',
                style_class:
                    'velora-spotlight-search-icon',
            })
        );

        this._resultsBox = new St.BoxLayout({
            style_class: 'velora-spotlight-results',
            vertical: true,
            visible: false,
        });

        this._emptyLabel = new St.Label({
            style_class: 'velora-spotlight-empty',
            text: 'No applications found',
            visible: false,
        });

        this._card.add_child(this._entry);
        this._card.add_child(this._resultsBox);
        this._card.add_child(this._emptyLabel);
        this._layer.add_child(this._card);

        Main.uiGroup.add_child(this._layer);

        this._entry.clutter_text.connect(
            'text-changed',
            () => this._updateResults()
        );

        this._entry.clutter_text.connect(
            'key-press-event',
            (_actor, event) =>
                this._onEntryKeyPress(event)
        );

        this._layer.connect(
            'button-press-event',
            (_actor, event) => {
                let target = null;
                try {
                    target =
                        global.stage
                            .get_event_actor(event);
                } catch {}

                if (
                    target &&
                    this._card?.contains?.(target)
                ) {
                    return Clutter.EVENT_PROPAGATE;
                }

                this.close();
                return Clutter.EVENT_STOP;
            }
        );
    }

    _clearSearch() {
        if (this._entry)
            this._entry.set_text('');

        this._clearResults();
        this._emptyLabel?.hide?.();
    }

    _clearResults() {
        if (!this._resultsBox)
            return;

        for (
            const child of
            this._resultsBox.get_children()
        ) {
            try {
                child.destroy();
            } catch {}
        }

        this._resultApps = [];
        this._resultButtons = [];
        this._selectedIndex = -1;
        this._resultsBox.hide();
    }

    _updateResults() {
        if (
            !this._entry ||
            !this._resultsBox
        ) {
            return;
        }

        const query =
            this._entry.get_text().trim();

        this._clearResults();
        this._emptyLabel?.hide?.();

        if (!query) {
            this._syncGeometry();
            return;
        }

        let groups = [];
        try {
            groups =
                Shell.AppSystem.search(query) ??
                [];
        } catch {
            groups = [];
        }

        const usage =
            Shell.AppUsage.get_default();
        const seen = new Set();
        const apps = [];

        for (const rawGroup of groups) {
            const group = [...rawGroup];

            try {
                group.sort(
                    (a, b) =>
                        usage.compare(a, b)
                );
            } catch {}

            for (const id of group) {
                if (
                    seen.has(id) ||
                    apps.length >= MAX_RESULTS
                ) {
                    continue;
                }

                seen.add(id);

                const app =
                    this._appSystem.lookup_app(id);
                if (!app)
                    continue;

                try {
                    const appInfo =
                        app.get_app_info?.();
                    if (
                        appInfo?.should_show &&
                        !appInfo.should_show()
                    ) {
                        continue;
                    }
                } catch {}

                apps.push(app);
            }

            if (apps.length >= MAX_RESULTS)
                break;
        }

        if (!apps.length) {
            this._emptyLabel?.show?.();
            this._syncGeometry();
            return;
        }

        this._resultApps = apps;

        apps.forEach((app, index) => {
            const button =
                this._createResultButton(
                    app,
                    index
                );
            this._resultButtons.push(button);
            this._resultsBox.add_child(button);
        });

        this._resultsBox.show();
        this._setSelectedIndex(0);
        this._syncGeometry();
    }

    _createResultButton(app, index) {
        const button = new St.Button({
            style_class:
                'velora-spotlight-result',
            can_focus: false,
            reactive: true,
            track_hover: true,
        });

        const row = new St.BoxLayout({
            style_class:
                'velora-spotlight-result-row',
            vertical: false,
            x_expand: true,
        });

        let icon = null;
        try {
            icon =
                app.create_icon_texture(34);
        } catch {}

        if (icon) {
            icon.add_style_class_name?.(
                'velora-spotlight-result-icon'
            );
            row.add_child(icon);
        }

        const labels = new St.BoxLayout({
            style_class:
                'velora-spotlight-result-labels',
            vertical: true,
            x_expand: true,
        });

        const title = new St.Label({
            style_class:
                'velora-spotlight-result-title',
            text: app.get_name?.() ?? '',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        title.clutter_text.ellipsize =
            Pango.EllipsizeMode.END;
        labels.add_child(title);

        const description =
            safeDescription(app);
        if (description) {
            const subtitle = new St.Label({
                style_class:
                    'velora-spotlight-result-subtitle',
                text: description,
                x_expand: true,
                x_align:
                    Clutter.ActorAlign.START,
            });
            subtitle.clutter_text.ellipsize =
                Pango.EllipsizeMode.END;
            labels.add_child(subtitle);
        }

        row.add_child(labels);

        const action = new St.Label({
            style_class:
                'velora-spotlight-result-action',
            text: 'Open',
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(action);

        button.set_child(row);

        button.connect(
            'clicked',
            () => this._activateApp(app)
        );

        button.connect(
            'notify::hover',
            () => {
                if (button.hover)
                    this._setSelectedIndex(index);
            }
        );

        return button;
    }

    _setSelectedIndex(index) {
        if (!this._resultButtons.length) {
            this._selectedIndex = -1;
            return;
        }

        const normalized =
            (
                index %
                this._resultButtons.length +
                this._resultButtons.length
            ) %
            this._resultButtons.length;

        this._selectedIndex = normalized;

        this._resultButtons.forEach(
            (button, buttonIndex) => {
                if (
                    buttonIndex ===
                    normalized
                ) {
                    button.add_style_pseudo_class(
                        'selected'
                    );
                } else {
                    button.remove_style_pseudo_class(
                        'selected'
                    );
                }
            }
        );
    }

    _moveSelection(delta) {
        if (!this._resultButtons.length)
            return;

        const base =
            this._selectedIndex >= 0
                ? this._selectedIndex
                : 0;
        this._setSelectedIndex(
            base + delta
        );
    }

    _onEntryKeyPress(event) {
        const symbol =
            event.get_key_symbol();

        switch (symbol) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;

        case Clutter.KEY_Down:
        case Clutter.KEY_Tab:
            this._moveSelection(1);
            return Clutter.EVENT_STOP;

        case Clutter.KEY_Up:
        case Clutter.KEY_ISO_Left_Tab:
            this._moveSelection(-1);
            return Clutter.EVENT_STOP;

        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
            this._activateSelected();
            return Clutter.EVENT_STOP;

        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _activateSelected() {
        if (
            this._selectedIndex < 0 ||
            this._selectedIndex >=
                this._resultApps.length
        ) {
            return;
        }

        this._activateApp(
            this._resultApps[
                this._selectedIndex
            ]
        );
    }

    _activateApp(app) {
        if (!app)
            return;

        this.close(true);

        try {
            app.activate();
        } catch (error) {
            console.error(
                '[Velora][Spotlight] app activation failed: ' +
                error
            );
        }
    }

    _syncGeometry() {
        if (!this._layer || !this._card)
            return;

        this._layer.set_size(
            global.stage.width,
            global.stage.height
        );

        const monitor =
            Main.layoutManager.currentMonitor ??
            Main.layoutManager.primaryMonitor ??
            {
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
            };

        const width = Math.max(
            CARD_MIN_WIDTH,
            Math.min(
                CARD_MAX_WIDTH,
                monitor.width -
                    CARD_MARGIN * 2
            )
        );

        this._card.set_width(width);

        const x =
            monitor.x +
            Math.round(
                (monitor.width - width) / 2
            );

        // Keep the search field itself centered vertically. Results grow below
        // it, matching the compact Spotlight interaction rather than Overview.
        const y =
            monitor.y +
            Math.round(
                monitor.height / 2 -
                SEARCH_BAR_HEIGHT / 2
            );

        this._card.set_position(x, y);
    }

    destroy() {
        if (!this._enabled)
            return;

        this._enabled = false;
        this.close(true);
        this._uninstallShortcut();

        if (
            this._settings &&
            this._settingsChangedId
        ) {
            try {
                this._settings.disconnect(
                    this._settingsChangedId
                );
            } catch {}
        }
        this._settingsChangedId = 0;

        if (this._monitorsChangedId) {
            try {
                Main.layoutManager.disconnect(
                    this._monitorsChangedId
                );
            } catch {}
        }
        this._monitorsChangedId = 0;

        if (
            this._appSystem &&
            this._installedChangedId
        ) {
            try {
                this._appSystem.disconnect(
                    this._installedChangedId
                );
            } catch {}
        }
        this._installedChangedId = 0;

        try {
            this._layer?.destroy?.();
        } catch {}

        this._layer = null;
        this._card = null;
        this._entry = null;
        this._resultsBox = null;
        this._emptyLabel = null;
        this._resultApps = [];
        this._resultButtons = [];
        this._settings = null;
        this._appSystem = null;
        this._wmKeySettings = null;
        this._inputSourceManager = null;
    }
}
