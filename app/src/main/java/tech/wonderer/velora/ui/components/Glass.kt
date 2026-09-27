package tech.wonderer.velora.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(28.dp),
    contentPadding: PaddingValues = PaddingValues(0.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .shadow(18.dp, shape, ambientColor = Color.Black.copy(alpha = 0.30f))
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        Color.White.copy(alpha = 0.20f),
                        Color.White.copy(alpha = 0.095f),
                        Color.Black.copy(alpha = 0.12f),
                    ),
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.20f), shape)
            .padding(contentPadding),
        content = content,
    )
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
