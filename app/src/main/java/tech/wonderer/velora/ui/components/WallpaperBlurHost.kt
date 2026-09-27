package tech.wonderer.velora.ui.components

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import kotlin.math.roundToInt

@Composable
fun WallpaperBlurHost(
    strength: Float,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val activity = context.findActivity()
    val normalized = strength.coerceIn(0f, 1f)

    SideEffect {
        activity?.window?.let { window ->
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER)
            window.setBackgroundDrawable(ColorDrawable(android.graphics.Color.TRANSPARENT))

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val backgroundRadius = (normalized * 96f).roundToInt()
                val behindRadius = (normalized * 72f).roundToInt()

                window.setBackgroundBlurRadius(backgroundRadius)

                val attributes = window.attributes
                if (normalized > 0.01f) {
                    attributes.flags =
                        attributes.flags or WindowManager.LayoutParams.FLAG_BLUR_BEHIND
                    attributes.blurBehindRadius = behindRadius
                } else {
                    attributes.flags =
                        attributes.flags and WindowManager.LayoutParams.FLAG_BLUR_BEHIND.inv()
                    attributes.blurBehindRadius = 0
                }
                window.attributes = attributes
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF9EFFF4).copy(alpha = 0.035f + normalized * 0.045f),
                        Color(0xFF4ADCF5).copy(alpha = 0.045f + normalized * 0.055f),
                        Color(0xFF2A7AF4).copy(alpha = 0.050f + normalized * 0.060f),
                        Color(0xFF684DFF).copy(alpha = 0.035f + normalized * 0.050f),
                    ),
                ),
            ),
    )
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
