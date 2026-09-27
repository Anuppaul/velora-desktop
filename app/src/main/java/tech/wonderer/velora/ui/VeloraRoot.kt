package tech.wonderer.velora.ui

import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.service.VeloraNavActions
import tech.wonderer.velora.state.LauncherViewModel
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.VeloraAmbientProvider
import tech.wonderer.velora.ui.components.VeloraIconAppearanceProvider

private enum class Overlay {
    NONE,
    DRAWER,
    CONTROL_CENTER,
    SETTINGS,
    WIDGET_PICKER,
    HIDDEN_APPS,
}

@Composable
fun VeloraRoot(
    launcher: LauncherViewModel = viewModel(),
) {
    val context = LocalContext.current
    var overlay by remember { mutableStateOf(Overlay.NONE) }
    var groupId by remember { mutableStateOf<String?>(null) }
    var editingItemId by remember { mutableStateOf<String?>(null) }
    var editingWidgetId by remember { mutableStateOf<String?>(null) }

    val closeTopLayer = {
        when {
            editingItemId != null -> editingItemId = null
            editingWidgetId != null -> editingWidgetId = null
            groupId != null -> groupId = null
            overlay != Overlay.NONE -> overlay = Overlay.NONE
            else -> Unit
        }
    }

    BackHandler(
        enabled = editingItemId != null ||
            editingWidgetId != null ||
            groupId != null ||
            overlay != Overlay.NONE,
        onBack = closeTopLayer,
    )

    VeloraAmbientProvider {
        VeloraIconAppearanceProvider(launcher.iconAppearance) {
            Box(
                modifier = Modifier.fillMaxSize(),
            ) {
                HomeCanvas(
                    items = launcher.homeItems,
                    widgets = launcher.homeWidgets,
                    globalScale = launcher.globalIconScale,
                    onLaunch = launcher::launch,
                    onMoveCommitted = launcher::commitMove,
                    onWidgetMoveCommitted = launcher::commitWidgetMove,
                    onGroupOpen = { groupId = it },
                    onItemEdit = { editingItemId = it },
                    onWidgetEdit = { editingWidgetId = it },
                    onSwipeUp = { overlay = Overlay.DRAWER },
                    onSwipeDown = { overlay = Overlay.CONTROL_CENTER },
                )

                when (overlay) {
                    Overlay.DRAWER -> AppDrawer(
                        apps = launcher.visibleApps(),
                        onLaunch = launcher::launch,
                        onPin = launcher::pinToHome,
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.CONTROL_CENTER -> ControlCenter(
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.SETTINGS -> SettingsPanel(
                        globalScale = launcher.globalIconScale,
                        iconAppearance = launcher.iconAppearance,
                        backupJson = launcher::createBackupJson,
                        restoreBackup = launcher::restoreBackupJson,
                        onGlobalScaleChanged = launcher::updateGlobalIconScale,
                        onIconStyleChanged = launcher::setIconStyle,
                        onIconShapeChanged = launcher::setIconShape,
                        onHomeLabelsChanged = launcher::setHomeLabelsVisible,
                        onAddWidget = { overlay = Overlay.WIDGET_PICKER },
                        onManageHiddenApps = { overlay = Overlay.HIDDEN_APPS },
                        onClose = { overlay = Overlay.NONE },
                    )

                    Overlay.WIDGET_PICKER -> WidgetPicker(
                        onAdd = launcher::addWidget,
                        onClose = { overlay = Overlay.NONE },
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
                            onLaunch = launcher::launch,
                            onClose = { groupId = null },
                        )
                    }

                editingItemId
                    ?.let { id -> launcher.homeItems.firstOrNull { it.id == id } }
                    ?.let { item ->
                        ItemEditSheet(
                            item = item,
                            onScaleChanged = { launcher.setItemScale(item.id, it) },
                            onRenameGroup = { launcher.renameGroup(item.id, it) },
                            onUngroup = {
                                launcher.ungroup(item.id)
                                editingItemId = null
                            },
                            onRemove = {
                                launcher.removeFromHome(item.id)
                                editingItemId = null
                            },
                            onClose = { editingItemId = null },
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

                VeloraNavBar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 16.dp, vertical = 16.dp),
                    onRecents = {
                        if (!VeloraNavActions.recents()) {
                            context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        }
                    },
                    onHome = {
                        overlay = Overlay.NONE
                        groupId = null
                        editingItemId = null
                        editingWidgetId = null
                    },
                    onBack = {
                        if (
                            editingItemId != null ||
                            editingWidgetId != null ||
                            groupId != null ||
                            overlay != Overlay.NONE
                        ) {
                            closeTopLayer()
                        } else {
                            VeloraNavActions.back()
                        }
                    },
                    onSettings = { overlay = Overlay.SETTINGS },
                )

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
    modifier: Modifier = Modifier,
    onRecents: () -> Unit,
    onHome: () -> Unit,
    onBack: () -> Unit,
    onSettings: () -> Unit,
) {
    GlassPanel(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(32.dp),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 11.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            NavGlyph(onClick = onRecents) {
                Canvas(Modifier.size(28.dp)) {
                    val stroke = Stroke(width = 2.3.dp.toPx())
                    drawRoundRect(
                        color = Color.White.copy(alpha = 0.78f),
                        topLeft = Offset(4.dp.toPx(), 6.dp.toPx()),
                        size = androidx.compose.ui.geometry.Size(15.dp.toPx(), 15.dp.toPx()),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                        style = stroke,
                    )
                    drawRoundRect(
                        color = Color.White,
                        topLeft = Offset(9.dp.toPx(), 2.dp.toPx()),
                        size = androidx.compose.ui.geometry.Size(15.dp.toPx(), 15.dp.toPx()),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                        style = stroke,
                    )
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
                                Color(0xFFD7D2FF).copy(alpha = 0.86f),
                                Color.White.copy(alpha = 0.22f),
                            ),
                        ),
                    )
                    drawCircle(
                        color = Color.White.copy(alpha = 0.32f),
                        radius = size.minDimension * 0.48f,
                        style = Stroke(width = 1.dp.toPx()),
                    )
                }
                Text(
                    text = "V",
                    color = Color(0xFF1A1821),
                    fontWeight = FontWeight.Bold,
                )
            }

            NavGlyph(onClick = onBack) {
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NavGlyph(
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(48.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            ),
    ) {
        content()
    }
}
