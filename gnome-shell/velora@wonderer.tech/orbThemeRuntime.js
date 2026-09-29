import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {LiquidGlassIntegration} from './liquidGlassDock.js';

const SINGLETON = '__veloraDesktopActiveRuntime';
const SCHEMA = 'org.gnome.shell.extensions.velora';
const DEFAULT_ICON = 'start-here-symbolic';
const FALLBACK_ICON = 'view-app-grid-symbolic';
const REVEAL = 7;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function settingsFor(uuid) {
    const dir = GLib.build_filenamev([
        GLib.get_user_data_dir(), 'gnome-shell', 'extensions',
        uuid, 'schemas',
    ]);
    const source = Gio.SettingsSchemaSource.new_from_directory(
        dir, Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup(SCHEMA, true);
    if (!schema)
        throw new Error('Velora canonical schema not found');
    return new Gio.Settings({settings_schema: schema});
}

export default class VeloraRuntime extends Extension {
    async enable() {
        globalThis[SINGLETON]?.disable?.();

        this._settings = settingsFor(this.uuid);
        this._dragging = false;
        this._hidden = false;
        this._faded = false;
        this._writingPosition = false;
        this._hideId = 0;
        this._fadeId = 0;
        this._settingsId = 0;
        this._monitorsId = 0;
        this._grab = null;

        this._removeStaleLayer();
        this._layer = new St.Widget({
            name: 'velora-desktop-layer',
            reactive: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        Main.uiGroup.add_child(this._layer);
        this._syncLayer();

        this._glass = new LiquidGlassIntegration({
            veloraSettings: this._settings,
        });
        await this._glass.enable();

        this._setOrbEnabled(this._settings.get_boolean('orb-enabled'));
        this._connect();

        globalThis[SINGLETON] = this;
        console.log('[Velora] Orb + Liquid Glass theme active');
    }

    disable() {
        if (globalThis[SINGLETON] === this)
            delete globalThis[SINGLETON];

        this._cancelTimers();

        if (this._settingsId)
            try { this._settings.disconnect(this._settingsId); } catch {}
        if (this._monitorsId)
            try { Main.layoutManager.disconnect(this._monitorsId); } catch {}

        try { this._grab?.dismiss?.(); } catch {}
        this._grab = null;

        try { this._glass?.disable?.(); } catch (e) {
            logError(e, 'Velora: Liquid Glass cleanup failed');
        }
        try { this._layer?.destroy?.(); } catch {}

        this._layer = null;
        this._orb = null;
        this._face = null;
        this._mark = null;
        this._glass = null;
        this._settings = null;
    }

    _removeStaleLayer() {
        for (const actor of Main.uiGroup.get_children()) {
            if (actor.get_name?.() === 'velora-desktop-layer')
                try { actor.destroy(); } catch {}
        }
    }

    _connect() {
        this._settingsId = this._settings.connect(
            'changed', (_settings, key) => {
                if (key === 'orb-enabled') {
                    this._setOrbEnabled(
                        this._settings.get_boolean('orb-enabled'));
                } else if (key === 'orb-x' || key === 'orb-y') {
                    if (!this._writingPosition)
                        this._syncOrb();
                } else if ([
                    'orb-size', 'orb-opacity', 'orb-icon',
                ].includes(key)) {
                    this._applyOrb();
                    this._syncOrb();
                } else if ([
                    'auto-hide-orb', 'auto-hide-delay',
                    'auto-fade-orb', 'auto-fade-delay',
                ].includes(key)) {
                    this._reveal();
                    this._restoreOpacity(false);
                    this._scheduleTimers();
                }
            });

        this._monitorsId = Main.layoutManager.connect(
            'monitors-changed', () => {
                this._syncLayer();
                this._syncOrb();
            });
    }

    _syncLayer() {
        this._layer?.set_size(global.stage.width, global.stage.height);
    }

    _setOrbEnabled(enabled) {
        if (!enabled) {
            this._cancelTimers();
            try { this._grab?.dismiss?.(); } catch {}
            this._grab = null;
            this._orb?.destroy?.();
            this._orb = this._face = this._mark = null;
            return;
        }
        if (this._orb)
            return;

        const content = new St.Widget({
            style_class: 'velora-orb-content-v2',
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
        });
        this._face = new St.Widget({
            style_class: 'velora-orb-face-v2',
            reactive: false,
        });
        this._mark = new St.Icon({
            icon_name: DEFAULT_ICON,
            fallback_icon_name: FALLBACK_ICON,
            style_class: 'velora-orb-glyph-v2',
            reactive: false,
        });
        content.add_child(this._face);
        content.add_child(this._mark);

        this._orb = new St.Button({
            style_class: 'velora-orb-hitbox-v2',
            accessible_name: 'Velora',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: content,
        });
        this._content = content;
        this._layer.add_child(this._orb);
        this._applyOrb();
        this._syncOrb();

        this._orb.connect('clicked', () => {
            if (!this._dragging)
                Main.overview.showApps();
        });
        this._orb.connect('notify::hover', () => {
            if (this._orb.get_hover()) {
                this._cancelTimers();
                this._reveal();
                this._restoreOpacity(true);
            } else {
                this._scheduleTimers();
            }
        });

        const pan = new Clutter.PanGesture();
        pan.set_required_button(Clutter.BUTTON_PRIMARY);
        pan.set_begin_threshold(2);
        this._orb.add_action(pan);

        pan.connect('recognize', () => {
            this._dragging = true;
            this._cancelTimers();
            this._reveal();
            this._restoreOpacity(false);
            [this._dragX, this._dragY] = this._orb.get_position();
            this._grab = global.stage.grab(this._orb);
            this._face.add_style_pseudo_class('dragging');
            return Clutter.EVENT_STOP;
        });
        pan.connect('pan-update', gesture => {
            if (!this._dragging)
                return;
            const d = gesture.get_delta_abs();
            const size = this._settings.get_int('orb-size');
            [this._dragX, this._dragY] = this._clampToMonitor(
                this._dragX + d.get_x(), this._dragY + d.get_y(), size);
            this._orb.set_position(this._dragX, this._dragY);
        });
        const finish = () => {
            if (!this._dragging)
                return;
            this._dragging = false;
            try { this._grab?.dismiss?.(); } catch {}
            this._grab = null;
            this._face.remove_style_pseudo_class('dragging');
            this._storePosition();
            this._scheduleTimers();
        };
        pan.connect('end', finish);
        pan.connect('cancel', finish);

        this._scheduleTimers();
    }

    _applyOrb() {
        if (!this._orb)
            return;
        const size = this._settings.get_int('orb-size');
        const opacity = this._settings.get_int('orb-opacity');
        const icon = this._settings.get_string('orb-icon').trim();

        this._orb.set_size(size, size);
        this._content.set_size(size, size);
        this._face.set_size(size, size);

        const markSize = Math.max(8, Math.min(size - 6, Math.round(size * .44)));
        const offset = Math.round((size - markSize) / 2);
        this._mark.set_size(markSize, markSize);
        this._mark.set_icon_size(markSize);
        this._mark.set_position(offset, offset);
        this._orb.opacity = this._faded ? 0 : Math.round(opacity * 2.55);

        this._mark.gicon = null;
        this._mark.icon_name = icon || DEFAULT_ICON;
        if (icon.startsWith('/') || icon.startsWith('file://')) {
            const file = icon.startsWith('/')
                ? Gio.File.new_for_path(icon)
                : Gio.File.new_for_uri(icon);
            if (file.query_exists(null)) {
                this._mark.icon_name = null;
                this._mark.gicon = new Gio.FileIcon({file});
            } else {
                this._mark.icon_name = DEFAULT_ICON;
            }
        }
    }

    _syncOrb() {
        if (!this._orb)
            return;
        const size = this._settings.get_int('orb-size');
        const x = clamp(this._settings.get_double('orb-x'), 0, 1) *
            Math.max(0, global.stage.width - size);
        const y = clamp(this._settings.get_double('orb-y'), 0, 1) *
            Math.max(0, global.stage.height - size);
        const [cx, cy] = this._clampToMonitor(x, y, size);
        this._orb.set_position(cx, cy);
        if (this._hidden)
            this._hideToEdge(false);
    }

    _nearestMonitor(x, y) {
        const monitors = Main.layoutManager.monitors ?? [];
        if (!monitors.length)
            return {x: 0, y: 0, width: global.stage.width, height: global.stage.height};
        let best = monitors[0];
        let score = Infinity;
        for (const m of monitors) {
            const dx = x < m.x ? m.x - x :
                x > m.x + m.width ? x - (m.x + m.width) : 0;
            const dy = y < m.y ? m.y - y :
                y > m.y + m.height ? y - (m.y + m.height) : 0;
            const d = dx * dx + dy * dy;
            if (d < score) {
                best = m;
                score = d;
            }
        }
        return best;
    }

    _clampToMonitor(x, y, size) {
        const m = this._nearestMonitor(x + size / 2, y + size / 2);
        return [
            clamp(x, m.x, Math.max(m.x, m.x + m.width - size)),
            clamp(y, m.y, Math.max(m.y, m.y + m.height - size)),
        ];
    }

    _storePosition() {
        if (!this._orb)
            return;
        const [x, y] = this._orb.get_position();
        const size = this._settings.get_int('orb-size');
        this._writingPosition = true;
        try {
            this._settings.set_double('orb-x',
                clamp(x / Math.max(1, global.stage.width - size), 0, 1));
            this._settings.set_double('orb-y',
                clamp(y / Math.max(1, global.stage.height - size), 0, 1));
        } finally {
            this._writingPosition = false;
        }
    }

    _scheduleTimers() {
        this._cancelTimers();
        if (!this._orb || this._orb.get_hover() || this._dragging)
            return;

        if (this._settings.get_boolean('auto-hide-orb')) {
            this._hideId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this._settings.get_int('auto-hide-delay'),
                () => {
                    this._hideId = 0;
                    if (this._orb && !this._orb.get_hover() && !this._dragging)
                        this._hideToEdge(true);
                    return GLib.SOURCE_REMOVE;
                });
            return;
        }

        if (this._settings.get_boolean('auto-fade-orb')) {
            this._fadeId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this._settings.get_int('auto-fade-delay'),
                () => {
                    this._fadeId = 0;
                    if (this._orb && !this._orb.get_hover() && !this._dragging)
                        this._fadeOut();
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    _cancelTimers() {
        for (const key of ['_hideId', '_fadeId']) {
            if (this[key]) {
                try { GLib.source_remove(this[key]); } catch {}
                this[key] = 0;
            }
        }
    }

    _hideToEdge(animate) {
        if (!this._orb)
            return;
        this._hidden = true;
        const size = this._settings.get_int('orb-size');
        const [x, y] = this._orb.get_position();
        const m = this._nearestMonitor(x + size / 2, y + size / 2);
        const distances = [
            ['left', Math.abs(x - m.x)],
            ['right', Math.abs(m.x + m.width - (x + size))],
            ['bottom', Math.abs(m.y + m.height - (y + size))],
        ].sort((a, b) => a[1] - b[1]);
        const edge = distances[0][0];
        let tx = x;
        let ty = y;
        if (edge === 'left') tx = m.x - size + REVEAL;
        if (edge === 'right') tx = m.x + m.width - REVEAL;
        if (edge === 'bottom') ty = m.y + m.height - REVEAL;
        this._orb.remove_all_transitions();
        if (animate) {
            this._orb.ease({
                x: tx, y: ty, duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._orb.set_position(tx, ty);
        }
    }

    _reveal() {
        if (!this._orb || !this._hidden)
            return;
        this._hidden = false;
        this._orb.remove_all_transitions();
        this._syncOrb();
    }

    _fadeOut() {
        if (!this._orb)
            return;
        this._faded = true;
        this._orb.ease({
            opacity: 0, duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _restoreOpacity(animate) {
        if (!this._orb)
            return;
        this._faded = false;
        const opacity = Math.round(
            this._settings.get_int('orb-opacity') * 2.55);
        this._orb.remove_transition('opacity');
        if (animate) {
            this._orb.ease({
                opacity, duration: 120,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._orb.opacity = opacity;
        }
    }
}
