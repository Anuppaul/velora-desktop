import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Evaluate the exact shipped GNOME runtime with Clutter actor mocks; verify
// a FIXED 16:9 glass card for portrait Terminal, wide Files and 1-4 windows.
const code = (await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/orbThemeRuntime.js', import.meta.url
), 'utf8')).replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+default\s+class\s+/gm, 'class ');

class Actor {
    constructor(props = {}) {
        this.style_class = props.style_class ?? '';
        this.clip_to_allocation = props.clip_to_allocation ?? false;
        this.children = [];
        this.width = 0;
        this.height = 0;
        this.x = 0;
        this.y = 0;
        this.parent = null;
        if (props.child)
            this.add_child(props.child);
    }
    set_size(w, h) {this.width = w; this.height = h;}
    set_position(x, y) {this.x = x; this.y = y;}
    set_pivot_point(x, y) {this.pivot = [x, y];}
    add_child(actor) {this.children.push(actor); actor.parent = this;}
    connect() {return 1;}
    ease(options) {this.animation = options;}
    get_parent() {return this.parent;}
    remove_all_transitions() {}
    destroy() {this.destroyed = true;}
    get_hover() {return false;}
}
class WindowPreviewLayout {
    constructor() {this.windows = [];}
    add_window(window) {this.windows.push(window); return {};}
}
const {Runtime, planWindowPreview, previewWindowBounds} = new Function(
    'Extension', 'Clutter', 'St', 'Shell', 'Main', 'clamp',
    code + '\nreturn {Runtime: VeloraRuntime, planWindowPreview, previewWindowBounds};'
)(
    class {},
    {Actor, FixedLayout: class {}, AnimationMode: {EASE_OUT_QUAD: 1}},
    {Widget: Actor, Button: Actor},
    {WindowPreviewLayout},
    {activateWindow() {}},
    (n, low, high) => Math.min(high, Math.max(low, n))
);

const DEFAULT_MONITOR = {x: 0, y: 0, width: 1920, height: 1080};
function windowsFor(frames, buffers) {
    return frames.map((frame, index) => ({
        id: index,
        title: 'Preview #' + index,
        skip_taskbar: false,
        get_compositor_private: () => true,
        get_frame_rect: () => frame,
        get_buffer_rect: () => buffers?.[index] ?? frame,
    }));
}
const sources = [
    {x: 20, y: 50, width: 600, height: 1050},  // portrait terminal
    {x: 40, y: 60, width: 1550, height: 980},  // Files
    {x: 40, y: 60, width: 500, height: 700},
    {x: 40, y: 60, width: 1800, height: 900},
];
function render(frames, {
    buffers = null,
    percent = 100,
    monitor = DEFAULT_MONITOR,
    preferredSide = null,
} = {}) {
    const runtime = new Runtime();
    const windows = windowsFor(frames, buffers);
    const app = {get_windows: () => windows, connectObject() {}};
    const anchor = {
        get_transformed_position: () => [monitor.x + 28, monitor.y + 24],
        get_transformed_size: () => [48, 48],
        get_parent: () => ({}),
    };
    runtime._monitorAt = () => monitor;
    runtime._settings = {get_int: key =>
        ({'app-preview-size': percent, 'orb-size': 44})[key] ?? 100};
    runtime._layer = new Actor();
    runtime._cancelAppPreviewHide = () => {};
    runtime._cancelCloseTimer = () => {};
    runtime._scheduleAppPreviewHide = () => {};
    runtime._scheduleClose = () => {};
    const attached = [];
    runtime._liquidGlassIntegration = {
        attachPreviewGlass(card) {attached.push(card); return true;},
    };
    assert.equal(runtime._showAppPreview(app, anchor, preferredSide), true);
    const card = runtime._appPreview;
    assert.equal(card, attached[0], 'native card receives LiquidEffect');
    assert.equal(card.style_class, 'velora-app-preview-card');
    assert.equal(card.width * 9, card.height * 16,
        'outer glass ratio must be EXACTLY 16:9');
    assert.equal(card.width % 16, 0);
    assert.equal(card.children.length, frames.length);
    assert.ok(card.x >= monitor.x + 8);
    assert.ok(card.y >= monitor.y + 8);
    assert.ok(card.x + card.width <= monitor.x + monitor.width - 8);
    assert.ok(card.y + card.height <= monitor.y + monitor.height - 8);

    for (const tile of card.children) {
        assert.equal(tile.width * 9, tile.height * 16,
            'all native thumbnail slots have fixed 16:9 ratio');
        assert.ok(tile.x >= 0 && tile.y >= 0);
        assert.ok(tile.x + tile.width <= card.width);
        assert.ok(tile.y + tile.height <= card.height);
        assert.equal(tile.clip_to_allocation, true);
        const content = tile.children[0];
        assert.equal(content.clip_to_allocation, true);
        const preview = content.children[0];
        assert.equal(preview.clip_to_allocation, false,
            'CSD window shadow must not be clipped at source frame');
        assert.ok(preview.width > 0 && preview.height > 0);
        assert.equal(preview.layout_manager.windows.length, 1);
    }
    assert.deepEqual([card.scale_x, card.scale_y], [0.96, 0.96],
        'previous GNOME open transition unchanged');
    const initial = card;
    assert.equal(runtime._showAppPreview(app, anchor, preferredSide), true);
    assert.equal(runtime._appPreview, initial,
        'repeated hover reuses the same card instead of allocating glass');
    assert.equal(attached.length, 1);
    return {card, windows, runtime};
}

assert.equal(planWindowPreview([], 1.35, DEFAULT_MONITOR), null);
for (const count of [1, 2, 3, 4]) {
    const {card} = render(sources.slice(0, count));
    assert.deepEqual([card.width, card.height], [640, 360]);
    // No overlapping 16:9 click targets, including third window centered.
    for (let i = 0; i < card.children.length; i++) {
        for (let j = i + 1; j < card.children.length; j++) {
            const a = card.children[i], b = card.children[j];
            assert.ok(
                a.x + a.width <= b.x ||
                b.x + b.width <= a.x ||
                a.y + a.height <= b.y ||
                b.y + b.height <= a.y,
                'preview tiles do not overlap');
        }
    }
}
// The reduced scale is the only intended visual geometry change;
 // unchanged 16:9 framing and live thumbnail preservation still apply.
const terminal = render([sources[0]]).card;
const files = render([sources[1]]).card;
assert.deepEqual([terminal.width, terminal.height],
    [files.width, files.height],
    'portrait Terminal and landscape Files get identical 16:9 glass frames');
// Portraits remain fully visible and keep their native aspect within 16:9.
// They are pillarboxed with actual translucent GLASS behind them, not
// stretched/cropped or padded by a second opaque side layer.
const portraitClone = terminal.children[0].children[0].children[0];
const landscapeClone = files.children[0].children[0].children[0];
assert.ok(portraitClone.height > portraitClone.width,
    'Terminal preview is not distorted to widescreen');
assert.ok(landscapeClone.width > landscapeClone.height);

// Buffer coordinates can differ from the frame for CSD and shadow. The
// visible buffer must fit inside the compositor tile with no hard clipping.
const frame = {x: 350, y: 140, width: 600, height: 1000};
const buffer = {x: 334, y: 126, width: 628, height: 1028};
const {card: decorated} = render([frame], {buffers: [buffer]});
const tile = decorated.children[0];
const clone = tile.children[0].children[0];
const bounds = previewWindowBounds(windowsFor([frame], [buffer])[0]);
assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height],
    [334, 126, 628, 1028]);
const scale = Math.min(
    (tile.width - 4) / bounds.width,
    (tile.height - 4) / bounds.height
);
const bufferLeft = clone.x + (buffer.x - frame.x) * scale;
const bufferTop = clone.y + (buffer.y - frame.y) * scale;
assert.ok(bufferLeft >= 1 && bufferTop >= 1);
assert.ok(bufferLeft + buffer.width * scale <= tile.width - 1);
assert.ok(bufferTop + buffer.height * scale <= tile.height - 1);

// Small windows are scaled up by native Clutter rather than appearing as
// tiny thumbnails centered in an oversized preview.
const small = render([{x: 10, y: 10, width: 140, height: 88}]).card;
assert.ok(small.children[0].children[0].children[0].width > 140);

assert.deepEqual(
    (() => {const c = render([sources[1]], {percent: 50}).card;
        return [c.width, c.height];})(),
    [320, 180],
);
for (const monitor of [
    {x: 0, y: 0, width: 600, height: 360},
    {x: 1920, y: 200, width: 820, height: 460},
    {x: -1600, y: 0, width: 1600, height: 900},
]) {
    for (const count of [1, 2, 3, 4]) {
        render(sources.slice(0, count), {
            percent: 180, monitor, preferredSide: 'left',
        });
    }
}

// No extra painted side layer: visible fallback/neutral body are part of
// the SAME native preview St.Widget (a shader tint is not another actor).
const css = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
const normalCss = css.match(/\.velora-app-preview-card\s*\{([^}]*)\}/)?.[1];
const glassCss = css.match(
    /\.velora-app-preview-card\.velora-liquid-shell-card\s*\{([^}]*)\}/
)?.[1];
const tileCss = css.match(/\.velora-window-preview-tile\s*\{([^}]*)\}/)?.[1];
assert.ok(normalCss && glassCss && tileCss);
assert.match(normalCss, /background-color:\s*rgba\(232,\s*243,\s*255,\s*0\.18\)/);
assert.match(glassCss, /background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.085\)/);
assert.match(normalCss, /border:\s*0/);
assert.match(tileCss, /background-color:\s*transparent/);
console.log('Fixed 16:9 glass, live window contain, visibility, CSD, multi-monitor and click targets PASS.');
