package tech.wonderer.velora.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.model.PremiumWidgetType
import tech.wonderer.velora.model.VeloraIconShape
import tech.wonderer.velora.model.VeloraIconStyle
import tech.wonderer.velora.ui.components.LocalVeloraPalette
import tech.wonderer.velora.ui.components.ModalBackdrop
import tech.wonderer.velora.ui.components.VeloraPalette
import tech.wonderer.velora.ui.components.VeloraIconAppearanceProvider
import kotlin.math.sqrt

private enum class SimulationOverlay {
    NONE,
    DRAWER,
    NOTIFICATIONS,
    CONTROL_CENTER,
    SETTINGS,
    WIDGET_PICKER,
    RECENTS,
}

@Composable
fun VeloraSimulationRoot(
    initialScreen: String = "",
) {
    var items by remember { mutableStateOf(simulationItems()) }
    var widgets by remember { mutableStateOf(simulationWidgets()) }
    var globalScale by remember { mutableFloatStateOf(0.98f) }
    var wallpaperBlur by remember { mutableFloatStateOf(0.42f) }
    var appearance by remember {
        mutableStateOf(
            IconAppearance(
                style = VeloraIconStyle.GLASS,
                shape = VeloraIconShape.SQUIRCLE,
                showHomeLabels = true,
            ),
        )
    }
    var overlay by remember(initialScreen) {
        mutableStateOf(simulationOverlayFor(initialScreen))
    }
    var groupId by remember { mutableStateOf<String?>(null) }
    var editingItemId by remember { mutableStateOf<String?>(null) }
    var editingWidgetId by remember { mutableStateOf<String?>(null) }
    var homeEditMode by remember { mutableStateOf(false) }
    var wallpaperVariant by remember { mutableIntStateOf(0) }
    var simulatedPackage by remember { mutableStateOf<String?>(null) }
    var recentPackages by remember {
        mutableStateOf(
            listOf(
                "velora.sim.music",
                "velora.sim.messages",
                "velora.sim.camera",
            ),
        )
    }

    fun openSimulationApp(packageName: String) {
        simulatedPackage = packageName
        recentPackages = (
            listOf(packageName) + recentPackages.filterNot { it == packageName }
            ).take(5)
        overlay = SimulationOverlay.NONE
        homeEditMode = false
    }

    fun nextZ(): Float {
        val itemMax = items.maxOfOrNull { it.zIndex } ?: 0f
        val widgetMax = widgets.maxOfOrNull { it.zIndex } ?: 0f
        return maxOf(itemMax, widgetMax) + 1f
    }

    fun commitMove(
        itemId: String,
        x: Float,
        y: Float,
    ) {
        val raised = nextZ()
        var updated = items.map {
            if (it.id == itemId) {
                it.copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f),
                    zIndex = raised,
                )
            } else {
                it
            }
        }

        val dragged = updated.firstOrNull { it.id == itemId }
        if (dragged?.kind == HomeItemKind.APP && dragged.packageName != null) {
            val target = updated
                .filter { it.id != dragged.id }
                .map { it to simulationDistance(dragged, it) }
                .filter { it.second < 0.105f }
                .minByOrNull { it.second }
                ?.first

            if (target != null) {
                updated = when (target.kind) {
                    HomeItemKind.APP -> {
                        val targetPackage = target.packageName
                        if (targetPackage == null) {
                            updated
                        } else {
                            updated.filterNot {
                                it.id == dragged.id || it.id == target.id
                            } + HomeItem(
                                id = "sim-group-" + System.nanoTime(),
                                kind = HomeItemKind.GROUP,
                                label = "Studio",
                                members = listOf(targetPackage, dragged.packageName),
                                x = target.x,
                                y = target.y,
                                scale = maxOf(target.scale, dragged.scale),
                                zIndex = raised,
                            )
                        }
                    }

                    HomeItemKind.GROUP -> {
                        updated
                            .filterNot { it.id == dragged.id }
                            .map {
                                if (it.id == target.id) {
                                    it.copy(
                                        members = (it.members + dragged.packageName).distinct(),
                                        zIndex = raised,
                                    )
                                } else {
                                    it
                                }
                            }
                    }
                }
            }
        }

        items = updated
    }

    fun commitWidgetMove(
        widgetId: String,
        x: Float,
        y: Float,
    ) {
        val raised = nextZ()
        widgets = widgets.map {
            if (it.id == widgetId) {
                it.copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f),
                    zIndex = raised,
                )
            } else {
                it
            }
        }
    }

    fun closeTopLayer() {
        when {
            simulatedPackage != null -> simulatedPackage = null
            editingItemId != null -> editingItemId = null
            editingWidgetId != null -> editingWidgetId = null
            groupId != null -> groupId = null
            overlay != SimulationOverlay.NONE -> overlay = SimulationOverlay.NONE
            homeEditMode -> homeEditMode = false
        }
    }

    BackHandler(
        enabled = simulatedPackage != null ||
            editingItemId != null ||
            editingWidgetId != null ||
            groupId != null ||
            overlay != SimulationOverlay.NONE ||
            homeEditMode,
        onBack = { closeTopLayer() },
    )

    CompositionLocalProvider(
        LocalVeloraPalette provides VeloraPalette(
            accent = Color(0xFFC7BAFF),
            secondary = Color(0xFF8FE2FF),
            glassTop = Color.White.copy(alpha = 0.22f),
            glassMiddle = Color(0xFFB7A7FF).copy(alpha = 0.10f),
            glassBottom = Color(0xFF080910).copy(alpha = 0.34f),
        ),
    ) {
        VeloraIconAppearanceProvider(appearance) {
            Box(
                modifier = Modifier.fillMaxSize(),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .blur((wallpaperBlur * 30f).dp)
                        .background(
                            Brush.verticalGradient(
                                colors = simulationWallpaperColors(wallpaperVariant),
                            ),
                        ),
                ) {
                    SimulationWallpaperGlow(wallpaperVariant)
                }

                HomeCanvas(
                    items = items,
                    widgets = widgets,
                    globalScale = globalScale,
                    onLaunch = ::openSimulationApp,
                    onMoveCommitted = ::commitMove,
                    onWidgetMoveCommitted = ::commitWidgetMove,
                    onGroupOpen = { groupId = it },
                    onItemEdit = {
                        homeEditMode = true
                        editingItemId = it
                    },
                    onWidgetEdit = {
                        homeEditMode = true
                        editingWidgetId = it
                    },
                    onSwipeUp = {
                        homeEditMode = false
                        overlay = SimulationOverlay.DRAWER
                    },
                    onSwipeDownLeft = {
                        homeEditMode = false
                        overlay = SimulationOverlay.NOTIFICATIONS
                    },
                    onSwipeDownRight = {
                        homeEditMode = false
                        overlay = SimulationOverlay.CONTROL_CENTER
                    },
                    onHomeLongPress = { homeEditMode = true },
                    editMode = homeEditMode,
                )

                if (
                    overlay == SimulationOverlay.SETTINGS ||
                    overlay == SimulationOverlay.WIDGET_PICKER ||
                    groupId != null ||
                    editingItemId != null ||
                    editingWidgetId != null
                ) {
                    ModalBackdrop()
                }

                when (overlay) {
                    SimulationOverlay.DRAWER -> AppDrawer(
                        apps = simulationApps(),
                        onLaunch = ::openSimulationApp,
                        onPin = { app ->
                            if (items.none { it.packageName == app.packageName }) {
                                items = items + HomeItem(
                                    id = "sim-" + app.packageName,
                                    kind = HomeItemKind.APP,
                                    label = app.label,
                                    packageName = app.packageName,
                                    x = 0.12f,
                                    y = 0.72f,
                                    zIndex = nextZ(),
                                )
                            }
                        },
                        onDropToHome = { app, x, y ->
                            if (items.none { it.packageName == app.packageName }) {
                                items = items + HomeItem(
                                    id = "sim-" + app.packageName,
                                    kind = HomeItemKind.APP,
                                    label = app.label,
                                    packageName = app.packageName,
                                    x = x,
                                    y = y,
                                    zIndex = nextZ(),
                                )
                            }
                        },
                        onHide = {},
                        onClose = { overlay = SimulationOverlay.NONE },
                        systemActionsEnabled = false,
                    )

                    SimulationOverlay.NOTIFICATIONS -> SimulationNotificationCenter(
                        onClose = { overlay = SimulationOverlay.NONE },
                    )

                    SimulationOverlay.CONTROL_CENTER -> SimulationControlCenter(
                        onClose = { overlay = SimulationOverlay.NONE },
                    )

                    SimulationOverlay.SETTINGS -> SimulationSettingsPanel(
                        globalScale = globalScale,
                        wallpaperBlur = wallpaperBlur,
                        appearance = appearance,
                        onScale = { globalScale = it },
                        onWallpaperBlur = { wallpaperBlur = it },
                        onStyle = {
                            appearance = appearance.copy(style = nextSimulationStyle(appearance.style))
                        },
                        onShape = {
                            appearance = appearance.copy(shape = nextSimulationShape(appearance.shape))
                        },
                        onLabels = {
                            appearance = appearance.copy(
                                showHomeLabels = !appearance.showHomeLabels,
                            )
                        },
                        onWidgets = { overlay = SimulationOverlay.WIDGET_PICKER },
                        onClose = { overlay = SimulationOverlay.NONE },
                    )

                    SimulationOverlay.RECENTS -> SimulationRecentsPanel(
                        recentPackages = recentPackages,
                        labelForPackage = { packageName ->
                            simulationApps()
                                .firstOrNull { it.packageName == packageName }
                                ?.label
                                ?: packageName.substringAfterLast('.')
                        },
                        onOpen = ::openSimulationApp,
                        onClose = { overlay = SimulationOverlay.NONE },
                    )

                    SimulationOverlay.WIDGET_PICKER -> WidgetPicker(
                        onAdd = { type ->
                            widgets = widgets + HomeWidget(
                                id = "sim-widget-" + System.nanoTime(),
                                type = type,
                                x = 0.15f,
                                y = 0.18f,
                                zIndex = nextZ(),
                            )
                        },
                        onAndroidWidgets = null,
                        onClose = { overlay = SimulationOverlay.NONE },
                    )

                    SimulationOverlay.NONE -> Unit
                }

                groupId
                    ?.let { id -> items.firstOrNull { it.id == id } }
                    ?.takeIf { it.kind == HomeItemKind.GROUP }
                    ?.let { group ->
                        GroupOverlay(
                            item = group,
                            labelForPackage = { packageName ->
                                simulationApps()
                                    .firstOrNull { it.packageName == packageName }
                                    ?.label
                                    ?: packageName.substringAfterLast('.')
                            },
                            onLaunch = { packageName ->
                                groupId = null
                                openSimulationApp(packageName)
                            },
                            onClose = { groupId = null },
                        )
                    }

                editingItemId
                    ?.let { id -> items.firstOrNull { it.id == id } }
                    ?.let { item ->
                        ItemEditSheet(
                            item = item,
                            onScaleChanged = { scale ->
                                items = items.map {
                                    if (it.id == item.id) it.copy(scale = scale) else it
                                }
                            },
                            onRenameGroup = { name ->
                                items = items.map {
                                    if (it.id == item.id) it.copy(label = name) else it
                                }
                            },
                            onUngroup = {
                                if (item.kind == HomeItemKind.GROUP) {
                                    val restored = item.members.mapIndexed { index, packageName ->
                                        HomeItem(
                                            id = "sim-" + packageName,
                                            kind = HomeItemKind.APP,
                                            label = simulationApps()
                                                .firstOrNull { it.packageName == packageName }
                                                ?.label
                                                ?: packageName.substringAfterLast('.'),
                                            packageName = packageName,
                                            x = (item.x + index * 0.07f).coerceIn(0f, 1f),
                                            y = (item.y + index * 0.05f).coerceIn(0f, 1f),
                                            zIndex = nextZ() + index,
                                        )
                                    }
                                    items = items.filterNot { it.id == item.id } + restored
                                }
                                editingItemId = null
                            },
                            onRemove = {
                                items = items.filterNot { it.id == item.id }
                                editingItemId = null
                            },
                            onClose = { editingItemId = null },
                        )
                    }

                editingWidgetId
                    ?.let { id -> widgets.firstOrNull { it.id == id } }
                    ?.let { widget ->
                        WidgetEditSheet(
                            widget = widget,
                            onScaleChanged = { scale ->
                                widgets = widgets.map {
                                    if (it.id == widget.id) it.copy(scale = scale) else it
                                }
                            },
                            onRemove = {
                                widgets = widgets.filterNot { it.id == widget.id }
                                editingWidgetId = null
                            },
                            onClose = { editingWidgetId = null },
                        )
                    }

                simulatedPackage?.let { packageName ->
                    val label = simulationApps()
                        .firstOrNull { it.packageName == packageName }
                        ?.label
                        ?: packageName.substringAfterLast('.')
                    SimulationAppPreview(
                        packageName = packageName,
                        label = label,
                    )
                }

                AnimatedVisibility(
                    visible = homeEditMode &&
                        simulatedPackage == null &&
                        overlay == SimulationOverlay.NONE &&
                        groupId == null &&
                        editingItemId == null &&
                        editingWidgetId == null,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .zIndex(90f)
                        .padding(start = 16.dp, end = 16.dp, bottom = 88.dp),
                    enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                ) {
                    HomeEditBar(
                        onWidgets = { overlay = SimulationOverlay.WIDGET_PICKER },
                        onWallpaper = {
                            wallpaperVariant = (wallpaperVariant + 1) % 3
                        },
                        onSettings = { overlay = SimulationOverlay.SETTINGS },
                        onDone = { homeEditMode = false },
                    )
                }

                VeloraNavBar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .zIndex(100f)
                        .padding(horizontal = 16.dp, vertical = 16.dp),
                    onRecents = {
                        simulatedPackage = null
                        homeEditMode = false
                        overlay = SimulationOverlay.RECENTS
                    },
                    onHome = {
                        overlay = SimulationOverlay.NONE
                        groupId = null
                        editingItemId = null
                        editingWidgetId = null
                        simulatedPackage = null
                        homeEditMode = false
                    },
                    onBack = { closeTopLayer() },
                    onSettings = {
                        if (overlay == SimulationOverlay.NONE) {
                            homeEditMode = true
                        } else {
                            overlay = SimulationOverlay.SETTINGS
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun SimulationWallpaperGlow(variant: Int) {
    val primary = when (variant) {
        1 -> Color(0xFFFF8EB8)
        2 -> Color(0xFF55E0C2)
        else -> Color(0xFF9B87FF)
    }
    val secondary = when (variant) {
        1 -> Color(0xFFFFC36C)
        2 -> Color(0xFF58A8FF)
        else -> Color(0xFF4ECFF5)
    }

    Canvas(Modifier.fillMaxSize()) {
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    primary.copy(alpha = 0.28f),
                    Color.Transparent,
                ),
                center = Offset(size.width * 0.20f, size.height * 0.18f),
                radius = size.width * 0.72f,
            ),
            radius = size.width * 0.72f,
            center = Offset(size.width * 0.20f, size.height * 0.18f),
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    secondary.copy(alpha = 0.19f),
                    Color.Transparent,
                ),
                center = Offset(size.width * 0.94f, size.height * 0.66f),
                radius = size.width * 0.58f,
            ),
            radius = size.width * 0.58f,
            center = Offset(size.width * 0.94f, size.height * 0.66f),
        )
    }
}

@Composable
private fun SimulationSettingsPanel(
    globalScale: Float,
    wallpaperBlur: Float,
    appearance: IconAppearance,
    onScale: (Float) -> Unit,
    onWallpaperBlur: (Float) -> Unit,
    onStyle: () -> Unit,
    onShape: () -> Unit,
    onLabels: () -> Unit,
    onWidgets: () -> Unit,
    onClose: () -> Unit,
) {
    GlassSimulationSettings(
        globalScale = globalScale,
        wallpaperBlur = wallpaperBlur,
        appearance = appearance,
        onScale = onScale,
        onWallpaperBlur = onWallpaperBlur,
        onStyle = onStyle,
        onShape = onShape,
        onLabels = onLabels,
        onWidgets = onWidgets,
        onClose = onClose,
    )
}

private fun simulationApps(): List<InstalledApp> = listOf(
    InstalledApp("Messages", "velora.sim.messages"),
    InstalledApp("Camera", "velora.sim.camera"),
    InstalledApp("Maps", "velora.sim.maps"),
    InstalledApp("Music", "velora.sim.music"),
    InstalledApp("Files", "velora.sim.files"),
    InstalledApp("Notes", "velora.sim.notes"),
    InstalledApp("Browser", "velora.sim.browser"),
    InstalledApp("Calendar", "velora.sim.calendar"),
    InstalledApp("Studio", "velora.sim.studio"),
    InstalledApp("Mail", "velora.sim.mail"),
    InstalledApp("Photos", "velora.sim.photos"),
    InstalledApp("Tasks", "velora.sim.tasks"),
)

private fun simulationItems(): List<HomeItem> = listOf(
    HomeItem(
        id = "sim-messages",
        kind = HomeItemKind.APP,
        label = "Messages",
        packageName = "velora.sim.messages",
        x = 0.08f,
        y = 0.43f,
        scale = 1.08f,
        zIndex = 10f,
    ),
    HomeItem(
        id = "sim-camera",
        kind = HomeItemKind.APP,
        label = "Camera",
        packageName = "velora.sim.camera",
        x = 0.72f,
        y = 0.39f,
        scale = 0.90f,
        zIndex = 11f,
    ),
    HomeItem(
        id = "sim-music",
        kind = HomeItemKind.APP,
        label = "Music",
        packageName = "velora.sim.music",
        x = 0.42f,
        y = 0.58f,
        scale = 1.30f,
        zIndex = 12f,
    ),
    HomeItem(
        id = "sim-files",
        kind = HomeItemKind.APP,
        label = "Files",
        packageName = "velora.sim.files",
        x = 0.12f,
        y = 0.70f,
        scale = 0.82f,
        zIndex = 13f,
    ),
    HomeItem(
        id = "sim-group",
        kind = HomeItemKind.GROUP,
        label = "Work",
        members = listOf(
            "velora.sim.notes",
            "velora.sim.mail",
            "velora.sim.tasks",
            "velora.sim.calendar",
        ),
        x = 0.72f,
        y = 0.68f,
        scale = 1.04f,
        zIndex = 14f,
    ),
)

private fun simulationWidgets(): List<HomeWidget> = listOf(
    HomeWidget(
        id = "sim-clock",
        type = PremiumWidgetType.CLOCK,
        x = 0.07f,
        y = 0.07f,
        scale = 1f,
        zIndex = 2f,
    ),
    HomeWidget(
        id = "sim-battery",
        type = PremiumWidgetType.BATTERY,
        x = 0.55f,
        y = 0.24f,
        scale = 0.96f,
        zIndex = 3f,
    ),
)

private fun simulationOverlayFor(screen: String): SimulationOverlay = when (screen.lowercase()) {
    "drawer", "apps" -> SimulationOverlay.DRAWER
    "notifications", "notification", "notification-center", "notification_center" ->
        SimulationOverlay.NOTIFICATIONS
    "control", "control-center", "control_center" -> SimulationOverlay.CONTROL_CENTER
    "settings" -> SimulationOverlay.SETTINGS
    "widgets", "widget-picker", "widget_picker" -> SimulationOverlay.WIDGET_PICKER
    else -> SimulationOverlay.NONE
}

private fun simulationDistance(
    a: HomeItem,
    b: HomeItem,
): Float {
    val dx = a.x - b.x
    val dy = a.y - b.y
    return sqrt(dx * dx + dy * dy)
}

private fun nextSimulationStyle(style: VeloraIconStyle): VeloraIconStyle = when (style) {
    VeloraIconStyle.GLASS -> VeloraIconStyle.AURORA
    VeloraIconStyle.AURORA -> VeloraIconStyle.ORIGINAL
    VeloraIconStyle.ORIGINAL -> VeloraIconStyle.GLASS
}

private fun nextSimulationShape(shape: VeloraIconShape): VeloraIconShape = when (shape) {
    VeloraIconShape.SQUIRCLE -> VeloraIconShape.CIRCLE
    VeloraIconShape.CIRCLE -> VeloraIconShape.SOFT_SQUARE
    VeloraIconShape.SOFT_SQUARE -> VeloraIconShape.SQUIRCLE
}


private fun simulationWallpaperColors(variant: Int): List<Color> = when (variant) {
    1 -> listOf(
        Color(0xFF1E1320),
        Color(0xFF22141D),
        Color(0xFF090A11),
    )
    2 -> listOf(
        Color(0xFF0D1D1B),
        Color(0xFF101C27),
        Color(0xFF070A10),
    )
    else -> listOf(
        Color(0xFF10121A),
        Color(0xFF151329),
        Color(0xFF090A11),
    )
}
