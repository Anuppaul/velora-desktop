package tech.wonderer.velora.ui

import android.app.Activity
import android.appwidget.AppWidgetProviderInfo
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.viewmodel.compose.viewModel
import tech.wonderer.velora.BuildConfig
import tech.wonderer.velora.data.AndroidWidgetHostController
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeTransitionMode
import tech.wonderer.velora.model.NavIconConfig
import tech.wonderer.velora.service.VeloraNavActions
import tech.wonderer.velora.state.LauncherViewModel
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.WallpaperBlurHost
import tech.wonderer.velora.ui.components.ModalBackdrop
import tech.wonderer.velora.ui.components.NavIconAsset
import tech.wonderer.velora.ui.components.VeloraAmbientProvider
import tech.wonderer.velora.ui.components.VeloraIconAppearanceProvider

private data class PendingHostedWidget(
    val appWidgetId: Int,
    val provider: String,
    val label: String,
    val widthDp: Float,
    val heightDp: Float,
)

private enum class Overlay {
    NONE,
    RECENTS,
    DRAWER,
    NOTIFICATIONS,
    CONTROL_CENTER,
    SETTINGS,
    WIDGET_PICKER,
    ANDROID_WIDGET_PICKER,
    HIDDEN_APPS,
}

private const val HOME_PAGE_COUNT = 3

@Composable
fun VeloraRoot(
    androidWidgetHost: AndroidWidgetHostController,
    launcher: LauncherViewModel = viewModel(),
) {
    val context = LocalContext.current

    LaunchedEffect(androidWidgetHost) {
        launcher.pruneHostedWidgets(androidWidgetHost.hostedIds())
    }
    var overlay by remember { mutableStateOf(Overlay.NONE) }
    var groupId by remember { mutableStateOf<String?>(null) }
    var editingItemId by remember { mutableStateOf<String?>(null) }
    var editingWidgetId by remember { mutableStateOf<String?>(null) }
    var editingHostedWidgetId by remember { mutableStateOf<String?>(null) }
    var homeEditMode by remember { mutableStateOf(false) }
    var pendingHostedWidget by remember { mutableStateOf<PendingHostedWidget?>(null) }
    var currentHomePage by remember { mutableIntStateOf(0) }

    fun setHomePage(page: Int) {
        val next = page.coerceIn(0, HOME_PAGE_COUNT - 1)
        if (next != currentHomePage) {
            editingItemId = null
            groupId = null
            currentHomePage = next
        }
    }

    fun launchPackage(packageName: String) {
        launcher.launch(packageName)
    }

    fun cancelPendingHostedWidget() {
        pendingHostedWidget?.let { androidWidgetHost.deleteId(it.appWidgetId) }
        pendingHostedWidget = null
    }

    fun finishPendingHostedWidget() {
        val pending = pendingHostedWidget ?: return
        launcher.addHostedWidget(
            appWidgetId = pending.appWidgetId,
            provider = pending.provider,
            label = pending.label,
            widthDp = pending.widthDp,
            heightDp = pending.heightDp,
            page = currentHomePage,
        )
        pendingHostedWidget = null
        overlay = Overlay.NONE
        homeEditMode = true
    }

    val configureWidgetLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            finishPendingHostedWidget()
        } else {
            cancelPendingHostedWidget()
        }
    }

    val bindWidgetLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val pending = pendingHostedWidget
        if (result.resultCode != Activity.RESULT_OK || pending == null) {
            cancelPendingHostedWidget()
        } else {
            val info = androidWidgetHost.info(pending.appWidgetId)
            val configureIntent = info?.let {
                androidWidgetHost.configureIntent(pending.appWidgetId, it)
            }
            if (configureIntent != null) {
                configureWidgetLauncher.launch(configureIntent)
            } else {
                finishPendingHostedWidget()
            }
        }
    }

    fun requestAndroidWidget(info: AppWidgetProviderInfo) {
        cancelPendingHostedWidget()
        val appWidgetId = androidWidgetHost.allocateId()
        val size = androidWidgetHost.suggestedSize(info)
        pendingHostedWidget = PendingHostedWidget(
            appWidgetId = appWidgetId,
            provider = info.provider.flattenToString(),
            label = androidWidgetHost.widgetLabel(info),
            widthDp = size.first,
            heightDp = size.second,
        )

        if (androidWidgetHost.bindIfAllowed(appWidgetId, info.provider)) {
            val configureIntent = androidWidgetHost.configureIntent(appWidgetId, info)
            if (configureIntent != null) {
                configureWidgetLauncher.launch(configureIntent)
            } else {
                finishPendingHostedWidget()
            }
        } else {
            bindWidgetLauncher.launch(
                androidWidgetHost.bindIntent(appWidgetId, info.provider),
            )
        }
    }

    val closeTopLayer = {
        when {
            editingItemId != null -> editingItemId = null
            editingWidgetId != null -> editingWidgetId = null
            editingHostedWidgetId != null -> editingHostedWidgetId = null
            groupId != null -> groupId = null
            overlay != Overlay.NONE -> overlay = Overlay.NONE
            homeEditMode -> homeEditMode = false
            currentHomePage > 0 -> setHomePage(currentHomePage - 1)
            else -> Unit
        }
    }

    BackHandler(
        enabled = editingItemId != null ||
            editingWidgetId != null ||
            editingHostedWidgetId != null ||
            groupId != null ||
            overlay != Overlay.NONE ||
            homeEditMode ||
            currentHomePage > 0,
        onBack = closeTopLayer,
    )

    VeloraAmbientProvider {
        VeloraIconAppearanceProvider(launcher.iconAppearance) {
            Box(
                modifier = Modifier.fillMaxSize(),
            ) {
                WallpaperBlurHost(
                    strength = launcher.wallpaperBlur,
                )
                val liquidSheetVisible =
                    overlay == Overlay.RECENTS ||
                        overlay == Overlay.DRAWER ||
                        overlay == Overlay.NOTIFICATIONS ||
                        overlay == Overlay.CONTROL_CENTER

                val liquidBackdropBlur =
                    if (liquidSheetVisible) {
                        (launcher.wallpaperBlur * 42f).dp
                    } else {
                        0.dp
                    }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .blur(liquidBackdropBlur),
                ) {
                    AnimatedContent(
                        targetState = currentHomePage,
                        transitionSpec = {
                            val forward = targetState > initialState
                            when (launcher.homeTransitionMode) {
                                HomeTransitionMode.JELLY -> {
                                    val softness = launcher.transitionSoftness.coerceIn(0f, 1f)
                                    val damping = 0.54f + softness * 0.24f
                                    val stiffness = 560f - softness * 300f
                                    (
                                        slideInHorizontally(
                                            animationSpec = spring(
                                                dampingRatio = damping,
                                                stiffness = stiffness,
                                            ),
                                        ) { width -> if (forward) width else -width } +
                                            fadeIn(animationSpec = tween(120))
                                        ).togetherWith(
                                        slideOutHorizontally(
                                            animationSpec = spring(
                                                dampingRatio = damping,
                                                stiffness = stiffness,
                                            ),
                                        ) { width -> if (forward) -width else width } +
                                            fadeOut(animationSpec = tween(110)),
                                    )
                                }

                                HomeTransitionMode.SMOOTH -> {
                                    (
                                        slideInHorizontally(
                                            animationSpec = tween(260),
                                        ) { width -> if (forward) width else -width } +
                                            fadeIn(animationSpec = tween(160))
                                        ).togetherWith(
                                        slideOutHorizontally(
                                            animationSpec = tween(260),
                                        ) { width -> if (forward) -width else width } +
                                            fadeOut(animationSpec = tween(150)),
                                    )
                                }

                                HomeTransitionMode.FADE -> {
                                    fadeIn(animationSpec = tween(210))
                                        .togetherWith(fadeOut(animationSpec = tween(180)))
                                }

                                HomeTransitionMode.OFF -> {
                                    EnterTransition.None.togetherWith(ExitTransition.None)
                                }
                            }
                        },
                        label = "velora-home-page",
                        modifier = Modifier.fillMaxSize(),
                    ) { page ->
                        Box(Modifier.fillMaxSize()) {
                            HomeCanvas(
                                items = launcher.homeItems.filter { it.page == page },
                                widgets = launcher.homeWidgets.filter { it.page == page },
                                globalScale = launcher.globalIconScale,
                                selectedItemId = editingItemId,
                                onLaunch = ::launchPackage,
                                onMoveCommitted = launcher::commitMove,
                                onWidgetMoveCommitted = launcher::commitWidgetMove,
                                onGroupOpen = { groupId = it },
                                onItemSelect = { editingItemId = it },
                                onDismissItemTools = { editingItemId = null },
                                onItemScaleChanged = launcher::setItemScale,
                                onItemRemove = launcher::removeFromHome,
                                onAppInfo = { packageName ->
                                    runCatching {
                                        context.startActivity(
                                            Intent(
                                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                                Uri.parse("package:" + packageName),
                                            ),
                                        )
                                    }
                                    editingItemId = null
                                },
                                onUninstall = { packageName ->
                                    runCatching {
                                        context.startActivity(
                                            Intent(
                                                Intent.ACTION_DELETE,
                                                Uri.parse("package:" + packageName),
                                            ),
                                        )
                                    }
                                    editingItemId = null
                                },
                                onUngroup = launcher::ungroup,
                                onWidgetEdit = {
                                    homeEditMode = true
                                    editingWidgetId = it
                                },
                                onSwipeUp = {
                                    homeEditMode = false
                                    editingItemId = null
                                    overlay = Overlay.DRAWER
                                },
                                onSwipeDownLeft = {
                                    homeEditMode = false
                                    editingItemId = null
                                    overlay = Overlay.NOTIFICATIONS
                                },
                                onSwipeDownRight = {
                                    homeEditMode = false
                                    editingItemId = null
                                    overlay = Overlay.CONTROL_CENTER
                                },
                                onSwipeLeft = {
                                    if (page < HOME_PAGE_COUNT - 1) setHomePage(page + 1)
                                },
                                onSwipeRight = {
                                    if (page > 0) setHomePage(page - 1)
                                },
                                onHomeLongPress = {
                                    editingItemId = null
                                    homeEditMode = true
                                },
                                editMode = homeEditMode,
                            )

                            AndroidWidgetLayer(
                                widgets = launcher.hostedWidgets.filter { it.page == page },
                                controller = androidWidgetHost,
                                editMode = homeEditMode,
                                onMoveCommitted = launcher::commitHostedWidgetMove,
                                onEdit = {
                                    homeEditMode = true
                                    editingHostedWidgetId = it
                                },
                            )
                        }
                    }
                }

                val modalVisible =
                    overlay == Overlay.SETTINGS ||
                        overlay == Overlay.WIDGET_PICKER ||
                        overlay == Overlay.ANDROID_WIDGET_PICKER ||
                        overlay == Overlay.HIDDEN_APPS ||
                        groupId != null ||
                        editingWidgetId != null ||
                        editingHostedWidgetId != null ||
                        !launcher.onboardingComplete

                if (modalVisible) {
                    ModalBackdrop()
                }

                when (overlay) {
                    Overlay.RECENTS -> LauncherRecentsPanel(
                        recentPackages = launcher.recentsForDisplay(),
                        labelForPackage = launcher::labelForPackage,
                        onOpen = { packageName ->
                            overlay = Overlay.NONE
                            launchPackage(packageName)
                        },
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.DRAWER -> AppDrawer(
                        apps = launcher.visibleApps(),
                        onLaunch = ::launchPackage,
                        onPin = { app -> launcher.pinToHome(app, currentHomePage) },
                        onDropToHome = { app, x, y ->
                            launcher.pinToHomeAt(app, x, y, currentHomePage)
                        },
                        onHide = { app -> launcher.setPackageHidden(app.packageName, true) },
                        onClose = { overlay = Overlay.NONE },
                        systemActionsEnabled = true,
                    )

                    Overlay.NOTIFICATIONS -> NotificationCenter(
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.CONTROL_CENTER -> ControlCenter(
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.SETTINGS -> SettingsPanel(
                        globalScale = launcher.globalIconScale,
                        wallpaperBlur = launcher.wallpaperBlur,
                        homeTransitionMode = launcher.homeTransitionMode,
                        transitionSoftness = launcher.transitionSoftness,
                        navIcons = launcher.navIcons,
                        iconAppearance = launcher.iconAppearance,
                        backupJson = launcher::createBackupJson,
                        restoreBackup = launcher::restoreBackupJson,
                        onGlobalScaleChanged = launcher::updateGlobalIconScale,
                        onWallpaperBlurChanged = launcher::updateWallpaperBlur,
                        onHomeTransitionModeChanged = launcher::updateHomeTransitionMode,
                        onTransitionSoftnessChanged = launcher::updateTransitionSoftness,
                        onNavIconChanged = launcher::setNavIcon,
                        onIconStyleChanged = launcher::setIconStyle,
                        onIconShapeChanged = launcher::setIconShape,
                        onHomeLabelsChanged = launcher::setHomeLabelsVisible,
                        onAddWidget = { overlay = Overlay.WIDGET_PICKER },
                        onManageHiddenApps = { overlay = Overlay.HIDDEN_APPS },
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.WIDGET_PICKER -> WidgetPicker(
                        onAdd = { type -> launcher.addWidget(type, currentHomePage) },
                        onAndroidWidgets = { overlay = Overlay.ANDROID_WIDGET_PICKER },
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.ANDROID_WIDGET_PICKER -> AndroidWidgetPicker(
                        controller = androidWidgetHost,
                        onSelect = ::requestAndroidWidget,
                        onClose = {
                            cancelPendingHostedWidget()
                            overlay = Overlay.NONE
                        },
                    )

                    Overlay.HIDDEN_APPS -> HiddenAppsPanel(
                        apps = launcher.apps,
                        hiddenPackages = launcher.hiddenPackages,
                        onToggle = launcher::setPackageHidden,
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.NONE -> Unit
                }

                groupId
                    ?.let { id -> launcher.homeItems.firstOrNull { it.id == id } }
                    ?.takeIf { it.kind == HomeItemKind.GROUP }
                    ?.let { group ->
                        GroupOverlay(
                            item = group,
                            labelForPackage = launcher::labelForPackage,
                            onLaunch = ::launchPackage,
                            onClose = { groupId = null },
                        )
                    }

                editingWidgetId
                    ?.let { id -> launcher.homeWidgets.firstOrNull { it.id == id } }
                    ?.let { widget ->
                        WidgetEditSheet(
                            widget = widget,
                            onScaleChanged = { launcher.setWidgetScale(widget.id, it) },
                            onRemove = {
                                launcher.removeWidget(widget.id)
                                editingWidgetId = null
                            },
                            onClose = { editingWidgetId = null },
                        )
                    }

                editingHostedWidgetId
                    ?.let { id -> launcher.hostedWidgets.firstOrNull { it.id == id } }
                    ?.let { widget ->
                        HostedWidgetEditSheet(
                            widget = widget,
                            onScaleChanged = {
                                launcher.setHostedWidgetScale(widget.id, it)
                            },
                            onRemove = {
                                androidWidgetHost.deleteId(widget.appWidgetId)
                                launcher.removeHostedWidget(widget.id)
                                editingHostedWidgetId = null
                            },
                            onClose = { editingHostedWidgetId = null },
                        )
                    }

                if (launcher.onboardingComplete) {
                    VeloraStatusBar(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .zIndex(160f),
                    )
                }

                AnimatedVisibility(
                    visible = launcher.onboardingComplete &&
                        overlay == Overlay.NONE &&
                        !homeEditMode &&
                        editingItemId == null &&
                        groupId == null,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .zIndex(80f)
                        .padding(bottom = 98.dp),
                    enter = fadeIn(),
                    exit = fadeOut(),
                ) {
                    HomePageIndicator(
                        currentPage = currentHomePage,
                        pageCount = HOME_PAGE_COUNT,
                    )
                }

                AnimatedVisibility(
                    visible = launcher.onboardingComplete &&
                        homeEditMode &&
                        overlay == Overlay.NONE &&
                        groupId == null &&
                        editingItemId == null &&
                        editingWidgetId == null &&
                        editingHostedWidgetId == null,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .zIndex(90f)
                        .padding(start = 16.dp, end = 16.dp, bottom = 88.dp),
                    enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                ) {
                    HomeEditBar(
                        onWidgets = { overlay = Overlay.WIDGET_PICKER },
                        onWallpaper = {
                            context.startActivity(Intent(Intent.ACTION_SET_WALLPAPER))
                        },
                        onSettings = { overlay = Overlay.SETTINGS },
                        onDone = { homeEditMode = false },
                    )
                }

                if (launcher.onboardingComplete) {
                    VeloraNavBar(
                        navIcons = launcher.navIcons,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .zIndex(100f)
                            .padding(horizontal = 16.dp, vertical = 16.dp),
                    onRecents = {
                        editingItemId = null
                        homeEditMode = false
                        overlay = Overlay.RECENTS
                    },
                    onHome = {
                        overlay = Overlay.NONE
                        groupId = null
                        editingItemId = null
                        editingWidgetId = null
                        editingHostedWidgetId = null
                        homeEditMode = false
                        setHomePage(0)
                    },
                    onBack = {
                        when {
                            editingItemId != null ||
                                editingWidgetId != null ||
                                editingHostedWidgetId != null ||
                                groupId != null ||
                                overlay != Overlay.NONE ||
                                homeEditMode -> closeTopLayer()

                            currentHomePage > 0 -> setHomePage(currentHomePage - 1)

                            BuildConfig.DEV_ADVANCED_INTEGRATIONS -> VeloraNavActions.back()
                        }
                    },
                        onSettings = { overlay = Overlay.SETTINGS },
                    )
                }

                if (!launcher.onboardingComplete) {
                    FirstRunSetup(
                        onComplete = launcher::completeOnboarding,
                    )
                    }
                }
            }
        }
    }

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun VeloraNavBar(
    navIcons: NavIconConfig = NavIconConfig(),
    modifier: Modifier = Modifier,
    onRecents: () -> Unit,
    onHome: () -> Unit,
    onBack: () -> Unit,
    onSettings: () -> Unit,
) {
    LiquidGlassPanel(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(32.dp),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 11.dp),
        intensity = 0.78f,
    ) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            NavGlyph(onClick = onRecents) {
                NavIconAsset(
                    uri = navIcons.recentsUri,
                    modifier = Modifier.size(28.dp),
                ) {
                    Canvas(Modifier.size(28.dp)) {
                        val stroke = Stroke(width = 2.3.dp.toPx())
                        drawRoundRect(
                            color = Color.White.copy(alpha = 0.78f),
                            topLeft = Offset(4.dp.toPx(), 6.dp.toPx()),
                            size = androidx.compose.ui.geometry.Size(
                                15.dp.toPx(),
                                15.dp.toPx(),
                            ),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                            style = stroke,
                        )
                        drawRoundRect(
                            color = Color.White,
                            topLeft = Offset(9.dp.toPx(), 2.dp.toPx()),
                            size = androidx.compose.ui.geometry.Size(
                                15.dp.toPx(),
                                15.dp.toPx(),
                            ),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                            style = stroke,
                        )
                    }
                }
            }

            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(52.dp)
                    .combinedClickable(
                        onClick = onHome,
                        onLongClick = onSettings,
                    ),
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    drawCircle(
                        brush = Brush.radialGradient(
                            listOf(
                                Color.White.copy(alpha = 0.96f),
                                Color(0xFFD7D2FF).copy(alpha = 0.82f),
                                Color.White.copy(alpha = 0.20f),
                            ),
                        ),
                    )
                    drawCircle(
                        color = Color.White.copy(alpha = 0.30f),
                        radius = size.minDimension * 0.48f,
                        style = Stroke(width = 1.dp.toPx()),
                    )
                }

                NavIconAsset(
                    uri = navIcons.homeUri,
                    modifier = Modifier.size(28.dp),
                ) {
                    Text(
                        text = "V",
                        color = Color(0xFF1A1821),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            NavGlyph(onClick = onBack) {
                NavIconAsset(
                    uri = navIcons.backUri,
                    modifier = Modifier.size(28.dp),
                ) {
                    Canvas(Modifier.size(28.dp)) {
                        drawLine(
                            color = Color.White,
                            start = Offset(18.dp.toPx(), 6.dp.toPx()),
                            end = Offset(9.dp.toPx(), 14.dp.toPx()),
                            strokeWidth = 2.6.dp.toPx(),
                            cap = StrokeCap.Round,
                        )
                        drawLine(
                            color = Color.White,
                            start = Offset(9.dp.toPx(), 14.dp.toPx()),
                            end = Offset(18.dp.toPx(), 22.dp.toPx()),
                            strokeWidth = 2.6.dp.toPx(),
                            cap = StrokeCap.Round,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NavGlyph(
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(48.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onClick,
            ),
    ) {
        content()
    }
}
