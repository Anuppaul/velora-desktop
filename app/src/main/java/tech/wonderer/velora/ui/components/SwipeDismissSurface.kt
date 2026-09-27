package tech.wonderer.velora.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt

enum class SwipeDismissDirection {
    UP,
    DOWN,
}

@Composable
fun SwipeDismissSurface(
    direction: SwipeDismissDirection,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val screenHeightPx = with(density) {
        configuration.screenHeightDp.dp.toPx().coerceAtLeast(1f)
    }
    val entryOffset = if (direction == SwipeDismissDirection.UP) {
        -screenHeightPx
    } else {
        screenHeightPx
    }
    val offsetY = remember(direction, screenHeightPx) {
        Animatable(entryOffset)
    }

    LaunchedEffect(direction, screenHeightPx) {
        offsetY.snapTo(entryOffset)
        offsetY.animateTo(
            targetValue = 0f,
            animationSpec = tween(durationMillis = 220),
        )
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .offset { IntOffset(0, offsetY.value.roundToInt()) }
            .pointerInput(direction, onDismiss, screenHeightPx) {
                val thresholdPx = 76.dp.toPx()
                val topHandleZonePx = 116.dp.toPx()
                val bottomHandleZonePx = 190.dp.toPx()

                awaitEachGesture {
                    val down = awaitFirstDown(
                        requireUnconsumed = false,
                        pass = PointerEventPass.Initial,
                    )
                    val canDismiss = when (direction) {
                        SwipeDismissDirection.UP ->
                            down.position.y >= size.height - bottomHandleZonePx

                        SwipeDismissDirection.DOWN ->
                            down.position.y <= topHandleZonePx
                    }

                    if (!canDismiss) {
                        var pressed = true
                        while (pressed) {
                            val event = awaitPointerEvent(PointerEventPass.Final)
                            pressed = event.changes.any { it.pressed }
                        }
                        return@awaitEachGesture
                    }

                    val startY = down.position.y
                    var gestureFinished = false

                    while (!gestureFinished) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        val change = event.changes.firstOrNull { it.id == down.id }
                        if (change == null) {
                            gestureFinished = true
                        } else {
                            val rawDelta = change.position.y - startY
                            val directionalDelta = when (direction) {
                                SwipeDismissDirection.UP -> rawDelta.coerceAtMost(0f)
                                SwipeDismissDirection.DOWN -> rawDelta.coerceAtLeast(0f)
                            }
                            offsetY.snapTo(directionalDelta)
                            gestureFinished = !change.pressed
                        }
                    }

                    if (abs(offsetY.value) >= thresholdPx) {
                        val exit = if (direction == SwipeDismissDirection.UP) {
                            -screenHeightPx
                        } else {
                            screenHeightPx
                        }
                        offsetY.animateTo(
                            targetValue = exit,
                            animationSpec = tween(durationMillis = 180),
                        )
                        onDismiss()
                    } else {
                        offsetY.animateTo(
                            targetValue = 0f,
                            animationSpec = tween(durationMillis = 160),
                        )
                    }
                }
            },
    ) {
        content()

        Box(
            modifier = Modifier
                .align(
                    if (direction == SwipeDismissDirection.UP) {
                        Alignment.BottomCenter
                    } else {
                        Alignment.TopCenter
                    },
                )
                .padding(
                    top = if (direction == SwipeDismissDirection.DOWN) 12.dp else 0.dp,
                    bottom = if (direction == SwipeDismissDirection.UP) 94.dp else 0.dp,
                )
                .width(42.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color.White.copy(alpha = 0.34f)),
        )
    }
}
