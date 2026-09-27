package tech.wonderer.velora.ui

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.StatFs
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.consume
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.model.PremiumWidgetType
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.LocalVeloraPalette
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FreeformPremiumWidget(
    widget: HomeWidget,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onMoveCommitted: (String, Float, Float) -> Unit,
    onEdit: (String) -> Unit,
) {
    var localX by remember(widget.id, widget.x) { mutableFloatStateOf(widget.x) }
    var localY by remember(widget.id, widget.y) { mutableFloatStateOf(widget.y) }
    val density = LocalDensity.current
    val base = widgetBaseSize(widget.type)
    val width = base.first * widget.scale
    val height = base.second * widget.scale
    val widthPx = with(density) { width.toPx() }
    val heightPx = with(density) { height.toPx() }
    val xPx = localX.coerceIn(0f, 1f) * (canvasWidthPx - widthPx).coerceAtLeast(1f)
    val yPx = localY.coerceIn(0f, 1f) * (canvasHeightPx - heightPx).coerceAtLeast(1f)

    Box(
        modifier = Modifier
            .offset { IntOffset(xPx.roundToInt(), yPx.roundToInt()) }
            .size(width, height)
            .pointerInput(widget.id, canvasWidthPx, canvasHeightPx) {
                detectDragGestures(
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
                        onMoveCommitted(widget.id, localX, localY)
                    },
                )
            }
            .combinedClickable(
                onClick = {},
                onLongClick = { onEdit(widget.id) },
            ),
    ) {
        PremiumWidgetCard(
            type = widget.type,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
fun PremiumWidgetPreview(
    type: PremiumWidgetType,
    modifier: Modifier = Modifier,
) {
    PremiumWidgetCard(
        type = type,
        modifier = modifier,
    )
}

@Composable
private fun PremiumWidgetCard(
    type: PremiumWidgetType,
    modifier: Modifier,
) {
    when (type) {
        PremiumWidgetType.CLOCK -> ClockWidget(modifier)
        PremiumWidgetType.CALENDAR -> CalendarWidget(modifier)
        PremiumWidgetType.BATTERY -> BatteryWidget(modifier)
        PremiumWidgetType.DEVICE -> DeviceWidget(modifier)
    }
}

@Composable
private fun ClockWidget(modifier: Modifier) {
    val now by ticker()
    val palette = LocalVeloraPalette.current

    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(30.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxSize(),
        ) {
            Text(
                text = SimpleDateFormat("h:mm", Locale.getDefault()).format(now),
                color = Color.White,
                fontSize = 36.sp,
                fontWeight = FontWeight.Light,
            )
            Text(
                text = SimpleDateFormat("EEEE · d MMM", Locale.getDefault()).format(now),
                color = palette.secondary.copy(alpha = 0.92f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun CalendarWidget(modifier: Modifier) {
    val now by ticker()
    val palette = LocalVeloraPalette.current

    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(28.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = SimpleDateFormat("dd", Locale.getDefault()).format(now),
                    color = Color.White,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = SimpleDateFormat("MMM", Locale.getDefault()).format(now).uppercase(),
                    color = palette.accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Column {
                Text(
                    text = SimpleDateFormat("EEEE", Locale.getDefault()).format(now),
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "Today",
                    color = Color.White.copy(alpha = 0.56f),
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun BatteryWidget(modifier: Modifier) {
    val context = LocalContext.current
    val battery by produceState(initialValue = batteryLevel(context)) {
        while (true) {
            value = batteryLevel(context)
            delay(30_000)
        }
    }
    val palette = LocalVeloraPalette.current

    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(28.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(54.dp),
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    drawCircle(
                        color = Color.White.copy(alpha = 0.12f),
                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                            width = 5.dp.toPx(),
                        ),
                    )
                    val sweep = 360f * ((battery ?: 0) / 100f)
                    drawArc(
                        brush = Brush.sweepGradient(
                            listOf(palette.accent, palette.secondary),
                        ),
                        startAngle = -90f,
                        sweepAngle = sweep,
                        useCenter = false,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                            width = 5.dp.toPx(),
                            cap = StrokeCap.Round,
                        ),
                    )
                }
                Text(
                    text = battery?.let { "$it" } ?: "—",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Column {
                Text(
                    text = "Battery",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = battery?.let { "$it% remaining" } ?: "Unavailable",
                    color = Color.White.copy(alpha = 0.60f),
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun DeviceWidget(modifier: Modifier) {
    val context = LocalContext.current
    val stats = remember { deviceStats(context) }
    val palette = LocalVeloraPalette.current

    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(28.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxSize(),
        ) {
            Text(
                text = "Device",
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Metric(
                    label = "Storage",
                    value = stats.first,
                    accent = palette.accent,
                )
                Metric(
                    label = "Memory",
                    value = stats.second,
                    accent = palette.secondary,
                )
            }
        }
    }
}

@Composable
private fun Metric(
    label: String,
    value: String,
    accent: Color,
) {
    Column {
        Text(
            text = value,
            color = accent,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.54f),
            fontSize = 10.sp,
        )
    }
}

@Composable
private fun ticker() = produceState(initialValue = Date()) {
    while (true) {
        value = Date()
        delay(1_000)
    }
}

private fun batteryLevel(context: Context): Int? {
    val manager = context.getSystemService(BatteryManager::class.java) ?: return null
    return manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        .takeIf { it in 0..100 }
}

private fun deviceStats(context: Context): Pair<String, String> {
    val stat = StatFs(context.filesDir.absolutePath)
    val totalStorage = stat.totalBytes.coerceAtLeast(1L)
    val freeStorage = stat.availableBytes.coerceAtLeast(0L)
    val usedPercent = (((totalStorage - freeStorage) * 100L) / totalStorage).toInt()

    val activityManager = context.getSystemService(ActivityManager::class.java)
    val info = ActivityManager.MemoryInfo()
    activityManager?.getMemoryInfo(info)
    val memoryPercent = if (info.totalMem > 0L) {
        (((info.totalMem - info.availMem) * 100L) / info.totalMem).toInt()
    } else {
        0
    }

    return "$usedPercent%" to "$memoryPercent%"
}

fun widgetBaseSize(type: PremiumWidgetType) = when (type) {
    PremiumWidgetType.CLOCK -> 220.dp to 104.dp
    PremiumWidgetType.CALENDAR -> 190.dp to 104.dp
    PremiumWidgetType.BATTERY -> 184.dp to 104.dp
    PremiumWidgetType.DEVICE -> 200.dp to 104.dp
}
