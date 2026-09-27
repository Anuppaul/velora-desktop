package tech.wonderer.velora.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(28.dp),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    val palette = LocalVeloraPalette.current

    Box(
        modifier = modifier
            .shadow(18.dp, shape, ambientColor = Color.Black.copy(alpha = 0.30f))
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        palette.glassTop,
                        palette.glassMiddle,
                        palette.glassBottom,
                    ),
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.20f), shape),
    ) {
        Canvas(Modifier.matchParentSize()) {
            drawOval(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.16f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * 0.28f, size.height * 0.08f),
                    radius = size.minDimension * 0.92f,
                ),
                topLeft = Offset(-size.width * 0.10f, -size.height * 0.34f),
                size = Size(size.width * 1.10f, size.height * 0.86f),
            )

            drawCircle(
                color = palette.secondary.copy(alpha = 0.055f),
                radius = size.minDimension * 0.46f,
                center = Offset(size.width * 0.92f, size.height * 0.96f),
            )
        }

        Box(
            modifier = Modifier.padding(contentPadding),
            content = content,
        )
    }
}

@Composable
fun GlassPill(
    text: String,
    modifier: Modifier = Modifier,
) {
    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = text,
            color = Color.White.copy(alpha = 0.92f),
            fontWeight = FontWeight.Medium,
            modifier = Modifier.align(Alignment.Center),
        )
    }
}


@Composable
fun ModalBackdrop(
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xA8090A12),
                        Color(0xB20A0B13),
                        Color(0xC007080E),
                    ),
                ),
            ),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.05f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * 0.18f, size.height * 0.08f),
                    radius = size.width * 0.80f,
                ),
                radius = size.width * 0.80f,
                center = Offset(size.width * 0.18f, size.height * 0.08f),
            )
        }
    }
}


@Composable
fun LiquidGlassPanel(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(28.dp),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    val palette = LocalVeloraPalette.current

    Box(
        modifier = modifier
            .shadow(
                elevation = 22.dp,
                shape = shape,
                ambientColor = Color.Black.copy(alpha = 0.34f),
                spotColor = palette.secondary.copy(alpha = 0.16f),
            )
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.24f),
                        palette.secondary.copy(alpha = 0.17f),
                        palette.accent.copy(alpha = 0.12f),
                        Color(0xFF122238).copy(alpha = 0.34f),
                    ),
                    start = Offset.Zero,
                    end = Offset.Infinite,
                ),
            )
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.82f),
                        Color.White.copy(alpha = 0.24f),
                        palette.secondary.copy(alpha = 0.52f),
                        palette.accent.copy(alpha = 0.24f),
                    ),
                ),
                shape = shape,
            ),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val edge = 1.4.dp.toPx()

            drawOval(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.46f),
                        Color.White.copy(alpha = 0.12f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * 0.20f, size.height * 0.06f),
                    radius = size.minDimension * 0.95f,
                ),
                topLeft = Offset(-size.width * 0.14f, -size.height * 0.34f),
                size = Size(size.width * 1.05f, size.height * 0.82f),
            )

            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        palette.secondary.copy(alpha = 0.34f),
                        palette.secondary.copy(alpha = 0.08f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * 0.96f, size.height * 0.96f),
                    radius = size.minDimension * 0.64f,
                ),
                radius = size.minDimension * 0.64f,
                center = Offset(size.width * 0.96f, size.height * 0.96f),
            )

            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        palette.accent.copy(alpha = 0.26f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * 0.05f, size.height * 0.74f),
                    radius = size.minDimension * 0.48f,
                ),
                radius = size.minDimension * 0.48f,
                center = Offset(size.width * 0.05f, size.height * 0.74f),
            )

            drawRoundRect(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.56f),
                        Color.White.copy(alpha = 0.08f),
                        palette.secondary.copy(alpha = 0.22f),
                    ),
                    start = Offset.Zero,
                    end = Offset(size.width, size.height),
                ),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(30.dp.toPx()),
                style = Stroke(width = edge),
            )
        }

        Box(
            modifier = Modifier.padding(contentPadding),
            content = content,
        )
    }
}
