package tech.wonderer.velora.ui

import android.os.BatteryManager
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.consume
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.GlassPill
import tech.wonderer.velora.ui.components.LocalIconAppearance
import tech.wonderer.velora.ui.components.VeloraAppIcon
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun HomeCanvas(
    items: List<HomeItem>,
    widgets: List<HomeWidget>,
    globalScale: Float,
    onLaunch: (String) -> Unit,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onWidgetMoveCommitted: (String, Float, Float) -> Unit,
    onGroupOpen: (String) -> Unit,
    onItemEdit: (String) -> Unit,
    onWidgetEdit: (String) -> Unit,
    onSwipeUp: () -> Unit,
    onSwipeDown: () -> Unit,
) {
    var swipeDistance by remember { mutableFloatStateOf(0f) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { change, amount ->
                        if (!change.isConsumed) swipeDistance += amount
                    },
                    onDragEnd = {
                        when {
                            swipeDistance < -140f -> onSwipeUp()
                            swipeDistance > 140f -> onSwipeDown()
                        }
                        swipeDistance = 0f
                    },
                    onDragCancel = { swipeDistance = 0f },
                )
            },
    ) {
        StatusRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 12.dp),
        )

        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 46.dp, bottom = 106.dp),
        ) {
            val density = LocalDensity.current
            val widthPx = with(density) { maxWidth.toPx() }
            val heightPx = with(density) { maxHeight.toPx() }

            widgets.forEach { widget ->
                FreeformPremiumWidget(
                    widget = widget,
                    canvasWidthPx = widthPx,
                    canvasHeightPx = heightPx,
                    onMoveCommitted = onWidgetMoveCommitted,
                    onEdit = onWidgetEdit,
                )
            }

            items.forEach { item ->
                FreeformHomeItem(
                    item = item,
                    globalScale = globalScale,
                    canvasWidthPx = widthPx,
                    canvasHeightPx = heightPx,
                    onLaunch = onLaunch,
                    onMoveCommitted = onMoveCommitted,
                    onGroupOpen = onGroupOpen,
                    onItemEdit = onItemEdit,
                )
            }
        }

        GlassPill(
            text = "Swipe up · Apps     Swipe down · Control Center",
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 92.dp),
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FreeformHomeItem(
    item: HomeItem,
    globalScale: Float,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onLaunch: (String) -> Unit,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onGroupOpen: (String) -> Unit,
    onItemEdit: (String) -> Unit,
) {
    val iconAppearance = LocalIconAppearance.current
    val haptics = LocalHapticFeedback.current
    var localX by remember(item.id) { mutableFloatStateOf(item.x) }
    var localY by remember(item.id) { mutableFloatStateOf(item.y) }
    var dragging by remember(item.id) { mutableStateOf(false) }

    LaunchedEffect(item.x, item.y, dragging) {
        if (!dragging) {
            localX = item.x
            localY = item.y
        }
    }

    val size = 70.dp * (globalScale * item.scale)
    val density = LocalDensity.current
    val itemPx = with(density) { size.toPx() }
    val xPx = localX.coerceIn(0f, 1f) * (canvasWidthPx - itemPx).coerceAtLeast(1f)
    val yPx = localY.coerceIn(0f, 1f) * (canvasHeightPx - itemPx).coerceAtLeast(1f)

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .zIndex(item.zIndex)
            .offset { IntOffset(xPx.roundToInt(), yPx.roundToInt()) }
            .width((size.value + 30f).dp)
            .pointerInput(item.id, canvasWidthPx, canvasHeightPx) {
                detectDragGestures(
                    onDragStart = {
                        dragging = true
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        localX = (
                            localX + dragAmount.x / canvasWidthPx.coerceAtLeast(1f)
                            ).coerceIn(0f, 1f)
                        localY = (
                            localY + dragAmount.y / canvasHeightPx.coerceAtLeast(1f)
                            ).coerceIn(0f, 1f)
                    },
                    onDragEnd = {
                        dragging = false
                        onMoveCommitted(item.id, localX, localY)
                    },
                    onDragCancel = {
                        dragging = false
                        localX = item.x
                        localY = item.y
                    },
                )
            }
            .combinedClickable(
                onClick = {
                    when (item.kind) {
                        HomeItemKind.APP -> item.packageName?.let(onLaunch)
                        HomeItemKind.GROUP -> onGroupOpen(item.id)
                    }
                },
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onItemEdit(item.id)
                },
            ),
    ) {
        when (item.kind) {
            HomeItemKind.APP -> {
                item.packageName?.let {
                    PackageIcon(
                        packageName = it,
                        modifier = Modifier.size(size),
                    )
                }
            }

            HomeItemKind.GROUP -> {
                GroupBubble(
                    members = item.members,
                    sizeDp = size.value,
                )
            }
        }

        if (iconAppearance.showHomeLabels) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = item.label,
                color = Color.White,
                fontSize = 11.sp,
                maxLines = 1,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun GroupBubble(
    members: List<String>,
    sizeDp: Float,
) {
    GlassPanel(
        modifier = Modifier.size(sizeDp.dp),
        shape = RoundedCornerShape((sizeDp * 0.28f).dp),
    ) {
        Column(
            verticalArrangement = Arrangement.SpaceEvenly,
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
        ) {
            members.take(4).chunked(2).forEach { row ->
                Row(
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    row.forEach { packageName ->
                        PackageIcon(
                            packageName = packageName,
                            modifier = Modifier.size((sizeDp * 0.30f).dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun PackageIcon(
    packageName: String,
    modifier: Modifier = Modifier,
) {
    VeloraAppIcon(
        packageName = packageName,
        modifier = modifier,
    )
}

@Composable
private fun StatusRow(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val now by produceState(initialValue = Date()) {
        while (true) {
            value = Date()
            delay(30_000)
        }
    }
    val battery = remember(now) {
        val manager = context.getSystemService(BatteryManager::class.java)
        manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it >= 0 }
    }

    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier,
    ) {
        Text(
            text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(now),
            color = Color.White.copy(alpha = 0.92f),
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = battery?.let { it.toString() + "%" } ?: "Velora",
            color = Color.White.copy(alpha = 0.82f),
        )
    }
}
