package tech.wonderer.velora

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import tech.wonderer.velora.data.AndroidWidgetHostController
import tech.wonderer.velora.ui.VeloraRoot
import tech.wonderer.velora.ui.theme.VeloraTheme

class LauncherActivity : ComponentActivity() {

    private lateinit var androidWidgetHost: AndroidWidgetHostController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        androidWidgetHost = AndroidWidgetHostController(this)
        applyImmersiveMode()
        setContent {
            VeloraTheme {
                VeloraRoot(androidWidgetHost = androidWidgetHost)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        androidWidgetHost.startListening()
    }

    override fun onStop() {
        androidWidgetHost.stopListening()
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveMode()
    }

    private fun applyImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
