package tech.wonderer.velora.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import tech.wonderer.velora.data.AppCatalog
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.model.VeloraIconShape
import tech.wonderer.velora.model.VeloraIconStyle

val LocalIconAppearance = staticCompositionLocalOf { IconAppearance() }

@Composable
fun VeloraIconAppearanceProvider(
    appearance: IconAppearance,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalIconAppearance provides appearance,
        content = content,
    )
}

@Composable
fun VeloraAppIcon(
    packageName: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val appearance = LocalIconAppearance.current
    val bitmap by produceState<Bitmap?>(initialValue = null, packageName) {
        value = withContext(Dispatchers.IO) {
            AppCatalog.loadIcon(context, packageName)
        }
    }
    val accent = remember(packageName) { accentFor(packageName) }
    val fallbackGlyph = remember(packageName) { fallbackGlyphFor(packageName) }
    val shape = iconShape(appearance.shape)

    when (appearance.style) {
        VeloraIconStyle.ORIGINAL -> {
            IconImageOrFallback(
                bitmap = bitmap,
                modifier = modifier.clip(shape),
                shape = shape,
                accent = accent,
                fallbackGlyph = fallbackGlyph,
            )
        }

        VeloraIconStyle.GLASS -> {
            GlassIconShell(
                bitmap = bitmap,
                modifier = modifier,
                shape = shape,
                accent = accent,
                fallbackGlyph = fallbackGlyph,
            )
        }

        VeloraIconStyle.AURORA -> {
            AuroraIconShell(
                bitmap = bitmap,
                modifier = modifier,
                shape = shape,
                accent = accent,
                fallbackGlyph = fallbackGlyph,
            )
        }
    }
}

@Composable
private fun GlassIconShell(
    bitmap: Bitmap?,
    modifier: Modifier,
    shape: Shape,
    accent: AccentPair,
    fallbackGlyph: String,
) {
    BoxWithConstraints(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .shadow(10.dp, shape)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.30f),
                        accent.primary.copy(alpha = 0.22f),
                        Color(0xFF111117).copy(alpha = 0.78f),
                    ),
                    start = Offset.Zero,
                    end = Offset.Infinite,
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.26f), shape),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawOval(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.30f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * 0.30f, size.height * 0.18f),
                    radius = size.minDimension * 0.70f,
                ),
                topLeft = Offset(-size.width * 0.10f, -size.height * 0.22f),
                size = Size(size.width * 1.05f, size.height * 0.72f),
            )
            drawCircle(
                color = accent.secondary.copy(alpha = 0.18f),
                radius = size.minDimension * 0.34f,
                center = Offset(size.width * 0.78f, size.height * 0.80f),
            )
        }

        val innerSize = maxWidth * 0.72f
        IconImageOrFallback(
            bitmap = bitmap,
            modifier = Modifier.size(innerSize),
            shape = RoundedCornerShape(22),
            accent = accent,
            fallbackGlyph = fallbackGlyph,
        )
    }
}

@Composable
private fun AuroraIconShell(
    bitmap: Bitmap?,
    modifier: Modifier,
    shape: Shape,
    accent: AccentPair,
    fallbackGlyph: String,
) {
    BoxWithConstraints(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .shadow(12.dp, shape)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        accent.primary.copy(alpha = 0.95f),
                        accent.secondary.copy(alpha = 0.88f),
                        Color(0xFF17131F),
                    ),
                    start = Offset.Zero,
                    end = Offset.Infinite,
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.34f), shape),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(
                color = Color.White.copy(alpha = 0.24f),
                radius = size.minDimension * 0.48f,
                center = Offset(size.width * 0.15f, size.height * 0.08f),
            )
            drawCircle(
                color = Color.Black.copy(alpha = 0.14f),
                radius = size.minDimension * 0.42f,
                center = Offset(size.width * 0.88f, size.height * 0.88f),
            )
        }

        val innerSize = maxWidth * 0.70f
        IconImageOrFallback(
            bitmap = bitmap,
            modifier = Modifier.size(innerSize),
            shape = RoundedCornerShape(22),
            accent = accent,
            fallbackGlyph = fallbackGlyph,
        )
    }
}

@Composable
private fun IconImageOrFallback(
    bitmap: Bitmap?,
    modifier: Modifier,
    shape: Shape,
    accent: AccentPair,
    fallbackGlyph: String,
) {
    if (bitmap != null) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = modifier.clip(shape),
        )
    } else {
        Box(
            contentAlignment = Alignment.Center,
            modifier = modifier
                .clip(shape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            accent.primary.copy(alpha = 0.72f),
                            accent.secondary.copy(alpha = 0.72f),
                        ),
                    ),
                ),
        ) {
            Text(
                text = fallbackGlyph,
                color = Color.White.copy(alpha = 0.96f),
                fontSize = if (fallbackGlyph.length > 1) 17.sp else 23.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun iconShape(shape: VeloraIconShape): Shape = when (shape) {
    VeloraIconShape.SQUIRCLE -> RoundedCornerShape(30)
    VeloraIconShape.CIRCLE -> CircleShape
    VeloraIconShape.SOFT_SQUARE -> RoundedCornerShape(20)
}

private data class AccentPair(
    val primary: Color,
    val secondary: Color,
)

private fun accentFor(packageName: String): AccentPair {
    val palette = listOf(
        AccentPair(Color(0xFFB7A7FF), Color(0xFF78D9FF)),
        AccentPair(Color(0xFFFF9DCB), Color(0xFFB7A7FF)),
        AccentPair(Color(0xFF7EE7D6), Color(0xFF78B8FF)),
        AccentPair(Color(0xFFFFC987), Color(0xFFFF9BB7)),
        AccentPair(Color(0xFF9FC5FF), Color(0xFFD8A8FF)),
        AccentPair(Color(0xFFB7F09A), Color(0xFF79D9D0)),
    )
    val index = (packageName.hashCode() and Int.MAX_VALUE) % palette.size
    return palette[index]
}


private fun fallbackGlyphFor(packageName: String): String {
    val key = packageName.substringAfterLast('.').lowercase()
    return when (key) {
        "messages" -> "✦"
        "camera" -> "●"
        "maps" -> "⌖"
        "music" -> "♪"
        "files" -> "▤"
        "notes" -> "≡"
        "browser" -> "◎"
        "calendar" -> "27"
        "studio" -> "◆"
        "mail" -> "✉"
        "photos" -> "▣"
        "tasks" -> "✓"
        else -> key.take(1).uppercase().ifBlank { "V" }
    }
}
