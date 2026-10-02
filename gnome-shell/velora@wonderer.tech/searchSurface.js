import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const SEARCH_SURFACE_CLASS =
    'velora-search-surface';

export function decorateSearchEntry(actor) {
    if (!actor?.add_style_class_name)
        return null;

    actor.add_style_class_name(
        SEARCH_SURFACE_CLASS
    );
    return actor;
}

export class SearchSurfaceManager {
    constructor() {
        this._enabled = false;
        this._actors = new Set();
        this._overviewSignalId = 0;
    }

    _adoptOverviewSearch() {
        if (!this._enabled)
            return;

        const entry =
            Main.overview?.searchEntry ??
            null;
        if (!entry)
            return;

        decorateSearchEntry(entry);
        this._actors.add(entry);
    }

    setup() {
        if (this._enabled)
            return;

        this._enabled = true;
        this._adoptOverviewSearch();

        try {
            this._overviewSignalId =
                Main.overview.connect(
                    'showing',
                    () =>
                        this._adoptOverviewSearch()
                );
        } catch {
            this._overviewSignalId = 0;
        }
    }

    cleanup() {
        if (!this._enabled)
            return;

        this._enabled = false;

        if (this._overviewSignalId) {
            try {
                Main.overview.disconnect(
                    this._overviewSignalId
                );
            } catch {}
        }
        this._overviewSignalId = 0;

        for (const actor of this._actors) {
            try {
                actor.remove_style_class_name?.(
                    SEARCH_SURFACE_CLASS
                );
            } catch {}
        }

        this._actors.clear();
    }
}
