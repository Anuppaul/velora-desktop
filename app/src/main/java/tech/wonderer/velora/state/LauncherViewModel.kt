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
import tech.wonderer.velora.data.AppCatalog
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.data.LayoutStore
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
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

    var globalIconScale by mutableFloatStateOf(store.loadGlobalIconScale())
        private set

    var iconAppearance by mutableStateOf(store.loadIconAppearance())
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
        }
    }

    fun launch(packageName: String) {
        AppCatalog.launch(getApplication(), packageName)
    }

    fun pinToHome(app: InstalledApp) {
        val alreadyPinned = homeItems.any {
            it.packageName == app.packageName || app.packageName in it.members
        }
        if (alreadyPinned) return

        val index = homeItems.size
        val x = (0.08f + ((index * 0.19f) % 0.76f)).coerceIn(0.02f, 0.88f)
        val y = (0.22f + (((index / 4) * 0.17f) % 0.58f)).coerceIn(0.12f, 0.82f)

        homeItems = homeItems + HomeItem(
            id = "app-" + app.packageName,
            kind = HomeItemKind.APP,
            label = app.label,
            packageName = app.packageName,
            x = x,
            y = y,
        )
        persist()
    }

    fun commitMove(itemId: String, x: Float, y: Float) {
        var updated = homeItems.map {
            if (it.id == itemId) it.copy(x = x.coerceIn(0f, 1f), y = y.coerceIn(0f, 1f)) else it
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
                            )
                            updated.filterNot { it.id == dragged.id || it.id == target.id } + group
                        }
                    }

                    HomeItemKind.GROUP -> {
                        updated
                            .filterNot { it.id == dragged.id }
                            .map {
                                if (it.id == target.id) {
                                    it.copy(members = (it.members + dragged.packageName).distinct())
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

    fun addWidget(type: PremiumWidgetType) {
        if (homeWidgets.count { it.type == type } >= 2) return
        val index = homeWidgets.size
        homeWidgets = homeWidgets + HomeWidget(
            id = "widget-" + type.name.lowercase() + "-" + System.currentTimeMillis(),
            type = type,
            x = (0.08f + ((index * 0.16f) % 0.55f)).coerceAtMost(0.72f),
            y = (0.08f + ((index * 0.15f) % 0.62f)).coerceAtMost(0.75f),
        )
        persistWidgets()
    }

    fun commitWidgetMove(widgetId: String, x: Float, y: Float) {
        homeWidgets = homeWidgets.map {
            if (it.id == widgetId) {
                it.copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f),
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

    fun setGlobalIconScale(scale: Float) {
        globalIconScale = scale.coerceIn(0.72f, 1.35f)
        store.saveGlobalIconScale(globalIconScale)
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
        return loadedApps.take(positions.size).mapIndexed { index, app ->
            val (x, y) = positions[index]
            HomeItem(
                id = "app-" + app.packageName,
                kind = HomeItemKind.APP,
                label = app.label,
                packageName = app.packageName,
                x = x,
                y = y,
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
        ),
        HomeWidget(
            id = "widget-battery-default",
            type = PremiumWidgetType.BATTERY,
            x = 0.54f,
            y = 0.24f,
            scale = 0.88f,
        ),
    )

    private fun persist() {
        store.saveHomeItems(homeItems)
    }

    private fun persistWidgets() {
        store.saveHomeWidgets(homeWidgets)
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
