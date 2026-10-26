import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the shipping Orb/Dock preview method with mocked native actors.
// The production Shell.WindowPreviewLayout path is unchanged.
const source = (await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/orbThemeRuntime.js', import.meta.url
), 'utf8')).replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+default\s+class\s+/gm, 'class ');
const Actor = class {
    constructor(props = {}) {
        this.style_class = props.style_class ?? '';
        this.children = [];
        this.width = 0;
        this.height = 0;
        this.x = 0;
        this.y = 0;
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
};
const Clutter = {
    FixedLayout: class {},
    AnimationMode: {EASE_OUT_QUAD: 1},
};
const Runtime = new Function(
    'Extension', 'Clutter', 'St', 'clamp',
    source + '\nreturn VeloraRuntime;'
)(
    class {},
    Clutter,
    {Widget: Actor},
    (n, min, max) => Math.min(max, Math.max(min, n))
);

function render(count, {
    percent = 100,
    monitor = {x: 0, y: 0, width: 1920, height: 1080},
    preferredSide = null,
} = {}) {
    const runtime = new Runtime();
    const tiles = [];
    const windows = Array.from({length: count}, (_, i) => ({
        id: i,
        skip_taskbar: false,
        get_compositor_private: () => true,
    }));
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
    runtime._createWindowPreviewTile = (window, width, height) => {
        const tile = new Actor();
        tile.set_size(width, height);
        tile.window = window;
        tiles.push(tile);
        return tile;
    };
    const attachments = [];
    runtime._liquidGlassIntegration = {
        attachPreviewGlass(card) {attachments.push(card); return true;},
    };

    assert.equal(runtime._showAppPreview(app, anchor, preferredSide), true);
    const card = runtime._appPreview;
    assert.equal(card, attachments[0], 'larger card still receives Liquid Glass');
    assert.equal(tiles.length, count);
    assert.equal(card.children.length, count);
    assert.equal(card.style_class, 'velora-app-preview-card');
    assert.ok(card.width <= monitor.width - 16,
        'card must fit active monitor width');
    assert.ok(card.height <= monitor.height - 16,
        'card must fit active monitor height');
    assert.ok(card.x >= monitor.x + 8);
    assert.ok(card.y >= monitor.y + 8);
    assert.ok(card.x + card.width <= monitor.x + monitor.width - 8);
    assert.ok(card.y + card.height <= monitor.y + monitor.height - 8);

    // No actor-level enlargement: St tiles remain real native sizes,
    // so their click target and WindowPreviewLayout geometry stay aligned.
    for (const tile of tiles) {
        assert.equal(tile.width, tiles[0].width);
        assert.equal(tile.height, tiles[0].height);
    }
    assert.deepEqual([card.scale_x, card.scale_y], [0.96, 0.96],
        'existing opening transition preserved');

    const original = runtime._appPreview;
    assert.equal(runtime._showAppPreview(app, anchor, preferredSide), true);
    assert.equal(runtime._appPreview, original,
        'same app/anchor reuses preview rather than reallocating glass');
    assert.equal(attachments.length, 1);
    return {card, tiles, runtime};
}

// This revision further increases thumbnail size beyond the previous 25%
// boost but removes the extra wide peripheral glass/inner tile layers.
// Expected pixels assume 100% user preference and ample monitor space.
// Previous: 378x248, 588x203, 514x338.
for (const [count, expectedWidth, expectedHeight] of [
    [1, 474, 302],
    [2, 746, 243],
    [3, 648, 416],
    [4, 648, 416],
]) {
    const {card} = render(count);
    assert.deepEqual([card.width, card.height],
        [expectedWidth, expectedHeight], count + ' preview size');
}

// Existing user preference still applies; enlargement isn't a replacement
// of the size slider's chosen 50%–180% value.
assert.deepEqual(
    (() => {
        const {card} = render(1, {percent: 50});
        return [card.width, card.height];
    })(),
    [243, 157],
);

for (const monitor of [
    {x: 0, y: 0, width: 600, height: 360},
    {x: 1920, y: 200, width: 820, height: 460},
]) {
    for (const count of [1, 2, 3, 4]) {
        const {card} = render(count, {
            percent: 180,
            monitor,
            preferredSide: 'left',
        });
        assert.ok(card.width < 1000 && card.height < 1000);
    }
}

// The second frosted per-thumbnail plate/side rim must be fully removed.
// Interactive hover feedback is permitted, but there is no always-on plate.
const css = await readFile(new URL(
    '../gnome-shell/velora@wonderer.tech/runtime.css', import.meta.url
), 'utf8');
const previewFrameCss = css.match(/\.velora-app-preview-card\s*\{([^}]*)\}/)?.[1];
const tileCss = css.match(/\.velora-window-preview-tile\s*\{([^}]*)\}/)?.[1];
assert.ok(previewFrameCss && tileCss);
assert.match(previewFrameCss, /border:\s*0\s*;/);
assert.match(previewFrameCss, /box-shadow:\s*none\s*;/);
assert.match(tileCss, /background-color:\s*transparent\s*;/);
assert.match(tileCss, /border:\s*0\s*;/);
assert.match(tileCss, /box-shadow:\s*none\s*;/);
assert.match(source, /tileWidth - 4/);
assert.match(source, /tileHeight - 4/);

console.log('Extra-large edge-to-edge Liquid Glass previews, monitor-fit and single layer PASS.');
