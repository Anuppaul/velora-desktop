// VLIQ GNOME 50 top bar: three independent rounded, refractive glass islands.
// Never reparent GNOME's panel buttons or modify their input handling.
// Reuse the same bounded native PanelGlassSurface used by VLIQ's Dock panel,
// Clock and Calendar; no full-width DashManager FBO and no new shader path.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {PanelGlassSurface} from './panelGlass.js';
import {primaryPanelIsFullscreen} from './fullscreenPanelGuard.js';

const RADIUS = 16;
const INSET_Y = 2;
const SIDE_MARGIN = 6;
const ISLAND_PAD_X = 9;
const ISLAND_GAP = 8;
const MIN_WIDTH = 22;
const MIN_HEIGHT = 14;
const REGIONS = Object.freeze([
    ['left', '_leftBox'],
    ['center', '_centerBox'],
    ['right', '_rightBox'],
]);

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export class TopBarIslands {
    constructor({vendor, settings, readAppearance, panel = Main.panel,
        layout = Main.layoutManager, display = global.display}) {
        this._vendor = vendor;
        this._settings = settings;
        this._readAppearance = readAppearance;
        this._panel = panel;
        this._layout = layout;
        this._display = display;
        this._regions = [];
        this._signals = [];
        this._stageSignal = 0;
        this._enabled = false;
        this._visibilityGate = null;
        this._host = null;
        this._panelRoot = null;
        this._hasReportedReady = false;
    }

    setVisibilityGate(callback) {
        this._visibilityGate = typeof callback === 'function'
            ? callback : null;
        this.sync();
    }

    setup() {
        if (this._enabled)
            return true;

        const panel = this._panel;
        const layout = this._layout;
        const host = layout?.uiGroup;
        const nativePanelBox = layout?.panelBox;
        if (!panel || !host || !nativePanelBox)
            return false;

        // Use GNOME's OWN left/center/right allocations. Any applets,
        // indicators and menus stay in their original shell containers.
        const actors = REGIONS.map(([role, key]) => ({
            role, actor: panel[key],
        }));
        if (actors.some(({actor}) => !actor))
            return false;

        let root = nativePanelBox;
        while (root && root.get_parent?.() !== host)
            root = root.get_parent?.() ?? null;
        if (!root)
            return false;

        this._host = host;
        this._panelRoot = root;
        try {
            // A transparent native panel lets wallpaper show BETWEEN islands.
            // Each island owns an isolated St fallback until GPU glass is ready.
            panel.add_style_class_name('vliq-liquid-top-panel');
            panel.add_style_class_name('vliq-three-islands');

            for (const {role, actor} of actors) {
                const surface = new PanelGlassSurface(
                    this._vendor, this._settings, this._readAppearance,
                    {cornerRadius: RADIUS}
                );
                if (!surface.attach(host, root)) {
                    surface.destroy();
                    throw new Error('native glass creation failed: ' + role);
                }
                actor.add_style_class_name('vliq-panel-island');
                actor.add_style_class_name('vliq-panel-island-' + role);
                this._regions.push({role, actor, surface, ready: false});
            }

            this._enabled = true;
            // The native panel moves during Overview/fullscreen and can
            // receive late system indicators. Derive glass rectangles from
            // transformed native allocations, not saved/stale coordinates.
            this._stageSignal = global.stage.connect(
                'before-update', () => this.sync()
            );
            for (const [actor, signal] of [
                [layout, 'monitors-changed'],
                [layout.panelBox, 'notify::visible'],
                [panel, 'notify::mapped'],
                [this._display, 'in-fullscreen-changed'],
                ...actors.flatMap(({actor}) => [
                    [actor, 'child-added'],
                    [actor, 'child-removed'],
                ]),
            ]) {
                try {
                    if (!actor?.connect)
                        continue;
                    const id = actor.connect(signal, () => this.sync());
                    if (id)
                        this._signals.push({actor, id});
                } catch {
                    // Optional GNOME signals vary slightly across releases.
                }
            }
            this.sync();
            console.log('[VLIQ][TopBar] three native rounded glass islands attached');
            return true;
        } catch (error) {
            console.warn('[VLIQ][TopBar] islands fallback: ' + error);
            this.cleanup();
            return false;
        }
    }

    _canShow() {
        if (!this._enabled)
            return false;
        if (this._visibilityGate && !this._visibilityGate())
            return false;
        if (primaryPanelIsFullscreen(this._layout, this._display))
            return false;
        if (this._layout?.panelBox?.visible === false ||
            this._panel?.visible === false ||
            this._panel?.mapped === false)
            return false;
        return true;
    }

    _hideRegion(region) {
        region.surface.hide();
        if (region.ready) {
            region.actor.remove_style_class_name('vliq-panel-island-ready');
            region.ready = false;
        }
    }

    sync() {
        if (!this._enabled)
            return;
        if (!this._canShow()) {
            for (const region of this._regions)
                this._hideRegion(region);
            return;
        }

        const monitor = this._layout?.primaryMonitor;
        const host = this._host;
        if (!monitor || !host)
            return;

        const [hostX, hostY] =
            host.get_transformed_position?.() ?? [0, 0];
        const leftLimit = monitor.x + SIDE_MARGIN;
        const rightLimit = monitor.x + monitor.width - SIDE_MARGIN;
        // Stay inside the native panel's real allocation. A large or
        // late-loading indicator may report bounds extending into desktop;
        // its glass must NEVER become a tall semi-fullscreen overlay.
        const [, panelY] = this._layout?.panelBox
            ?.get_transformed_position?.() ?? [NaN, NaN];
        const [, panelHeight] = this._layout?.panelBox
            ?.get_transformed_size?.() ?? [0, 0];
        const nativePanelY = Number.isFinite(panelY)
            ? panelY : monitor.y;
        const topLimit = Math.max(monitor.y, nativePanelY);
        const bottomLimit = Math.min(
            monitor.y + monitor.height,
            nativePanelY + (
                Number.isFinite(panelHeight) && panelHeight > 1
                    ? panelHeight : (this._panel.height ?? 36)
            )
        );

        const proposals = [];
        for (const region of this._regions) {
            const actor = region.actor;
            const children = actor?.get_children?.() ?? [];
            // GNOME sometimes keeps an empty/hidden system-indicator group
            // mapped at the previous allocation. It must not retain an
            // orphaned glass island.
            const visibleChildren = children.filter(child =>
                child && child.visible !== false && child.mapped !== false
            );
            if (!actor || actor.visible === false || actor.mapped === false ||
                visibleChildren.length === 0) {
                this._hideRegion(region);
                continue;
            }

            // GNOME panel group allocations can stretch beyond their buttons.
            // Prefer the bounds of actual visible children; this keeps the
            // glass tight around Activities, Date Menu and Quick Settings
            // rather than turning an expanded native box into a wide sheet.
            const bounds = [];
            for (const child of visibleChildren) {
                const [cx, cy] =
                    child.get_transformed_position?.() ?? [NaN, NaN];
                const [cw, ch] =
                    child.get_transformed_size?.() ?? [NaN, NaN];
                if ([cx, cy, cw, ch].every(Number.isFinite) &&
                    cw > 0 && ch > 0)
                    bounds.push([cx, cy, cx + cw, cy + ch]);
            }
            let x, y, width, height;
            if (bounds.length) {
                x = Math.min(...bounds.map(b => b[0]));
                y = Math.min(...bounds.map(b => b[1]));
                width = Math.max(...bounds.map(b => b[2])) - x;
                height = Math.max(...bounds.map(b => b[3])) - y;
            } else {
                [x, y] =
                    actor.get_transformed_position?.() ?? [NaN, NaN];
                [width, height] =
                    actor.get_transformed_size?.() ?? [NaN, NaN];
            }
            if (![x, y, width, height].every(Number.isFinite) ||
                width < MIN_WIDTH || height < MIN_HEIGHT ||
                x >= rightLimit || x + width <= leftLimit) {
                this._hideRegion(region);
                continue;
            }

            const left = clamp(x - ISLAND_PAD_X, leftLimit, rightLimit);
            const right = clamp(x + width + ISLAND_PAD_X, left, rightLimit);
            const top = clamp(y + INSET_Y, topLimit, bottomLimit);
            const bottom = clamp(y + height - INSET_Y, top, bottomLimit);
            if (right - left < MIN_WIDTH || bottom - top < MIN_HEIGHT) {
                this._hideRegion(region);
                continue;
            }
            proposals.push({
                region, left, right, top, bottom,
                opacity: actor.get_paint_opacity?.() ?? actor.opacity ?? 255,
            });
        }

        // On narrow monitors or with extra indicator extensions, GNOME's
        // left/center/right allocations can come close enough that 9px glass
        // padding makes surfaces visually merge. Leave an 8px true wallpaper
        // gap WITHOUT reparenting, clipping or moving native input actors.
        proposals.sort((a, b) => a.left - b.left);
        for (let i = 1; i < proposals.length; i++) {
            const previous = proposals[i - 1];
            const current = proposals[i];
            if (previous.right + ISLAND_GAP <= current.left)
                continue;
            const boundary = (previous.right + current.left) / 2;
            previous.right = Math.min(previous.right,
                boundary - ISLAND_GAP / 2);
            current.left = Math.max(current.left,
                boundary + ISLAND_GAP / 2);
        }
        for (const proposal of proposals) {
            const {region, left, right, top, bottom, opacity} = proposal;
            const width = right - left;
            const height = bottom - top;
            if (width < MIN_WIDTH || height < MIN_HEIGHT) {
                this._hideRegion(region);
                continue;
            }
            region.surface.setBounds(
                left - hostX, top - hostY, width, height, opacity
            );
            const ready = region.surface.ready;
            if (ready !== region.ready) {
                region.ready = ready;
                if (ready)
                    region.actor.add_style_class_name('vliq-panel-island-ready');
                else
                    region.actor.remove_style_class_name('vliq-panel-island-ready');
            }
        }

        if (!this._hasReportedReady &&
            this._regions.length === 3 &&
            this._regions.every(({ready}) => ready)) {
            this._hasReportedReady = true;
            console.log('[VLIQ][TopBar] left/center/right optical glass READY');
        }
    }

    updateAppearance() {
        if (!this._enabled)
            return;
        for (const {surface} of this._regions)
            surface.updateAppearance();
        this.sync();
    }

    cleanup() {
        this._enabled = false;
        if (this._stageSignal) {
            try { global.stage.disconnect(this._stageSignal); } catch {}
            this._stageSignal = 0;
        }
        for (const {actor, id} of this._signals) {
            try { actor.disconnect(id); } catch {}
        }
        this._signals = [];
        for (const region of this._regions) {
            try { region.surface.destroy(); } catch {}
            for (const name of [
                'vliq-panel-island-ready',
                'vliq-panel-island-' + region.role,
                'vliq-panel-island',
            ]) {
                try { region.actor.remove_style_class_name(name); } catch {}
            }
        }
        this._regions = [];
        try {
            this._panel?.remove_style_class_name('vliq-three-islands');
            this._panel?.remove_style_class_name('vliq-liquid-top-panel');
        } catch {}
        this._visibilityGate = null;
        this._host = null;
        this._panelRoot = null;
        this._hasReportedReady = false;
    }
}
