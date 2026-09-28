package tech.wonderer.velora.state

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import tech.wonderer.velora.data.AppCatalog
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.data.LayoutStore
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.model.HostedWidget
import tech.wonderer.velora.model.HomeTransitionMode
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.model.NavIconConfig
import tech.wonderer.velora.model.NavIconSlot
import tech.wonderer.velora.model.PremiumWidgetType
import tech.wonderer.velora.model.VeloraIconShape
import tech.wonderer.velora.model.VeloraIconStyle
import kotlin.math.sqrt

class LauncherViewModel(application: Application) : AndroidViewModel(application) {
    private val store = LayoutStore(application)

    var apps by mutableStateOf<List<InstalledApp>>(emptyList())
        private set

    var homeItems by mutableStateOf<List<HomeItem>>(emptyList())
        private set

    var homeWidgets by mutableStateOf<List<HomeWidget>>(emptyList())
        private set

    var hostedWidgets by mutableStateOf<List<HostedWidget>>(emptyList())
        private set

    var globalIconScale by mutableFloatStateOf(store.loadGlobalIconScale())
        private set

    var wallpaperBlur by mutableFloatStateOf(store.loadWallpaperBlur())
        private set

    var homeTransitionMode by mutableStateOf(store.loadHomeTransitionMode())
        private set

    var transitionSoftness by mutableFloatStateOf(store.loadTransitionSoftness())
        private set

    var navIcons by mutableStateOf(store.loadNavIcons())
        private set

    var iconAppearance by mutableStateOf(store.loadIconAppearance())
        private set

    var hiddenPackages by mutableStateOf(store.loadHiddenPackages())
        private set

    var recentPackages by mutableStateOf(store.loadRecentPackages())
        private set

    var onboardingComplete by mutableStateOf(store.isOnboardingComplete())
        private set

    init {
        viewModelScope.launch {
            val loadedApps = withContext(Dispatchers.IO) {
                AppCatalog.loadInstalledApps(getApplication())
            }
            apps = loadedApps

            val stored = store.loadHomeItems()
            homeItems = if (stored.isNotEmpty()) {
                expandLegacyHomePages(stored, loadedApps)
            } else {
                seedHome(loadedApps)
            }
            if (homeItems != stored && homeItems.isNotEmpty()) {
                store.saveHomeItems(homeItems)
            }

            homeWidgets = if (store.hasWidgetLayout()) {
                store.loadHomeWidgets()
            } else {
                seedWidgets().also(store::saveHomeWidgets)
            }

            hostedWidgets = store.loadHostedWidgets()
        }
    }

    fun visibleApps(): List<InstalledApp> {
        val usage = store.loadAppUsage()
        return apps
            .filterNot { it.packageName in hiddenPackages }
            .sortedWith(
                compareByDescending<InstalledApp> {
                    usage[it.packageName]?.first ?: 0
                }.thenByDescending {
                    usage[it.packageName]?.second ?: 0L
                }.thenBy {
                    it.label.lowercase()
                },
            )
    }

    fun launch(packageName: String) {
        recentPackages = (
            listOf(packageName) + recentPackages.filterNot { it == packageName }
            ).take(8)
        store.saveRecentPackages(recentPackages)
        store.recordAppLaunch(packageName)
        applyAdaptiveUsageLayout()
        AppCatalog.launch(getApplication(), packageName)
    }

    fun recentsForDisplay(): List<String> {
        val installed = apps.map { it.packageName }.toSet()
        val persisted = recentPackages.filter {
            it in installed && it !in hiddenPackages
        }
        if (persisted.isNotEmpty()) return persisted

        return visibleApps()
            .take(8)
            .map { it.packageName }
    }

    fun pinToHome(app: InstalledApp, page: Int = 0) {
        val pageItems = homeItems.count { it.page == page }
        val x = (0.08f + ((pageItems * 0.19f) % 0.76f)).coerceIn(0.02f, 0.88f)
        val y = (0.22f + (((pageItems / 4) * 0.17f) % 0.58f)).coerceIn(0.12f, 0.82f)
        pinToHomeAt(app, x, y, page)
    }

    fun pinToHomeAt(
        app: InstalledApp,
        x: Float,
        y: Float,
        page: Int = 0,
    ) {
        if (app.packageName in hiddenPackages) return
        val alreadyPinned = homeItems.any {
            it.packageName == app.packageName || app.packageName in it.members
        }
        if (alreadyPinned) return

        homeItems = homeItems + HomeItem(
            id = "app-" + app.packageName,
            kind = HomeItemKind.APP,
            label = app.label,
            packageName = app.packageName,
            x = x.coerceIn(0.02f, 0.88f),
            y = y.coerceIn(0.08f, 0.86f),
            zIndex = nextZ(),
            page = page.coerceAtLeast(0),
        )
        persist()
    }

    fun commitMove(itemId: String, x: Float, y: Float) {
        val raisedZ = nextZ()
        var updated = homeItems.map {
            if (it.id == itemId) {
                it.copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f),
                    zIndex = raisedZ,
                )
            } else {
                it
            }
        }

        val dragged = updated.firstOrNull { it.id == itemId }
        if (dragged?.kind == HomeItemKind.APP && dragged.packageName != null) {
            val target = updated
                .asSequence()
                .filter { it.id != dragged.id && it.page == dragged.page }
                .map { candidate -> candidate to distance(dragged, candidate) }
                .filter { (_, distance) -> distance < GROUP_DROP_DISTANCE }
                .minByOrNull { it.second }
                ?.first

            if (target != null) {
                updated = when (target.kind) {
                    HomeItemKind.APP -> {
                        val targetPackage = target.packageName
                        if (targetPackage == null) {
                            updated
                        } else {
                            val group = HomeItem(
                                id = "group-" + System.currentTimeMillis(),
                                kind = HomeItemKind.GROUP,
                                label = "Group",
                                members = listOf(targetPackage, dragged.packageName),
                                x = target.x,
                                y = target.y,
                                scale = maxOf(target.scale, dragged.scale),
                                zIndex = raisedZ,
                                page = dragged.page,
                            )
                            updated.filterNot { it.id == dragged.id || it.id == target.id } + group
                        }
                    }

                    HomeItemKind.GROUP -> {
                        updated
                            .filterNot { it.id == dragged.id }
                            .map {
                                if (it.id == target.id) {
                                    it.copy(
                                        members = (it.members + dragged.packageName).distinct(),
                                        zIndex = raisedZ,
                                    )
                                } else {
                                    it
                                }
                            }
                    }
                }
            }
        }

        homeItems = updated
        persist()
    }

    fun renameGroup(groupId: String, name: String) {
        val clean = name.trim().take(24)
        if (clean.isBlank()) return
        homeItems = homeItems.map {
            if (it.id == groupId && it.kind == HomeItemKind.GROUP) it.copy(label = clean) else it
        }
        persist()
    }

    fun ungroup(groupId: String) {
        val group = homeItems.firstOrNull {
            it.id == groupId && it.kind == HomeItemKind.GROUP
        } ?: return

        val offsets = listOf(
            -0.05f to -0.04f,
            0.05f to -0.04f,
            -0.05f to 0.05f,
            0.05f to 0.05f,
            0f to 0.10f,
        )
        val baseZ = nextZ()
        val restored = group.members.mapIndexed { index, packageName ->
            val offset = offsets[index % offsets.size]
            HomeItem(
                id = "app-" + packageName,
                kind = HomeItemKind.APP,
                label = labelForPackage(packageName),
                packageName = packageName,
                x = (group.x + offset.first).coerceIn(0f, 1f),
                y = (group.y + offset.second).coerceIn(0f, 1f),
                scale = group.scale.coerceAtMost(1.25f),
                zIndex = baseZ + index * 0.01f,
                page = group.page,
            )
        }

        homeItems = homeItems.filterNot { it.id == groupId } + restored
        persist()
    }

    fun setPackageHidden(packageName: String, hidden: Boolean) {
        hiddenPackages = if (hidden) {
            hiddenPackages + packageName
        } else {
            hiddenPackages - packageName
        }
        store.saveHiddenPackages(hiddenPackages)

        if (hidden) {
            homeItems = homeItems
                .mapNotNull { item ->
                    when (item.kind) {
                        HomeItemKind.APP -> {
                            if (item.packageName == packageName) null else item
                        }

                        HomeItemKind.GROUP -> {
                            val members = item.members.filterNot { it == packageName }
                            when {
                                members.isEmpty() -> null
                                members.size == 1 -> {
                                    val remaining = members.first()
                                    HomeItem(
                                        id = "app-" + remaining,
                                        kind = HomeItemKind.APP,
                                        label = labelForPackage(remaining),
                                        packageName = remaining,
                                        x = item.x,
                                        y = item.y,
                                        scale = item.scale,
                                        zIndex = item.zIndex,
                                        page = item.page,
                                    )
                                }

                                else -> item.copy(members = members)
                            }
                        }
                    }
                }
            persist()
        }
    }

    fun addWidget(type: PremiumWidgetType, page: Int = 0) {
        if (homeWidgets.count { it.type == type && it.page == page } >= 2) return
        val index = homeWidgets.size
        homeWidgets = homeWidgets + HomeWidget(
            id = "widget-" + type.name.lowercase() + "-" + System.currentTimeMillis(),
            type = type,
            x = (0.08f + ((index * 0.16f) % 0.55f)).coerceAtMost(0.72f),
            y = (0.08f + ((index * 0.15f) % 0.62f)).coerceAtMost(0.75f),
            zIndex = nextZ(),
            page = page.coerceAtLeast(0),
        )
        persistWidgets()
    }

    fun commitWidgetMove(widgetId: String, x: Float, y: Float) {
        val raisedZ = nextZ()
        homeWidgets = homeWidgets.map {
            if (it.id == widgetId) {
                it.copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f),
                    zIndex = raisedZ,
                )
            } else {
                it
            }
        }
        persistWidgets()
    }

    fun setWidgetScale(widgetId: String, scale: Float) {
        homeWidgets = homeWidgets.map {
            if (it.id == widgetId) it.copy(scale = scale.coerceIn(0.72f, 1.45f)) else it
        }
        persistWidgets()
    }

    fun addHostedWidget(
        appWidgetId: Int,
        provider: String,
        label: String,
        widthDp: Float,
        heightDp: Float,
        page: Int = 0,
    ) {
        hostedWidgets = hostedWidgets + HostedWidget(
            id = "android-widget-" + appWidgetId,
            appWidgetId = appWidgetId,
            provider = provider,
            label = label,
            x = 0.12f,
            y = 0.18f,
            widthDp = widthDp,
            heightDp = heightDp,
            zIndex = nextZ(),
            page = page.coerceAtLeast(0),
        )
        persistHostedWidgets()
    }

    fun commitHostedWidgetMove(widgetId: String, x: Float, y: Float) {
        val raisedZ = nextZ()
        hostedWidgets = hostedWidgets.map {
            if (it.id == widgetId) {
                it.copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f),
                    zIndex = raisedZ,
                )
            } else {
                it
            }
        }
        persistHostedWidgets()
    }

    fun setHostedWidgetScale(widgetId: String, scale: Float) {
        hostedWidgets = hostedWidgets.map {
            if (it.id == widgetId) it.copy(scale = scale.coerceIn(0.70f, 1.80f)) else it
        }
        persistHostedWidgets()
    }

    fun removeHostedWidget(widgetId: String) {
        hostedWidgets = hostedWidgets.filterNot { it.id == widgetId }
        persistHostedWidgets()
    }

    fun pruneHostedWidgets(validAppWidgetIds: Set<Int>) {
        val cleaned = hostedWidgets.filter { it.appWidgetId in validAppWidgetIds }
        if (cleaned.size != hostedWidgets.size) {
            hostedWidgets = cleaned
            persistHostedWidgets()
        }
    }

    fun removeWidget(widgetId: String) {
        homeWidgets = homeWidgets.filterNot { it.id == widgetId }
        persistWidgets()
    }

    fun setItemScale(itemId: String, scale: Float) {
        homeItems = homeItems.map {
            if (it.id == itemId) it.copy(scale = scale.coerceIn(0.6f, 1.8f)) else it
        }
        persist()
    }

    fun updateGlobalIconScale(scale: Float) {
        globalIconScale = scale.coerceIn(0.72f, 1.35f)
        store.saveGlobalIconScale(globalIconScale)
    }

    fun updateWallpaperBlur(value: Float) {
        wallpaperBlur = value.coerceIn(0f, 1f)
        store.saveWallpaperBlur(wallpaperBlur)
    }

    fun updateHomeTransitionMode(mode: HomeTransitionMode) {
        homeTransitionMode = mode
        store.saveHomeTransitionMode(mode)
    }

    fun updateTransitionSoftness(value: Float) {
        transitionSoftness = value.coerceIn(0f, 1f)
        store.saveTransitionSoftness(transitionSoftness)
    }

    fun setNavIcon(slot: NavIconSlot, uri: String?) {
        navIcons = navIcons.withUri(slot, uri)
        store.saveNavIcons(navIcons)
    }

    fun setIconStyle(style: VeloraIconStyle) {
        iconAppearance = iconAppearance.copy(style = style)
        persistIconAppearance()
    }

    fun setIconShape(shape: VeloraIconShape) {
        iconAppearance = iconAppearance.copy(shape = shape)
        persistIconAppearance()
    }

    fun setHomeLabelsVisible(visible: Boolean) {
        iconAppearance = iconAppearance.copy(showHomeLabels = visible)
        persistIconAppearance()
    }

    fun removeFromHome(itemId: String) {
        homeItems = homeItems.filterNot { it.id == itemId }
        persist()
    }

    fun completeOnboarding() {
        onboardingComplete = true
        store.setOnboardingComplete(true)
    }

    fun createBackupJson(): String {
        val root = JSONObject()
        root.put("format", "velora-backup")
        root.put("version", 5)
        root.put("globalIconScale", globalIconScale)
        root.put("wallpaperBlur", wallpaperBlur)
        root.put("homeTransitionMode", homeTransitionMode.name)
        root.put("transitionSoftness", transitionSoftness)
        root.put(
            "navIcons",
            JSONObject().apply {
                put("recentsUri", navIcons.recentsUri ?: "")
                put("homeUri", navIcons.homeUri ?: "")
                put("backUri", navIcons.backUri ?: "")
            },
        )
        root.put(
            "iconAppearance",
            JSONObject().apply {
                put("style", iconAppearance.style.name)
                put("shape", iconAppearance.shape.name)
                put("showHomeLabels", iconAppearance.showHomeLabels)
            },
        )
        root.put("hiddenPackages", JSONArray(hiddenPackages.toList()))
        root.put(
            "homeItems",
            JSONArray().apply {
                homeItems.forEach { item ->
                    put(
                        JSONObject().apply {
                            put("id", item.id)
                            put("kind", item.kind.name)
                            put("label", item.label)
                            put("packageName", item.packageName ?: "")
                            put("members", JSONArray(item.members))
                            put("x", item.x)
                            put("y", item.y)
                            put("scale", item.scale)
                            put("zIndex", item.zIndex)
                            put("page", item.page)
                        },
                    )
                }
            },
        )
        root.put(
            "homeWidgets",
            JSONArray().apply {
                homeWidgets.forEach { widget ->
                    put(
                        JSONObject().apply {
                            put("id", widget.id)
                            put("type", widget.type.name)
                            put("x", widget.x)
                            put("y", widget.y)
                            put("scale", widget.scale)
                            put("zIndex", widget.zIndex)
                            put("page", widget.page)
                        },
                    )
                }
            },
        )
        root.put(
            "hostedWidgetProviders",
            JSONArray().apply {
                hostedWidgets.forEach { widget ->
                    put(
                        JSONObject().apply {
                            put("provider", widget.provider)
                            put("label", widget.label)
                            put("x", widget.x)
                            put("y", widget.y)
                            put("widthDp", widget.widthDp)
                            put("heightDp", widget.heightDp)
                            put("scale", widget.scale)
                            put("page", widget.page)
                        },
                    )
                }
            },
        )
        return root.toString(2)
    }

    fun restoreBackupJson(raw: String): Boolean {
        return runCatching {
            val root = JSONObject(raw)
            require(root.optString("format") == "velora-backup")

            val itemsJson = root.getJSONArray("homeItems")
            val restoredItems = buildList {
                for (index in 0 until itemsJson.length()) {
                    val obj = itemsJson.getJSONObject(index)
                    val membersJson = obj.optJSONArray("members") ?: JSONArray()
                    val members = buildList {
                        for (memberIndex in 0 until membersJson.length()) {
                            add(membersJson.getString(memberIndex))
                        }
                    }
                    add(
                        HomeItem(
                            id = obj.getString("id"),
                            kind = HomeItemKind.valueOf(obj.getString("kind")),
                            label = obj.optString("label", "App"),
                            packageName = obj.optString("packageName").takeIf { it.isNotBlank() },
                            members = members,
                            x = obj.optDouble("x", 0.1).toFloat(),
                            y = obj.optDouble("y", 0.2).toFloat(),
                            scale = obj.optDouble("scale", 1.0).toFloat(),
                            zIndex = obj.optDouble("zIndex", index.toDouble()).toFloat(),
                            page = obj.optInt("page", 0).coerceAtLeast(0),
                        ),
                    )
                }
            }

            val widgetsJson = root.optJSONArray("homeWidgets") ?: JSONArray()
            val restoredWidgets = buildList {
                for (index in 0 until widgetsJson.length()) {
                    val obj = widgetsJson.getJSONObject(index)
                    add(
                        HomeWidget(
                            id = obj.getString("id"),
                            type = PremiumWidgetType.valueOf(obj.getString("type")),
                            x = obj.optDouble("x", 0.1).toFloat(),
                            y = obj.optDouble("y", 0.1).toFloat(),
                            scale = obj.optDouble("scale", 1.0).toFloat(),
                            zIndex = obj.optDouble("zIndex", index.toDouble()).toFloat(),
                            page = obj.optInt("page", 0).coerceAtLeast(0),
                        ),
                    )
                }
            }

            val appearanceJson = root.optJSONObject("iconAppearance")
            val restoredAppearance = IconAppearance(
                style = appearanceJson
                    ?.optString("style")
                    ?.takeIf { it.isNotBlank() }
                    ?.let { VeloraIconStyle.valueOf(it) }
                    ?: VeloraIconStyle.GLASS,
                shape = appearanceJson
                    ?.optString("shape")
                    ?.takeIf { it.isNotBlank() }
                    ?.let { VeloraIconShape.valueOf(it) }
                    ?: VeloraIconShape.SQUIRCLE,
                showHomeLabels = appearanceJson?.optBoolean("showHomeLabels", true) ?: true,
            )

            val hiddenJson = root.optJSONArray("hiddenPackages") ?: JSONArray()
            val restoredHidden = buildSet {
                for (index in 0 until hiddenJson.length()) {
                    add(hiddenJson.getString(index))
                }
            }

            homeItems = restoredItems
            homeWidgets = restoredWidgets
            globalIconScale = root.optDouble("globalIconScale", 1.0).toFloat()
                .coerceIn(0.72f, 1.35f)
            wallpaperBlur = root.optDouble("wallpaperBlur", 0.42).toFloat()
                .coerceIn(0f, 1f)
            homeTransitionMode = runCatching {
                HomeTransitionMode.valueOf(
                    root.optString("homeTransitionMode", HomeTransitionMode.JELLY.name),
                )
            }.getOrDefault(HomeTransitionMode.JELLY)
            transitionSoftness = root.optDouble("transitionSoftness", 0.62).toFloat()
                .coerceIn(0f, 1f)
            val navJson = root.optJSONObject("navIcons")
            navIcons = NavIconConfig(
                recentsUri = navJson?.optString("recentsUri")?.takeIf { it.isNotBlank() },
                homeUri = navJson?.optString("homeUri")?.takeIf { it.isNotBlank() },
                backUri = navJson?.optString("backUri")?.takeIf { it.isNotBlank() },
            )
            iconAppearance = restoredAppearance
            hiddenPackages = restoredHidden

            store.saveHomeItems(homeItems)
            store.saveHomeWidgets(homeWidgets)
            store.saveGlobalIconScale(globalIconScale)
            store.saveWallpaperBlur(wallpaperBlur)
            store.saveHomeTransitionMode(homeTransitionMode)
            store.saveTransitionSoftness(transitionSoftness)
            store.saveNavIcons(navIcons)
            store.saveIconAppearance(iconAppearance)
            store.saveHiddenPackages(hiddenPackages)
            true
        }.getOrDefault(false)
    }

    fun labelForPackage(packageName: String): String =
        apps.firstOrNull { it.packageName == packageName }?.label ?: packageName

    private fun applyAdaptiveUsageLayout() {
        val usage = store.loadAppUsage()
        if (usage.isEmpty()) return

        val slots = listOf(
            0.08f to 0.40f,
            0.39f to 0.38f,
            0.70f to 0.42f,
            0.12f to 0.58f,
            0.42f to 0.57f,
            0.72f to 0.60f,
            0.08f to 0.76f,
            0.39f to 0.75f,
            0.70f to 0.78f,
            0.18f to 0.88f,
            0.56f to 0.88f,
        )

        val updates = mutableMapOf<String, HomeItem>()

        homeItems
            .filter { it.kind == HomeItemKind.APP && it.packageName != null }
            .groupBy { it.page }
            .forEach { (_, pageItems) ->
                val ranked = pageItems.sortedWith(
                    compareByDescending<HomeItem> {
                        usage[it.packageName]?.first ?: 0
                    }.thenByDescending {
                        usage[it.packageName]?.second ?: 0L
                    },
                )
                val maxCount = ranked.maxOfOrNull {
                    usage[it.packageName]?.first ?: 0
                }?.coerceAtLeast(1) ?: 1

                ranked.forEachIndexed { index, item ->
                    val packageName = item.packageName ?: return@forEachIndexed
                    val count = usage[packageName]?.first ?: 0
                    val normalized = sqrt(count.toFloat() / maxCount.toFloat())
                    val adaptiveScale = (0.78f + normalized * 0.54f)
                        .coerceIn(0.78f, 1.32f)
                    val slot = slots[index % slots.size]
                    val overflowBand = index / slots.size
                    val y = (slot.second + overflowBand * 0.035f).coerceAtMost(0.90f)

                    updates[item.id] = item.copy(
                        x = slot.first,
                        y = y,
                        scale = adaptiveScale,
                    )
                }
            }

        if (updates.isNotEmpty()) {
            homeItems = homeItems.map { updates[it.id] ?: it }
            persist()
        }
    }

    private fun expandLegacyHomePages(
        existing: List<HomeItem>,
        loadedApps: List<InstalledApp>,
    ): List<HomeItem> {
        if (existing.any { it.page > 0 }) return existing

        val occupiedPackages = buildSet {
            existing.forEach { item ->
                item.packageName?.let { add(it) }
                addAll(item.members)
            }
        }
        val positions = listOf(
            0.08f to 0.43f,
            0.39f to 0.39f,
            0.71f to 0.48f,
            0.18f to 0.62f,
            0.56f to 0.66f,
            0.76f to 0.78f,
        )
        val candidates = loadedApps
            .filterNot { it.packageName in hiddenPackages || it.packageName in occupiedPackages }
            .take(positions.size * 2)

        if (candidates.isEmpty()) return existing

        val appended = candidates.mapIndexed { index, app ->
            val page = 1 + index / positions.size
            val (x, y) = positions[index % positions.size]
            HomeItem(
                id = "app-" + app.packageName,
                kind = HomeItemKind.APP,
                label = app.label,
                packageName = app.packageName,
                x = x,
                y = y,
                zIndex = 40f + index,
                page = page.coerceAtMost(2),
            )
        }

        return existing + appended
    }

    private fun seedHome(loadedApps: List<InstalledApp>): List<HomeItem> {
        val positions = listOf(
            0.08f to 0.43f,
            0.39f to 0.39f,
            0.71f to 0.48f,
            0.18f to 0.62f,
            0.56f to 0.66f,
            0.76f to 0.78f,
        )

        return loadedApps
            .filterNot { it.packageName in hiddenPackages }
            .take(positions.size * 3)
            .mapIndexed { index, app ->
                val page = index / positions.size
                val (x, y) = positions[index % positions.size]
                HomeItem(
                    id = "app-" + app.packageName,
                    kind = HomeItemKind.APP,
                    label = app.label,
                    packageName = app.packageName,
                    x = x,
                    y = y,
                    zIndex = 10f + index,
                    page = page,
                )
            }
    }

    private fun seedWidgets(): List<HomeWidget> = listOf(
        HomeWidget(
            id = "widget-clock-default",
            type = PremiumWidgetType.CLOCK,
            x = 0.08f,
            y = 0.07f,
            scale = 1f,
            zIndex = 1f,
            page = 0,
        ),
        HomeWidget(
            id = "widget-battery-default",
            type = PremiumWidgetType.BATTERY,
            x = 0.54f,
            y = 0.24f,
            scale = 0.88f,
            zIndex = 2f,
            page = 0,
        ),
    )

    private fun nextZ(): Float {
        val itemMax = homeItems.maxOfOrNull { it.zIndex } ?: 0f
        val widgetMax = homeWidgets.maxOfOrNull { it.zIndex } ?: 0f
        val hostedMax = hostedWidgets.maxOfOrNull { it.zIndex } ?: 0f
        return maxOf(itemMax, widgetMax, hostedMax) + 1f
    }

    private fun persist() {
        store.saveHomeItems(homeItems)
    }

    private fun persistWidgets() {
        store.saveHomeWidgets(homeWidgets)
    }

    private fun persistHostedWidgets() {
        store.saveHostedWidgets(hostedWidgets)
    }

    private fun persistIconAppearance() {
        store.saveIconAppearance(iconAppearance)
    }

    private fun distance(a: HomeItem, b: HomeItem): Float {
        val dx = a.x - b.x
        val dy = a.y - b.y
        return sqrt(dx * dx + dy * dy)
    }

    private companion object {
        const val GROUP_DROP_DISTANCE = 0.105f
    }
}
