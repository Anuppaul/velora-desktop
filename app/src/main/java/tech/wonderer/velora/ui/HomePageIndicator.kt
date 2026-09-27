package tech.wonderer.velora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun HomePageIndicator(
    currentPage: Int,
    pageCount: Int,
    modifier: Modifier = Modifier,
) {
    Canvas(
        modifier = modifier
            .width((pageCount * 14).dp)
            .height(12.dp),
    ) {
        val spacing = 14.dp.toPx()
        val start = (size.width - spacing * (pageCount - 1)) / 2f

        repeat(pageCount) { index ->
            drawCircle(
                color = if (index == currentPage) {
                    Color.White.copy(alpha = 0.92f)
                } else {
                    Color.White.copy(alpha = 0.30f)
                },
                radius = if (index == currentPage) 3.2.dp.toPx() else 2.5.dp.toPx(),
                center = androidx.compose.ui.geometry.Offset(
                    x = start + index * spacing,
                    y = size.height / 2f,
                ),
            )
        }
    }
}
