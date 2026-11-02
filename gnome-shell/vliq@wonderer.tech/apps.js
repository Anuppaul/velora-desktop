function addUniqueApp(apps, seen, app) {
    if (!app)
        return;

    const id = app.get_id?.();
    if (!id || seen.has(id))
        return;

    seen.add(id);
    apps.push(app);
}

function visibleInstalledApps(appSystem) {
    // Shell.AppSystem.get_installed() returns GAppInfo objects. Resolve each
    // visible desktop ID back to Shell.App before it enters the Orb renderer;
    // Shell.App owns activation, running state and icon texture creation.
    const installedInfo =
        appSystem.get_installed?.() ?? [];
    const apps = [];
    const seen = new Set();

    for (const info of installedInfo) {
        let visible = true;
        try {
            visible =
                info.should_show?.() !== false;
        } catch {}

        if (!visible)
            continue;

        const id = info.get_id?.();
        if (!id)
            continue;

        addUniqueApp(
            apps,
            seen,
            appSystem.lookup_app(id)
        );
    }

    apps.sort((a, b) =>
        String(a.get_name?.() ?? '')
            .localeCompare(
                String(b.get_name?.() ?? ''),
                undefined,
                {
                    sensitivity: 'base',
                    numeric: true,
                }
            )
    );

    return apps;
}

export function collectDockApps(appSystem, shellSettings) {
    const apps = [];
    const seen = new Set();

    for (const id of shellSettings.get_strv('favorite-apps'))
        addUniqueApp(apps, seen, appSystem.lookup_app(id));

    for (const app of appSystem.get_running())
        addUniqueApp(apps, seen, app);

    return apps;
}

export function collectCustomApps(appSystem, appIds) {
    const apps = [];
    const seen = new Set();

    for (const id of appIds ?? [])
        addUniqueApp(apps, seen, appSystem.lookup_app(id));

    return apps;
}

export function collectAllApps(appSystem) {
    return visibleInstalledApps(appSystem);
}

export function collectOrbApps(
    appSystem,
    shellSettings,
    source,
    customAppIds = []
) {
    switch (source) {
    case 'custom':
        return collectCustomApps(
            appSystem,
            customAppIds
        );
    case 'all':
        return collectAllApps(appSystem);
    case 'dock':
    default:
        return collectDockApps(
            appSystem,
            shellSettings
        );
    }
}
