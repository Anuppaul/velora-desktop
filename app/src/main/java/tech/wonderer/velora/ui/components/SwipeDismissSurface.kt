package tech.wonderer.velora.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
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
    val scope = rememberCoroutineScope()
    val screenHeightPx = with(density) {
        configuration.screenHeightDp.dp.toPx().coerceAtLeast(1f)
    }
    val thresholdPx = with(density) { 64.dp.toPx() }
    val entryOffset = if (direction == SwipeDismissDirection.UP) {
        -screenHeightPx
    } else {
        screenHeightPx
    }

    val animatedOffset = remember(direction, screenHeightPx) {
        Animatable(entryOffset)
    }
    var dragOffset by remember(direction, screenHeightPx) {
        mutableFloatStateOf(0f)
    }

    LaunchedEffect(direction, screenHeightPx) {
        dragOffset = 0f
        animatedOffset.snapTo(entryOffset)
        animatedOffset.animateTo(
            targetValue = 0f,
            animationSpec = tween(durationMillis = 220),
        )
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .offset {
                IntOffset(
                    x = 0,
                    y = (animatedOffset.value + dragOffset).roundToInt(),
                )
            },
    ) {
        content()

        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .align(
                    if (direction == SwipeDismissDirection.UP) {
                        Alignment.BottomCenter
                    } else {
                        Alignment.TopCenter
                    },
                )
                .padding(
                    top = if (direction == SwipeDismissDirection.DOWN) 52.dp else 0.dp,
                    bottom = if (direction == SwipeDismissDirection.UP) 82.dp else 0.dp,
                )
                .width(96.dp)
                .height(44.dp)
                .pointerInput(direction, onDismiss, screenHeightPx) {
                    detectVerticalDragGestures(
                        onVerticalDrag = { change, dragAmount ->
                            change.consume()
                            dragOffset = when (direction) {
                                SwipeDismissDirection.UP ->
                                    (dragOffset + dragAmount).coerceAtMost(0f)

                                SwipeDismissDirection.DOWN ->
                                    (dragOffset + dragAmount).coerceAtLeast(0f)
                            }
                        },
                        onDragCancel = {
                            val completed = dragOffset
                            scope.launch {
                                animatedOffset.snapTo(completed)
                                dragOffset = 0f
                                animatedOffset.animateTo(
                                    targetValue = 0f,
                                    animationSpec = tween(durationMillis = 150),
                                )
                            }
                        },
                        onDragEnd = {
                            val completed = dragOffset
                            scope.launch {
                                animatedOffset.snapTo(completed)
                                dragOffset = 0f

                                if (abs(completed) >= thresholdPx) {
                                    val exitOffset =
                                        if (direction == SwipeDismissDirection.UP) {
                                            -screenHeightPx
                                        } else {
                                            screenHeightPx
                                        }
                                    animatedOffset.animateTo(
                                        targetValue = exitOffset,
                                        animationSpec = tween(durationMillis = 170),
                                    )
                                    onDismiss()
                                } else {
                                    animatedOffset.animateTo(
                                        targetValue = 0f,
                                        animationSpec = tween(durationMillis = 150),
                                    )
                                }
                            }
                        },
                    )
                },
        ) {
            Box(
                modifier = Modifier
                    .width(42.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color.White.copy(alpha = 0.38f)),
            )
        }
    }
}
