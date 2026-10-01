import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    GLASS_TEXT_PALETTE,
    VELORA_GLASS_ROLES,
    applyVeloraGlassRole,
} from './glassMaterialSystem.js';

const ORB_FACE_CLASS = 'velora-orb-face-v2';
const ORB_GLYPH_CLASS = 'velora-orb-glyph-v2';
const APP_BUTTON_CLASS = 'velora-app-button';
const PAD = 20;
const MAX_REGIONS = 16;
const SHARED_RADIUS = 22;
const SCAN_INTERVAL_US = 140000;
const SAMPLE_INTERVAL_US = 650000;
const LIGHT = GLASS_TEXT_PALETTE.light;
const DARK = GLASS_TEXT_PALETTE.dark;

function classesOf(actor) {
    return String(
        actor?.get_style_class_name?.() ??
        actor?.style_class ??
        ''
    ).split(/\s+/).filter(Boolean);
}

function finiteRect(rect) {
    return Array.isArray(rect) &&
        rect.length >= 4 &&
        rect.every(Number.isFinite) &&
        rect[2] > 1 &&
        rect[3] > 1;
}

function srgbToLinear(channel) {
    const n = channel / 255;
    return n <= 0.04045
        ? n / 12.92
        : Math.pow((n + 0.055) / 1.055, 2.4);
}

function luminance(r, g, b) {
    return (
        0.2126 * srgbToLinear(r) +
        0.7152 * srgbToLinear(g) +
        0.0722 * srgbToLinear(b)
    );
}

export class OrbGlassManager {
    constructor(params) {
        this._vendor = params.vendor;
        this._settings = params.settings;
        this._readAppearance = params.readAppearance;

        this._enabled = false;
        this._desktopLayer = null;
        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;
        this._appearance = null;

        this._orbFace = null;
        this._orbGlyph = null;
        this._buttons = new Set();
        this._stageId = 0;
        this._lastScanUs = 0;
        this._lastRegionKey = '';

        this._screenshot = null;
        this._samplePending = false;
        this._lastSampleUs = 0;
        this._glyphDark = null;
        this._glyphOriginalStyle = null;
    }

    setup() {
        if (this._enabled)
            return;

        this._desktopLayer = Main.uiGroup
            ?.get_children?.()
            ?.find(actor =>
                actor.get_name?.() === 'velora-desktop-layer'
            ) ?? null;

        if (!this._desktopLayer)
            throw new Error('Velora desktop layer unavailable');

        this._enabled = true;
        this._appearance = this._readAppearance();
        this._createLayer();
        this._scan(true);

        this._stageId = global.stage.connect(
            'before-update',
            () => this._tick()
        );

        console.log(
            '[Velora][OrbGlass] shared Orb/radial Liquid Glass active'
        );
    }

    _createLayer() {
        const root = new this._vendor.UnpickableActor({
            name: 'velora-orb-glass-root',
            reactive: false,
        });
        root.set_no_layout?.(true);
        root.set_position(0, 0);
        root.set_size(global.stage.width, global.stage.height);
        root.hide();

        const liquidBox = new this._vendor.UnpickableActor({
            name: 'velora-orb-glass-box',
            reactive: false,
        });
        liquidBox.set_no_layout?.(true);
        liquidBox.set_position(0, 0);
        liquidBox.set_size(global.stage.width, global.stage.height);
        liquidBox.set_clip_to_allocation(true);
        root.add_child(liquidBox);

        const sceneRoot = new this._vendor.UnpickableActor({
            name: 'velora-orb-glass-scene',
            reactive: false,
        });
        sceneRoot.set_no_layout?.(true);
        sceneRoot.set_position(0, 0);
        sceneRoot.set_size(global.stage.width, global.stage.height);
        liquidBox.add_child(sceneRoot);

        const sceneManager = new this._vendor.WindowCloneManager(
            sceneRoot,
            null,
            'velora-orb-glass-scene'
        );

        const breaker = new this._vendor.UnpickableActor({
            name: 'velora-orb-glass-breaker',
            reactive: false,
        });
        breaker.set_no_layout?.(true);
        breaker.set_size(1, 1);
        breaker.set_opacity(0);
        liquidBox.add_child(breaker);

        const effect = new this._vendor.LiquidEffect({
            extensionPath: this._vendor.root,
            settings: this._settings,
            owner: 'velora-orb-shared',
        });
        effect.setPadding?.(PAD);
        effect.setIsDock?.(false);
        effect.setMultiRegionMode?.(true);
        effect.setShadowMaxRadius?.(0);
        liquidBox.add_effect(effect);

        Main.uiGroup.insert_child_below(
            root,
            this._desktopLayer
        );

        this._root = root;
        this._liquidBox = liquidBox;
        this._sceneRoot = sceneRoot;
        this._sceneManager = sceneManager;
        this._effect = effect;
        this._applyAppearance();
    }

    _applyAppearance(
        state = this._appearance ?? this._readAppearance()
    ) {
        if (!this._effect || !state)
            return;

        this._appearance = state;
        const role = VELORA_GLASS_ROLES.innerCard;

        let brightness = null;
        let contrast = null;
        let saturation = null;
        try {
            brightness = this._settings.get_double('menu-brightness');
            contrast = this._settings.get_double('menu-contrast');
            saturation = this._settings.get_double('menu-saturation');
        } catch {}

        applyVeloraGlassRole(
            this._effect,
            role,
            {
                tintColor: [
                    (state.r ?? 255) / 255,
                    (state.g ?? 255) / 255,
                    (state.b ?? 255) / 255,
                ],
                tintStrength: state.opacity ?? role.tintStrength,
                baseBlur: state.blur ?? 7,
                cornerRadius: SHARED_RADIUS,
                brightness,
                contrast,
                saturation,
                multiRegion: true,
            }
        );

        this._lastRegionKey = '';
        this._root?.queue_redraw?.();
    }

    updateAppearance(
        state = this._readAppearance()
    ) {
        this._applyAppearance(state);
    }

    _scan(force = false) {
        const nowUs = GLib.get_monotonic_time();
        if (!force && nowUs - this._lastScanUs < SCAN_INTERVAL_US)
            return;
        this._lastScanUs = nowUs;

        let orbFace = null;
        let orbGlyph = null;
        const buttons = new Set();

        const walk = actor => {
            if (!actor)
                return;

            const classes = classesOf(actor);
            if (classes.includes(ORB_FACE_CLASS))
                orbFace = actor;
            if (classes.includes(ORB_GLYPH_CLASS))
                orbGlyph = actor;
            if (classes.includes(APP_BUTTON_CLASS))
                buttons.add(actor);

            for (const child of actor.get_children?.() ?? [])
                walk(child);
        };

        walk(this._desktopLayer);

        this._orbFace = orbFace;

        if (orbGlyph !== this._orbGlyph) {
            if (this._orbGlyph && this._glyphOriginalStyle !== null) {
                try {
                    this._orbGlyph.set_style?.(
                        this._glyphOriginalStyle
                    );
                } catch {}
            }

            this._orbGlyph = orbGlyph;
            this._glyphDark = null;
            this._glyphOriginalStyle =
                orbGlyph?.get_style?.() ??
                orbGlyph?.style ??
                null;
        }

        this._buttons = buttons;
    }

    _tick() {
        if (!this._enabled)
            return;

        this._scan(false);
        this._syncRegions();
        this._maybeSampleGlyph();
    }

    _syncRegions() {
        if (!this._root || !this._effect)
            return;

        const width = global.stage.width;
        const height = global.stage.height;

        this._vendor.setSizeIfChanged(
            this._root,
            width,
            height
        );
        this._vendor.setSizeIfChanged(
            this._liquidBox,
            width,
            height
        );
        this._vendor.setSizeIfChanged(
            this._sceneRoot,
            width,
            height
        );

        const targets = [];
        if (this._orbFace)
            targets.push(this._orbFace);
        for (const button of this._buttons)
            targets.push(button);

        const regions = [];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const actor of targets) {
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

            const [x, y, w, h] = rect;

            regions.push({
                x: x - PAD,
                y: y - PAD,
                w: w + PAD * 2,
                h: h + PAD * 2,
                tintR: 1.0,
                tintG: 1.0,
                tintB: 1.0,
                baseStrength: 0.0,
                response: actor.get_hover?.() ? 0.38 : 0.0,
            });

            minX = Math.min(minX, x - PAD);
            minY = Math.min(minY, y - PAD);
            maxX = Math.max(maxX, x + w + PAD);
            maxY = Math.max(maxY, y + h + PAD);

            if (regions.length >= MAX_REGIONS)
                break;
        }

        if (!regions.length) {
            this._effect.setGlassRegions?.([]);
            this._root.hide?.();
            return;
        }

        const key = JSON.stringify(
            regions.map(r => [
                Math.round(r.x),
                Math.round(r.y),
                Math.round(r.w),
                Math.round(r.h),
                r.response,
            ])
        );

        if (key !== this._lastRegionKey) {
            this._lastRegionKey = key;
            this._effect.setResolution?.(width, height);
            this._effect.setCornerRadius?.(SHARED_RADIUS);
            this._effect.setGlassRegions?.(regions);
        }

        try {
            this._sceneManager?.setCullRect?.([
                minX,
                minY,
                maxX - minX,
                maxY - minY,
            ]);
            this._sceneManager?.applyBgCloneClip?.([
                minX,
                minY,
                maxX - minX,
                maxY - minY,
            ]);
            this._sceneManager?.sync?.();
        } catch {}

        this._root.show?.();
    }

    _maybeSampleGlyph() {
        if (
            !this._orbFace ||
            !this._orbGlyph ||
            this._samplePending
        ) {
            return;
        }

        const nowUs = GLib.get_monotonic_time();
        if (
            this._lastSampleUs > 0 &&
            nowUs - this._lastSampleUs < SAMPLE_INTERVAL_US
        ) {
            return;
        }

        const rect = this._vendor.getTransformedRect(this._orbFace);
        if (!finiteRect(rect))
            return;

        this._lastSampleUs = nowUs;
        this._samplePending = true;

        const [x, y, w, h] = rect;
        const left = Math.max(0, Math.floor(x + w * 0.15));
        const top = Math.max(0, Math.floor(y + h * 0.15));
        const right = Math.min(
            global.stage.width,
            Math.ceil(x + w * 0.85)
        );
        const bottom = Math.min(
            global.stage.height,
            Math.ceil(y + h * 0.85)
        );

        if (right <= left || bottom <= top) {
            this._samplePending = false;
            return;
        }

        this._screenshot ??= new Shell.Screenshot();
        const stream = Gio.MemoryOutputStream.new_resizable();

        try {
            this._screenshot.screenshot_area(
                left,
                top,
                right - left,
                bottom - top,
                stream,
                (object, result) => {
                    try {
                        const [ok] =
                            object.screenshot_area_finish(result);
                        stream.close(null);
                        if (!ok)
                            return;

                        const bytes = stream.steal_as_bytes();
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(
                            Gio.MemoryInputStream.new_from_bytes(bytes),
                            null
                        );
                        if (!pixbuf)
                            return;

                        const data = pixbuf.get_pixels();
                        const stride = pixbuf.get_rowstride();
                        const channels = pixbuf.get_n_channels();
                        const pw = pixbuf.get_width();
                        const ph = pixbuf.get_height();

                        let sum = 0;
                        let count = 0;
                        const step = Math.max(
                            1,
                            Math.floor(Math.min(pw, ph) / 12)
                        );

                        for (let py = 0; py < ph; py += step) {
                            const row = py * stride;
                            for (let px = 0; px < pw; px += step) {
                                const off = row + px * channels;
                                sum += luminance(
                                    data[off] ?? 0,
                                    data[off + 1] ?? 0,
                                    data[off + 2] ?? 0
                                );
                                count++;
                            }
                        }

                        if (!count)
                            return;

                        const useDark = sum / count > 0.48;
                        if (useDark === this._glyphDark)
                            return;

                        this._glyphDark = useDark;
                        const color = useDark ? DARK : LIGHT;
                        const original = this._glyphOriginalStyle ?? '';
                        const prefix = original
                            ? original.replace(/;\s*$/, '') + '; '
                            : '';

                        this._orbGlyph.set_style?.(
                            prefix + 'color: ' + color + ';'
                        );
                    } catch {}
                    finally {
                        this._samplePending = false;
                    }
                }
            );
        } catch {
            try {
                stream.close(null);
            } catch {}
            this._samplePending = false;
        }
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

        if (this._orbGlyph && this._glyphOriginalStyle !== null) {
            try {
                this._orbGlyph.set_style?.(
                    this._glyphOriginalStyle
                );
            } catch {}
        }

        try {
            this._sceneManager?.destroy?.();
        } catch {}

        try {
            this._root?.destroy?.();
        } catch {}

        this._desktopLayer = null;
        this._root = null;
        this._liquidBox = null;
        this._sceneRoot = null;
        this._sceneManager = null;
        this._effect = null;
        this._orbFace = null;
        this._orbGlyph = null;
        this._buttons.clear();
        this._screenshot = null;
        this._samplePending = false;
        this._lastRegionKey = '';

        console.log('[Velora][OrbGlass] stopped');
    }
}
