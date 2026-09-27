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
import tech.wonderer.velora.model.IconAppearance
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

    var iconAppearance by mutableStateOf(store.loadIconAppearance())
        private set

    var hiddenPackages by mutableStateOf(store.loadHiddenPackages())
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
            homeItems = if (stored.isNotEmpty()) stored else seedHome(loadedApps)
            if (stored.isEmpty() && homeItems.isNotEmpty()) {
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

    fun visibleApps(): List<InstalledApp> =
        apps.filterNot { it.packageName in hiddenPackages }

    fun launch(packageName: String) {
        AppCatalog.launch(getApplication(), packageName)
    }

    fun pinToHome(app: InstalledApp) {
        val index = homeItems.size
        val x = (0.08f + ((index * 0.19f) % 0.76f)).coerceIn(0.02f, 0.88f)
        val y = (0.22f + (((index / 4) * 0.17f) % 0.58f)).coerceIn(0.12f, 0.82f)
        pinToHomeAt(app, x, y)
    }

    fun pinToHomeAt(
        app: InstalledApp,
        x: Float,
        y: Float,
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
                .filter { it.id != dragged.id }
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

    fun addWidget(type: PremiumWidgetType) {
        if (homeWidgets.count { it.type == type } >= 2) return
        val index = homeWidgets.size
        homeWidgets = homeWidgets + HomeWidget(
            id = "widget-" + type.name.lowercase() + "-" + System.currentTimeMillis(),
            type = type,
            x = (0.08f + ((index * 0.16f) % 0.55f)).coerceAtMost(0.72f),
            y = (0.08f + ((index * 0.15f) % 0.62f)).coerceAtMost(0.75f),
            zIndex = nextZ(),
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
        root.put("version", 4)
        root.put("globalIconScale", globalIconScale)
        root.put("wallpaperBlur", wallpaperBlur)
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
            iconAppearance = restoredAppearance
            hiddenPackages = restoredHidden

            store.saveHomeItems(homeItems)
            store.saveHomeWidgets(homeWidgets)
            store.saveGlobalIconScale(globalIconScale)
            store.saveWallpaperBlur(wallpaperBlur)
            store.saveIconAppearance(iconAppearance)
            store.saveHiddenPackages(hiddenPackages)
            true
        }.getOrDefault(false)
    }

    fun labelForPackage(packageName: String): String =
        apps.firstOrNull { it.packageName == packageName }?.label ?: packageName

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
            .take(positions.size)
            .mapIndexed { index, app ->
                val (x, y) = positions[index]
                HomeItem(
                    id = "app-" + app.packageName,
                    kind = HomeItemKind.APP,
                    label = app.label,
                    packageName = app.packageName,
                    x = x,
                    y = y,
                    zIndex = 10f + index,
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
        ),
        HomeWidget(
            id = "widget-battery-default",
            type = PremiumWidgetType.BATTERY,
            x = 0.54f,
            y = 0.24f,
            scale = 0.88f,
            zIndex = 2f,
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
