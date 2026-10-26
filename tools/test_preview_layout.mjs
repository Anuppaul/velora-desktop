import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual GNOME runtime code with mock native Clutter actors.
const code = (await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/orbThemeRuntime.js', import.meta.url
), 'utf8')).replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+default\s+class\s+/gm, 'class ');

class Actor {
    constructor(props = {}) {
        this.style_class = props.style_class ?? '';
        this.clip_to_allocation = props.clip_to_allocation ?? false;
        this.reactive = props.reactive ?? true;
        this.accessible_name = props.accessible_name ?? '';
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
    (n, min, max) => Math.min(max, Math.max(min, n))
);

const DEFAULT_MONITOR = {x: 0, y: 0, width: 1920, height: 1080};
function makeWindows(frames, buffers) {
    return frames.map((frame, index) => ({
        id: index,
        title: 'Preview #' + index,
        skip_taskbar: false,
        get_compositor_private: () => true,
        get_frame_rect: () => frame,
        get_buffer_rect: () => buffers?.[index] ?? frame,
    }));
}
function defaultFrames(count) {
    const size = count === 1 ? [280, 176] :
        count === 2 ? [220, 140] : [190, 120];
    return Array.from({length: count}, (_, index) => ({
        x: 100 + index * 20, y: 200 + index * 20,
        width: size[0], height: size[1],
    }));
}

function render(frames, {
    buffers = null,
    percent = 100,
    monitor = DEFAULT_MONITOR,
    preferredSide = null,
} = {}) {
    const runtime = new Runtime();
    const windows = makeWindows(frames, buffers);
    const app = {
        get_windows: () => windows,
        connectObject() {},
    };
    const anchor = {
        get_transformed_position: () => [monitor.x + 24, monitor.y + 20],
        get_transformed_size: () => [48, 48],
        get_parent: () => ({}),
    };
    runtime._monitorAt = () => monitor;
    runtime._settings = {get_int: key => ({
        'app-preview-size': percent, 'orb-size': 44,
    })[key] ?? 100};
    runtime._layer = new Actor();
    runtime._cancelAppPreviewHide = () => {};
    runtime._cancelCloseTimer = () => {};
    runtime._scheduleAppPreviewHide = () => {};
    runtime._scheduleClose = () => {};

    const attachments = [];
    runtime._liquidGlassIntegration = {
        attachPreviewGlass(card) {attachments.push(card); return true;},
    };
    assert.equal(runtime._showAppPreview(app, anchor, preferredSide), true);

    const card = runtime._appPreview;
    assert.equal(card, attachments[0], 'glass matches its native card');
    assert.equal(card.children.length, frames.length);
    assert.equal(card.style_class, 'velora-app-preview-card');
    assert.ok(card.width <= monitor.width - 16,
        'card must fit monitor width: ' + card.width);
    assert.ok(card.height <= monitor.height - 16,
        'card must fit monitor height: ' + card.height);
    assert.ok(card.x >= monitor.x + 8);
    assert.ok(card.y >= monitor.y + 8);
    assert.ok(card.x + card.width <= monitor.x + monitor.width - 8);
    assert.ok(card.y + card.height <= monitor.y + monitor.height - 8);

    for (const tile of card.children) {
        assert.ok(tile.width > 0 && tile.height > 0);
        assert.ok(tile.x >= 0 && tile.y >= 0);
        assert.ok(tile.x + tile.width <= card.width);
        assert.ok(tile.y + tile.height <= card.height);
        assert.equal(tile.clip_to_allocation, true,
            'click target must clip compositor clone');
        const content = tile.children[0];
        assert.equal(content.clip_to_allocation, true);
        const preview = content.children[0];
        assert.equal(preview.clip_to_allocation, false,
            'parent clips CSD shadow, not frame actor');
        assert.ok(preview.width > 0 && preview.height > 0);
        assert.equal(preview.layout_manager.windows.length, 1);
    }
    assert.deepEqual([card.scale_x, card.scale_y], [0.96, 0.96],
        'existing opening animation preserved');

    const original = runtime._appPreview;
    assert.equal(runtime._showAppPreview(app, anchor, preferredSide), true);
    assert.equal(runtime._appPreview, original, 'reuse same preview on hover');
    assert.equal(attachments.length, 1, 'reuse Liquid Glass material');
    return {card, windows, runtime};
}

for (const [count, w, h] of [
    [1, 474, 302],
    [2, 746, 243],
    [3, 646, 416],
    [4, 646, 416],
]) {
    const {card} = render(defaultFrames(count));
    assert.deepEqual([card.width, card.height], [w, h],
        count + ' landscape thumbnails');
}

// Core user-reported case: portrait terminal was tiny inside an enormous
// landscape glass rectangle. Now card aspect follows the real frame.
const portraitFrame = {x: 100, y: 80, width: 600, height: 1050};
const {card: terminal} = render([portraitFrame]);
assert.deepEqual([terminal.width, terminal.height], [177, 302]);
assert.ok(terminal.children[0].width / terminal.width > 0.90);
assert.ok(terminal.children[0].height / terminal.height > 0.90);
assert.ok(terminal.width / terminal.height < 0.66);

const wideFrame = {x: 0, y: 0, width: 1550, height: 980};
const {card: files} = render([wideFrame]);
assert.ok(files.width / files.height > 1.50);
assert.ok(files.width >= 465);

// GNOME decorations/shadows make buffer larger than frame. The union must
// still fit inside the tile, and the clone's buffer must stay centered.
const frame = {x: 350, y: 140, width: 600, height: 1000};
const buffer = {x: 334, y: 126, width: 628, height: 1028};
const {card: decorated} = render([frame], {buffers: [buffer]});
const tile = decorated.children[0];
const preview = tile.children[0].children[0];
const bounds = previewWindowBounds(makeWindows([frame], [buffer])[0]);
assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height],
    [334, 126, 628, 1028]);
const scale = Math.min(
    (tile.width - 4) / bounds.width,
    (tile.height - 4) / bounds.height
);
const bufferLeft = preview.x + (buffer.x - frame.x) * scale;
const bufferTop = preview.y + (buffer.y - frame.y) * scale;
assert.ok(bufferLeft >= 1 && bufferTop >= 1);
assert.ok(bufferLeft + buffer.width * scale <= tile.width - 1);
assert.ok(bufferTop + buffer.height * scale <= tile.height - 1);
assert.ok(decorated.width < 250);

// Small native windows may be scaled up by GNOME's Clutter compositor;
// a forced 1:1 cap would strand them in oversized glass.
const {card: small} = render([{x: 10, y: 10, width: 140, height: 88}]);
assert.ok(small.children[0].children[0].children[0].width > 140);

// Mixed landscape+portrait apps: no duplicated fixed landscape slots,
// no overlap and every thumbnail remains clickable.
const mixed = [
    {x: 0, y: 0, width: 1600, height: 900},
    {x: 0, y: 0, width: 600, height: 1050},
    {x: 0, y: 0, width: 880, height: 600},
    {x: 0, y: 0, width: 750, height: 1100},
];
for (const count of [2, 3, 4]) {
    const {card} = render(mixed.slice(0, count));
    const tiles = card.children;
    assert.ok(tiles[0].width > tiles[1].width);
    for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
            const a = tiles[i], b = tiles[j];
            assert.ok(
                a.x + a.width <= b.x ||
                b.x + b.width <= a.x ||
                a.y + a.height <= b.y ||
                b.y + b.height <= a.y,
                'no overlap: windows ' + i + ' and ' + j
            );
        }
    }
}

// User preview-size preference and multi-monitor fit still apply.
const half = render(defaultFrames(1), {percent: 50}).card;
assert.deepEqual([half.width, half.height], [243, 157]);
for (const monitor of [
    {x: 0, y: 0, width: 600, height: 360},
    {x: 1920, y: 200, width: 820, height: 460},
]) {
    for (const count of [1, 2, 3, 4]) {
        render(mixed.slice(0, count), {
            percent: 180, monitor, preferredSide: 'left',
        });
    }
}

// Previously removed double side layer must not return.
const css = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
const frameCss = css.match(/\.velora-app-preview-card\s*\{([^}]*)\}/)?.[1];
const tileCss = css.match(/\.velora-window-preview-tile\s*\{([^}]*)\}/)?.[1];
assert.ok(frameCss && tileCss);
assert.match(frameCss, /border:\s*0\s*;/);
assert.match(tileCss, /background-color:\s*transparent\s*;/);
assert.match(tileCss, /box-shadow:\s*none\s*;/);

console.log('Native aspect-ratio previews, clipping, CSD buffers, multi-window layouts and monitor fit PASS.');
