package tech.wonderer.velora.ui.components

import android.app.WallpaperManager
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext

data class VeloraPalette(
    val accent: Color = Color(0xFFB7A7FF),
    val secondary: Color = Color(0xFF78D9FF),
    val glassTop: Color = Color.White.copy(alpha = 0.22f),
    val glassMiddle: Color = Color.White.copy(alpha = 0.10f),
    val glassBottom: Color = Color(0xFF090A10).copy(alpha = 0.24f),
)

val LocalVeloraPalette = staticCompositionLocalOf { VeloraPalette() }

@Composable
fun VeloraAmbientProvider(
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val palette = remember {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            runCatching {
                val colors = WallpaperManager.getInstance(context)
                    .getWallpaperColors(WallpaperManager.FLAG_SYSTEM)
                val primary = colors?.primaryColor?.toArgb()?.let(::Color)
                val secondary = colors?.secondaryColor?.toArgb()?.let(::Color)
                val readablePrimary = primary
                    ?.let { lerp(it, Color.White, 0.38f) }
                    ?: Color(0xFFB7A7FF)
                val readableSecondary = (secondary ?: primary)
                    ?.let { lerp(it, Color.White, 0.42f) }
                    ?: Color(0xFF78D9FF)
                VeloraPalette(
                    accent = readablePrimary,
                    secondary = readableSecondary,
                    glassTop = Color.White.copy(alpha = 0.23f),
                    glassMiddle = readablePrimary.copy(alpha = 0.10f),
                    glassBottom = Color(0xFF080910).copy(alpha = 0.32f),
                )
            }.getOrDefault(VeloraPalette())
        } else {
            VeloraPalette()
        }
    }

    CompositionLocalProvider(
        LocalVeloraPalette provides palette,
        content = content,
    )
}
