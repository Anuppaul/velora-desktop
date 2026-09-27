package tech.wonderer.velora.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.ModalBackdrop
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface
import kotlin.math.roundToInt

@Composable
fun AppDrawer(
    apps: List<InstalledApp>,
    onLaunch: (String) -> Unit,
    onPin: (InstalledApp) -> Unit,
    onDropToHome: (InstalledApp, Float, Float) -> Unit,
    onHide: (InstalledApp) -> Unit,
    onClose: () -> Unit,
    systemActionsEnabled: Boolean = true,
) {
    var selectedApp by remember { mutableStateOf<InstalledApp?>(null) }
    var draggingApp by remember { mutableStateOf<InstalledApp?>(null) }
    var dragPosition by remember { mutableStateOf(Offset.Zero) }
    var dragDistance by remember { mutableFloatStateOf(0f) }
    var drawerSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val ghostHalfPx = with(density) { 30.dp.toPx() }

    fun finishDrag() {
        val app = draggingApp ?: return
        if (dragDistance < with(density) { 28.dp.toPx() }) {
            selectedApp = app
        } else {
            val width = drawerSize.width.coerceAtLeast(1).toFloat()
            val height = drawerSize.height.coerceAtLeast(1).toFloat()
            val x = (dragPosition.x / width).coerceIn(0.02f, 0.88f)
            val y = (dragPosition.y / height).coerceIn(0.08f, 0.86f)
            onDropToHome(app, x, y)
            onClose()
        }
        draggingApp = null
        dragDistance = 0f
    }

    SwipeDismissSurface(
        direction = SwipeDismissDirection.DOWN,
        onDismiss = {
            draggingApp = null
            selectedApp = null
            onClose()
        },
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .onGloballyPositioned { drawerSize = it.size },
        ) {
            LiquidGlassPanel(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = 52.dp, bottom = 82.dp, start = 10.dp, end = 10.dp)
                    .graphicsLayer {
                        alpha = if (draggingApp != null) 0.18f else 1f
                    },
                shape = RoundedCornerShape(34.dp),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 16.dp),
            ) {
                Column(Modifier.fillMaxSize()) {
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column {
                            Text(
                                text = "All Apps",
                                color = Color.White,
                                fontSize = 30.sp,
                                fontWeight = FontWeight.Light,
                            )
                            Text(
                                text = "Tap to open · Hold and drag to Home · ⋯ for actions",
                                color = Color.White.copy(alpha = 0.60f),
                                fontSize = 11.sp,
                            )
                        }
                        Text(
                            text = apps.size.toString(),
                            color = Color.White.copy(alpha = 0.52f),
                            fontSize = 11.sp,
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    LazyVerticalGrid(
                        columns = GridCells.Fixed(6),
                        contentPadding = PaddingValues(bottom = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        items(apps, key = { it.packageName }) { app ->
                            DrawerApp(
                                app = app,
                                onLaunch = {
                                    onLaunch(app.packageName)
                                    onClose()
                                },
                                onMenu = { selectedApp = app },
                                onDragStart = { absolute ->
                                    selectedApp = null
                                    draggingApp = app
                                    dragPosition = absolute
                                    dragDistance = 0f
                                },
                                onDrag = { amount ->
                                    dragPosition += amount
                                    dragDistance += amount.getDistance()
                                },
                                onDragEnd = ::finishDrag,
                                onDragCancel = {
                                    draggingApp = null
                                    dragDistance = 0f
                                },
                            )
                        }
                    }
                }
            }

            if (selectedApp != null) {
                ModalBackdrop(
                    modifier = Modifier.zIndex(50f),
                )
            }

            selectedApp?.let { app ->
                AppActionSheet(
                    app = app,
                    systemActionsEnabled = systemActionsEnabled,
                    onPin = {
                        onPin(app)
                        selectedApp = null
                        onClose()
                    },
                    onHide = {
                        onHide(app)
                        selectedApp = null
                        onClose()
                    },
                    onClose = { selectedApp = null },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .zIndex(60f)
                        .padding(horizontal = 16.dp, vertical = 94.dp),
                )
            }

            draggingApp?.let { app ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .zIndex(90f)
                        .offset {
                            IntOffset(
                                (dragPosition.x - ghostHalfPx).roundToInt(),
                                (dragPosition.y - ghostHalfPx).roundToInt(),
                            )
                        },
                ) {
                    PackageIcon(
                        packageName = app.packageName,
                        modifier = Modifier.size(60.dp),
                    )
                    Text(
                        text = app.label,
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun DrawerApp(
    app: InstalledApp,
    onLaunch: () -> Unit,
    onMenu: () -> Unit,
    onDragStart: (Offset) -> Unit,
    onDrag: (Offset) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    var rootOrigin by remember(app.packageName) { mutableStateOf(Offset.Zero) }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .onGloballyPositioned { rootOrigin = it.positionInRoot() }
            .pointerInput(app.packageName) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { localOffset ->
                        onDragStart(rootOrigin + localOffset)
                    },
                    onDrag = { change, amount ->
                        change.consume()
                        onDrag(amount)
                    },
                    onDragEnd = onDragEnd,
                    onDragCancel = onDragCancel,
                )
            }
            .clickable(onClick = onLaunch),
    ) {
        PackageIcon(
            packageName = app.packageName,
            modifier = Modifier
                .size(46.dp)
                .clip(RoundedCornerShape(13.dp)),
        )
        Spacer(Modifier.height(5.dp))
        Text(
            text = app.label,
            color = Color.White,
            fontSize = 9.sp,
            maxLines = 1,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = "⋯",
            color = Color.White.copy(alpha = 0.68f),
            fontSize = 13.sp,
            modifier = Modifier
                .clickable(onClick = onMenu)
                .padding(horizontal = 12.dp, vertical = 1.dp),
        )
    }
}

@Composable
private fun AppActionSheet(
    app: InstalledApp,
    systemActionsEnabled: Boolean,
    onPin: () -> Unit,
    onHide: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    LiquidGlassPanel(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(30.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                PackageIcon(
                    packageName = app.packageName,
                    modifier = Modifier.size(50.dp),
                )
                Column {
                    Text(
                        text = app.label,
                        color = Color.White,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = app.packageName,
                        color = Color.White.copy(alpha = 0.48f),
                        fontSize = 10.sp,
                        maxLines = 1,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            AppActionRow("Pin to Home", onPin)

            if (systemActionsEnabled) {
                AppActionRow("Hide app", onHide)
                AppActionRow("App info") {
                    runCatching {
                        context.startActivity(
                            Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + app.packageName),
                            ),
                        )
                    }
                    onClose()
                }
                AppActionRow("Uninstall") {
                    runCatching {
                        context.startActivity(
                            Intent(
                                Intent.ACTION_DELETE,
                                Uri.parse("package:" + app.packageName),
                            ),
                        )
                    }
                    onClose()
                }
            }

            AppActionRow("Cancel", onClose)
        }
    }
}

@Composable
private fun AppActionRow(
    label: String,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        color = Color.White,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
    )
}
