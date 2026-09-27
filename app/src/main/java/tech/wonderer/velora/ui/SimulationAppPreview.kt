package tech.wonderer.velora.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.ui.components.GlassPanel

@Composable
fun SimulationAppPreview(
    packageName: String,
    label: String,
) {
    val accent = when (packageName.substringAfterLast('.')) {
        "messages" -> Color(0xFF9F92FF)
        "camera" -> Color(0xFFFF9D8F)
        "music" -> Color(0xFFE58CD8)
        "files" -> Color(0xFF6DD7B2)
        "mail" -> Color(0xFF80D59B)
        "calendar" -> Color(0xFF84B7FF)
        else -> Color(0xFF8FB8FF)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        event.changes.forEach { change ->
                            if (change.pressed) change.consume()
                        }
                    }
                }
            }
            .background(
                Brush.verticalGradient(
                    listOf(
                        accent.copy(alpha = 0.34f),
                        Color(0xFF11131A),
                        Color(0xFF080910),
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 72.dp, start = 24.dp, end = 24.dp, bottom = 110.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                PackageIcon(
                    packageName = packageName,
                    modifier = Modifier.size(58.dp),
                )
                Column {
                    Text(
                        text = label,
                        color = Color.White,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Velora Preview · simulated app",
                        color = Color.White.copy(alpha = 0.58f),
                        fontSize = 11.sp,
                    )
                }
            }

            Spacer(Modifier.height(28.dp))

            repeat(3) { index ->
                GlassPanel(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 7.dp),
                    shape = RoundedCornerShape(24.dp),
                    contentPadding = PaddingValues(16.dp),
                ) {
                    Column {
                        Text(
                            text = when (index) {
                                0 -> "App launch is working"
                                1 -> "This is a synthetic Preview app"
                                else -> "Use Velora Back or Home to return"
                            },
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Real launcher mode opens the installed Android application.",
                            color = Color.White.copy(alpha = 0.56f),
                            fontSize = 12.sp,
                        )
                    }
                }
            }
        }
    }
}
