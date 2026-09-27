package tech.wonderer.velora.ui

import android.appwidget.AppWidgetProviderInfo
import android.view.Gravity
import android.widget.TextView
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
import tech.wonderer.velora.data.AndroidWidgetHostController
import tech.wonderer.velora.model.HostedWidget
import tech.wonderer.velora.ui.components.GlassPanel
import kotlin.math.roundToInt

@Composable
fun AndroidWidgetLayer(
    widgets: List<HostedWidget>,
    controller: AndroidWidgetHostController,
    editMode: Boolean,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onEdit: (String) -> Unit,
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 46.dp, bottom = 106.dp),
    ) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }

        widgets.forEach { widget ->
            HostedWidgetView(
                widget = widget,
                controller = controller,
                editMode = editMode,
                canvasWidthPx = widthPx,
                canvasHeightPx = heightPx,
                onMoveCommitted = onMoveCommitted,
                onEdit = onEdit,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HostedWidgetView(
    widget: HostedWidget,
    controller: AndroidWidgetHostController,
    editMode: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onEdit: (String) -> Unit,
) {
    var localX by remember(widget.id) { mutableFloatStateOf(widget.x) }
    var localY by remember(widget.id) { mutableFloatStateOf(widget.y) }

    LaunchedEffect(widget.x, widget.y) {
        localX = widget.x
        localY = widget.y
    }

    val width = widget.widthDp.dp * widget.scale
    val height = widget.heightDp.dp * widget.scale
    val density = LocalDensity.current
    val widthPx = with(density) { width.toPx() }
    val heightPx = with(density) { height.toPx() }
    val xPx = localX.coerceIn(0f, 1f) * (canvasWidthPx - widthPx).coerceAtLeast(1f)
    val yPx = localY.coerceIn(0f, 1f) * (canvasHeightPx - heightPx).coerceAtLeast(1f)

    val editModifier = if (editMode) {
        Modifier
            .pointerInput(widget.id, canvasWidthPx, canvasHeightPx) {
                detectDragGestures(
                    onDrag = { change, amount ->
                        change.consume()
                        localX = (localX + amount.x / canvasWidthPx.coerceAtLeast(1f))
                            .coerceIn(0f, 1f)
                        localY = (localY + amount.y / canvasHeightPx.coerceAtLeast(1f))
                            .coerceIn(0f, 1f)
                    },
                    onDragEnd = {
                        onMoveCommitted(widget.id, localX, localY)
                    },
                )
            }
            .combinedClickable(
                onClick = { onEdit(widget.id) },
                onLongClick = { onEdit(widget.id) },
            )
    } else {
        Modifier
    }

    Box(
        modifier = Modifier
            .zIndex(widget.zIndex)
            .offset { IntOffset(xPx.roundToInt(), yPx.roundToInt()) }
            .size(width, height)
            .clip(RoundedCornerShape(24.dp))
            .then(editModifier),
    ) {
        AndroidView(
            factory = { context ->
                controller.createView(context, widget.appWidgetId)
                    ?: TextView(context).apply {
                        text = widget.label + "\nWidget unavailable"
                        setTextColor(android.graphics.Color.WHITE)
                        gravity = Gravity.CENTER
                        setBackgroundColor(android.graphics.Color.argb(180, 24, 24, 30))
                    }
            },
            modifier = Modifier.fillMaxSize(),
        )

        if (editMode) {
            GlassPanel(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(7.dp),
                shape = RoundedCornerShape(999.dp),
                contentPadding = PaddingValues(horizontal = 9.dp, vertical = 5.dp),
            ) {
                Text(
                    text = "Edit",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
fun AndroidWidgetPicker(
    controller: AndroidWidgetHostController,
    onSelect: (AppWidgetProviderInfo) -> Unit,
    onClose: () -> Unit,
) {
    val providers = remember(controller) { controller.providers() }

    GlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 34.dp, bottom = 86.dp, start = 12.dp, end = 12.dp),
        shape = RoundedCornerShape(34.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                text = "Android Widgets",
                color = Color.White,
                fontSize = 27.sp,
            )
            Text(
                text = "Widgets provided by apps installed on this device",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(14.dp))

            if (providers.isEmpty()) {
                Text(
                    text = "No Android widget providers are available.",
                    color = Color.White.copy(alpha = 0.62f),
                    modifier = Modifier.padding(vertical = 20.dp),
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    items(
                        items = providers,
                        key = { it.provider.flattenToString() },
                    ) { provider ->
                        AndroidWidgetProviderRow(
                            provider = provider,
                            controller = controller,
                            onSelect = onSelect,
                        )
                    }
                }
            }

            Button(
                onClick = onClose,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Close")
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AndroidWidgetProviderRow(
    provider: AppWidgetProviderInfo,
    controller: AndroidWidgetHostController,
    onSelect: (AppWidgetProviderInfo) -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = { onSelect(provider) },
                onLongClick = { onSelect(provider) },
            ),
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 13.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = controller.widgetLabel(provider),
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = controller.appLabel(provider),
                    color = Color.White.copy(alpha = 0.52f),
                    fontSize = 11.sp,
                )
            }
            Text(
                text = "Add",
                color = Color.White.copy(alpha = 0.72f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
fun HostedWidgetEditSheet(
    widget: HostedWidget,
    onScaleChanged: (Float) -> Unit,
    onRemove: () -> Unit,
    onClose: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 104.dp),
        shape = RoundedCornerShape(30.dp),
        contentPadding = PaddingValues(20.dp),
    ) {
        Column {
            Text(
                text = widget.label,
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Android widget size",
                color = Color.White.copy(alpha = 0.60f),
                fontSize = 12.sp,
            )
            Slider(
                value = widget.scale,
                onValueChange = onScaleChanged,
                valueRange = 0.70f..1.80f,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Button(onClick = onRemove) {
                    Text("Remove")
                }
                Button(onClick = onClose) {
                    Text("Done")
                }
            }
        }
    }
}
