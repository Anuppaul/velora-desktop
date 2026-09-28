export function collectDockApps(appSystem, shellSettings) {
    const apps = [];
    const seen = new Set();

    const addApp = app => {
        if (!app)
            return;

        const id = app.get_id();
        if (!id || seen.has(id))
            return;

        seen.add(id);
        apps.push(app);
    };

    for (const id of shellSettings.get_strv('favorite-apps'))
        addApp(appSystem.lookup_app(id));

    for (const app of appSystem.get_running())
        addApp(app);

    return apps;
}
