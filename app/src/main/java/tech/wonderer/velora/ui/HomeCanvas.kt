package tech.wonderer.velora.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.LocalIconAppearance
import tech.wonderer.velora.ui.components.LocalVeloraPalette
import tech.wonderer.velora.ui.components.VeloraAppIcon
import kotlin.math.abs
import kotlin.math.roundToInt

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeCanvas(
    items: List<HomeItem>,
    widgets: List<HomeWidget>,
    globalScale: Float,
    selectedItemId: String?,
    onLaunch: (String) -> Unit,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onWidgetMoveCommitted: (String, Float, Float) -> Unit,
    onGroupOpen: (String) -> Unit,
    onItemSelect: (String) -> Unit,
    onDismissItemTools: () -> Unit,
    onItemScaleChanged: (String, Float) -> Unit,
    onItemRemove: (String) -> Unit,
    onAppInfo: (String) -> Unit,
    onUninstall: (String) -> Unit,
    onUngroup: (String) -> Unit,
    onWidgetEdit: (String) -> Unit,
    onSwipeUp: () -> Unit,
    onSwipeDownLeft: () -> Unit,
    onSwipeDownRight: () -> Unit,
    onSwipeLeft: () -> Unit,
    onSwipeRight: () -> Unit,
    onHomeLongPress: () -> Unit,
    editMode: Boolean = false,
) {
    var gestureX by remember { mutableFloatStateOf(0f) }
    var gestureY by remember { mutableFloatStateOf(0f) }
    var gestureStartX by remember { mutableFloatStateOf(0f) }
    var gestureStartY by remember { mutableFloatStateOf(Float.MAX_VALUE) }
    var childConsumedGesture by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(
                onSwipeUp,
                onSwipeDownLeft,
                onSwipeDownRight,
                onSwipeLeft,
                onSwipeRight,
            ) {
                while (true) {
                    awaitPointerEventScope {
                        val down = awaitFirstDown(
                            requireUnconsumed = false,
                            pass = PointerEventPass.Final,
                        )
                        gestureStartX = down.position.x
                        gestureStartY = down.position.y
                        gestureX = 0f
                        gestureY = 0f
                        childConsumedGesture = down.isConsumed

                        var lastX = down.position.x
                        var lastY = down.position.y
                        var pressed = true

                        while (pressed) {
                            val event = awaitPointerEvent(PointerEventPass.Final)
                            val change = event.changes.firstOrNull { it.id == down.id }

                            if (change == null) {
                                pressed = false
                            } else {
                                if (change.isConsumed) {
                                    childConsumedGesture = true
                                } else {
                                    gestureX += change.position.x - lastX
                                    gestureY += change.position.y - lastY
                                }
                                lastX = change.position.x
                                lastY = change.position.y
                                pressed = change.pressed
                            }
                        }
                    }

                    if (!childConsumedGesture) {
                        val absX = abs(gestureX)
                        val absY = abs(gestureY)
                        val topGestureZone = 140.dp.toPx()

                        when {
                            absX > 110.dp.toPx() && absX > absY * 1.15f -> {
                                if (gestureX < 0f) onSwipeLeft() else onSwipeRight()
                            }

                            gestureY < -120.dp.toPx() && absY > absX -> onSwipeUp()

                            gestureY > 120.dp.toPx() &&
                                absY > absX &&
                                gestureStartY <= topGestureZone -> {
                                if (gestureStartX < size.width / 2f) {
                                    onSwipeDownLeft()
                                } else {
                                    onSwipeDownRight()
                                }
                            }
                        }
                    }

                    gestureX = 0f
                    gestureY = 0f
                    gestureStartY = Float.MAX_VALUE
                    childConsumedGesture = false
                }
            }
            .pointerInput(onHomeLongPress) {
                detectTapGestures(
                    onLongPress = { onHomeLongPress() },
                )
            },
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 50.dp, bottom = 112.dp),
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

            if (selectedItemId != null) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .zIndex(800f)
                        .pointerInput(selectedItemId) {
                            detectTapGestures(
                                onTap = { onDismissItemTools() },
                            )
                        },
                )
            }

            items.forEach { item ->
                FreeformHomeItem(
                    item = item,
                    globalScale = globalScale,
                    canvasWidthPx = widthPx,
                    canvasHeightPx = heightPx,
                    selected = item.id == selectedItemId,
                    onLaunch = onLaunch,
                    onMoveCommitted = onMoveCommitted,
                    onGroupOpen = onGroupOpen,
                    onItemSelect = onItemSelect,
                    editMode = editMode,
                )
            }

            items.firstOrNull { it.id == selectedItemId }?.let { selected ->
                val itemSize = 70.dp * (globalScale * selected.scale)
                val itemSizePx = with(density) { itemSize.toPx() }
                val travelX = (widthPx - itemSizePx).coerceAtLeast(1f)
                val travelY = (heightPx - itemSizePx).coerceAtLeast(1f)
                val itemXPx = selected.x.coerceIn(0f, 1f) * travelX
                val itemYPx = selected.y.coerceIn(0f, 1f) * travelY
                val toolbarWidthPx = with(density) { 216.dp.toPx() }
                val toolbarHeightPx = with(density) { 94.dp.toPx() }
                val edgePx = with(density) { 8.dp.toPx() }
                val gapPx = with(density) { 10.dp.toPx() }

                val toolbarX = (
                    itemXPx + itemSizePx / 2f - toolbarWidthPx / 2f
                    ).coerceIn(
                    edgePx,
                    (widthPx - toolbarWidthPx - edgePx).coerceAtLeast(edgePx),
                )
                val toolbarY = if (itemYPx < toolbarHeightPx + gapPx) {
                    (itemYPx + itemSizePx + gapPx)
                        .coerceAtMost((heightPx - toolbarHeightPx).coerceAtLeast(0f))
                } else {
                    itemYPx - toolbarHeightPx - gapPx
                }

                HomeItemQuickTools(
                    item = selected,
                    onScaleChanged = { onItemScaleChanged(selected.id, it) },
                    onRemove = {
                        onItemRemove(selected.id)
                        onDismissItemTools()
                    },
                    onAppInfo = {
                        selected.packageName?.let(onAppInfo)
                    },
                    onUninstall = {
                        selected.packageName?.let(onUninstall)
                    },
                    onUngroup = {
                        onUngroup(selected.id)
                        onDismissItemTools()
                    },
                    modifier = Modifier
                        .zIndex(1_100f)
                        .offset {
                            IntOffset(
                                toolbarX.roundToInt(),
                                toolbarY.roundToInt(),
                            )
                        }
                        .requiredWidth(216.dp),
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FreeformHomeItem(
    item: HomeItem,
    globalScale: Float,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    selected: Boolean,
    onLaunch: (String) -> Unit,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onGroupOpen: (String) -> Unit,
    onItemSelect: (String) -> Unit,
    editMode: Boolean,
) {
    val iconAppearance = LocalIconAppearance.current
    val haptics = LocalHapticFeedback.current
    var dragXPx by remember(item.id) { mutableFloatStateOf(0f) }
    var dragYPx by remember(item.id) { mutableFloatStateOf(0f) }

    val size = 70.dp * (globalScale * item.scale)
    val density = LocalDensity.current
    val itemPx = with(density) { size.toPx() }
    val travelX = (canvasWidthPx - itemPx).coerceAtLeast(1f)
    val travelY = (canvasHeightPx - itemPx).coerceAtLeast(1f)
    val baseXPx = item.x.coerceIn(0f, 1f) * travelX
    val baseYPx = item.y.coerceIn(0f, 1f) * travelY

    Box(
        modifier = Modifier
            .zIndex(if (selected) 1_000f else item.zIndex)
            .offset {
                IntOffset(
                    x = baseXPx.roundToInt(),
                    y = baseYPx.roundToInt(),
                )
            }
            .graphicsLayer {
                translationX = dragXPx
                translationY = dragYPx
            }
            .width((size.value + 30f).dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .pointerInput(
                    item.id,
                    canvasWidthPx,
                    canvasHeightPx,
                    item.x,
                    item.y,
                    item.scale,
                    globalScale,
                ) {
                    detectDragGestures(
                        onDragStart = {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        },
                        onDrag = { change, amount ->
                            change.consume()
                            dragXPx = (dragXPx + amount.x).coerceIn(
                                -item.x * travelX,
                                (1f - item.x) * travelX,
                            )
                            dragYPx = (dragYPx + amount.y).coerceIn(
                                -item.y * travelY,
                                (1f - item.y) * travelY,
                            )
                        },
                        onDragEnd = {
                            val x = (item.x + dragXPx / travelX).coerceIn(0f, 1f)
                            val y = (item.y + dragYPx / travelY).coerceIn(0f, 1f)
                            dragXPx = 0f
                            dragYPx = 0f
                            onMoveCommitted(item.id, x, y)
                        },
                        onDragCancel = {
                            dragXPx = 0f
                            dragYPx = 0f
                        },
                    )
                }
                .combinedClickable(
                    onClick = {
                        if (editMode || selected) {
                            onItemSelect(item.id)
                        } else {
                            when (item.kind) {
                                HomeItemKind.APP -> item.packageName?.let(onLaunch)
                                HomeItemKind.GROUP -> onGroupOpen(item.id)
                            }
                        }
                    },
                    onLongClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onItemSelect(item.id)
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
}

@Composable
private fun HomeItemQuickTools(
    item: HomeItem,
    onScaleChanged: (Float) -> Unit,
    onRemove: () -> Unit,
    onAppInfo: () -> Unit,
    onUninstall: () -> Unit,
    onUngroup: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LiquidGlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Column {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                QuickToolButton(
                    symbol = "✕",
                    label = "Remove",
                    onClick = onRemove,
                )

                if (item.kind == HomeItemKind.APP) {
                    QuickToolButton(
                        symbol = "i",
                        label = "Info",
                        onClick = onAppInfo,
                    )
                    QuickToolButton(
                        symbol = "⌫",
                        label = "Uninstall",
                        onClick = onUninstall,
                    )
                } else {
                    QuickToolButton(
                        symbol = "↗",
                        label = "Ungroup",
                        onClick = onUngroup,
                    )
                }
            }

            Slider(
                value = item.scale,
                onValueChange = onScaleChanged,
                valueRange = 0.60f..1.80f,
            )
        }
    }
}

@Composable
private fun QuickToolButton(
    symbol: String,
    label: String,
    onClick: () -> Unit,
) {
    val palette = LocalVeloraPalette.current

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            text = symbol,
            color = palette.secondary,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.72f),
            fontSize = 8.sp,
        )
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
