package tech.wonderer.velora.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val VeloraColors = darkColorScheme(
    primary = Color(0xFFF5F4FF),
    onPrimary = Color(0xFF15141A),
    secondary = Color(0xFFD7D2FF),
    background = Color.Transparent,
    surface = Color(0xFF17171D),
    onSurface = Color(0xFFF7F5FF),
    onBackground = Color(0xFFF7F5FF),
)

@Composable
fun VeloraTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = VeloraColors,
        typography = Typography(),
        content = content,
    )
}
