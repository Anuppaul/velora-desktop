package tech.wonderer.velora.ui

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.delay
import tech.wonderer.velora.BuildConfig
import tech.wonderer.velora.service.VeloraNotificationListener
import tech.wonderer.velora.ui.components.FullPageLiquidGlass
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.LocalVeloraPalette
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class VeloraMediaState(
    val title: String,
    val artist: String,
    val isPlaying: Boolean,
    val controller: MediaController,
)

private data class CompactControlSpec(
    val symbol: String,
    val label: String,
    val detail: String,
    val action: () -> Unit,
)

@Composable
fun ControlCenter(
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val notificationIntegration =
        BuildConfig.NOTIFICATION_INTEGRATION || BuildConfig.DEV_ADVANCED_INTEGRATIONS
    val mediaAccess by produceState(
        initialValue = false,
        key1 = notificationIntegration,
    ) {
        while (true) {
            value =
                notificationIntegration &&
                    NotificationManagerCompat.getEnabledListenerPackages(context)
                        .contains(context.packageName)
            delay(1_000)
        }
    }
    val now by produceState(initialValue = Date()) {
        while (true) {
            value = Date()
            delay(1_000)
        }
    }
    val battery = context.getSystemService(BatteryManager::class.java)
        ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        ?.takeIf { it in 0..100 }
    val media by mediaState(mediaAccess)

    SwipeDismissSurface(
        direction = SwipeDismissDirection.UP,
        onDismiss = onClose,
    ) {
        FullPageLiquidGlass(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = 68.dp,
                bottom = 96.dp,
                start = 18.dp,
                end = 18.dp,
            ),
            intensity = 0.74f,
        ) {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 18.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                item {
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column {
                            Text(
                                text = "Control Center",
                                color = Color.White,
                                fontSize = 28.sp,
                                fontWeight = FontWeight.Light,
                            )
                            Text(
                                text = SimpleDateFormat(
                                    "h:mm · EEE, d MMM",
                                    Locale.getDefault(),
                                ).format(now),
                                color = Color.White.copy(alpha = 0.62f),
                                fontSize = 12.sp,
                            )
                        }
                        Text(
                            text = battery?.let { it.toString() + "%" } ?: "Velora",
                            color = Color.White.copy(alpha = 0.88f),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                item {
                    CompactConnectivityRow(context)
                }

                item {
                    SystemSliders()
                }

                item {
                    SectionTitle("System controls")
                    Spacer(Modifier.height(7.dp))
                    NativeSystemControls(context)
                }

                item {
                    when {
                        !notificationIntegration -> SafeReleaseMediaCard()
                        media != null -> MediaCard(media!!)
                        !mediaAccess -> MediaAccessCard()
                        else -> EmptyMediaCard()
                    }
                }
            }
        }
    }
}

@Composable
private fun CompactConnectivityRow(context: Context) {
    val controls = listOf(
        CompactControlSpec("◎", "Internet", "Panel") {
            openInternetPanel(context)
        },
        CompactControlSpec("⌁", "Wi-Fi", "Network") {
            openSystemScreen(context, Intent(Settings.ACTION_WIFI_SETTINGS))
        },
        CompactControlSpec("ᛒ", "Bluetooth", "Devices") {
            openSystemScreen(context, Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
        },
        CompactControlSpec("▥", "Mobile", "SIM") {
            openSystemScreen(context, Intent(Settings.ACTION_NETWORK_OPERATOR_SETTINGS))
        },
    )

    Row(
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        controls.forEach { spec ->
            CompactControl(
                spec = spec,
                modifier = Modifier.weight(1f),
                intensity = 0.60f,
            )
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        color = Color.White.copy(alpha = 0.50f),
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun NativeSystemControls(context: Context) {
    val controls = buildList {
        add(
            CompactControlSpec("✈", "Airplane", "Radios") {
                openSystemScreen(context, Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS))
            },
        )
        add(
            CompactControlSpec("◐", "Focus", "DND") {
                openSystemScreen(
                    context,
                    Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS),
                )
            },
        )
        add(
            CompactControlSpec("↻", "Display", "Rotate") {
                openSystemScreen(context, Intent(Settings.ACTION_DISPLAY_SETTINGS))
            },
        )
        add(
            CompactControlSpec("◒", "Battery", "Saver") {
                openSystemScreen(context, Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS))
            },
        )
        add(
            CompactControlSpec("⌁", "Hotspot", "Tether") {
                openSystemScreen(context, Intent("android.settings.TETHER_SETTINGS"))
            },
        )
        add(
            CompactControlSpec("⌖", "Location", "GPS") {
                openSystemScreen(context, Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            },
        )
        add(
            CompactControlSpec("◇", "VPN", "Secure") {
                openSystemScreen(context, Intent(Settings.ACTION_VPN_SETTINGS))
            },
        )
        add(
            CompactControlSpec("▱", "Cast", "Screen") {
                openSystemScreen(context, Intent(Settings.ACTION_CAST_SETTINGS))
            },
        )
        add(
            CompactControlSpec("♪", "Sound", "Audio") {
                openSystemScreen(context, Intent(Settings.ACTION_SOUND_SETTINGS))
            },
        )
        add(
            CompactControlSpec("N", "NFC", "Tap") {
                openSystemScreen(context, Intent(Settings.ACTION_NFC_SETTINGS))
            },
        )

        if (BuildConfig.DEV_ADVANCED_INTEGRATIONS) {
            add(
                CompactControlSpec("A", "Access", "Dev only") {
                    openSystemScreen(context, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                },
            )
        }

        add(
            CompactControlSpec("⚙", "Settings", "System") {
                openSystemScreen(context, Intent(Settings.ACTION_SETTINGS))
            },
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        controls.chunked(4).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                row.forEach { control ->
                    CompactControl(
                        spec = control,
                        modifier = Modifier.weight(1f),
                        intensity = 0.55f,
                    )
                }
                repeat(4 - row.size) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun CompactControl(
    spec: CompactControlSpec,
    modifier: Modifier = Modifier,
    intensity: Float = 0.60f,
) {
    val palette = LocalVeloraPalette.current

    LiquidGlassPanel(
        modifier = modifier.clickable(onClick = spec.action),
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 7.dp, vertical = 10.dp),
        intensity = intensity,
    ) {
        Column {
            Text(
                text = spec.symbol,
                color = palette.secondary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                text = spec.label,
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Text(
                text = spec.detail,
                color = Color.White.copy(alpha = 0.45f),
                fontSize = 7.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun SystemSliders() {
    val context = LocalContext.current
    val audio = context.getSystemService(AudioManager::class.java)
    val maxVolume = audio?.getStreamMaxVolume(AudioManager.STREAM_MUSIC)?.coerceAtLeast(1) ?: 1
    var volume by remember {
        mutableFloatStateOf(
            (audio?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 0) / maxVolume.toFloat(),
        )
    }
    var brightness by remember { mutableFloatStateOf(readBrightness(context)) }
    val canWriteBrightness =
        BuildConfig.DEV_ADVANCED_INTEGRATIONS && Settings.System.canWrite(context)

    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        intensity = 0.62f,
    ) {
        Column {
            SliderRow(
                label = "Brightness",
                value = brightness,
                trailing = ((brightness * 100).toInt()).toString() +
                    if (BuildConfig.DEV_ADVANCED_INTEGRATIONS) {
                        if (canWriteBrightness) "%" else "% · Grant"
                    } else {
                        "% · Local"
                    },
                onValueChange = { value ->
                    brightness = value
                    if (canWriteBrightness) {
                        writeBrightness(context, value)
                    } else {
                        writeWindowBrightness(context, value)
                    }
                },
                onTrailingClick = if (
                    BuildConfig.DEV_ADVANCED_INTEGRATIONS && !canWriteBrightness
                ) {
                    {
                        openSystemScreen(
                            context,
                            Intent(
                                Settings.ACTION_MANAGE_WRITE_SETTINGS,
                                Uri.parse("package:" + context.packageName),
                            ),
                        )
                    }
                } else {
                    null
                },
            )

            SliderRow(
                label = "Volume",
                value = volume,
                trailing = ((volume * 100).toInt()).toString() + "%",
                onValueChange = { value ->
                    volume = value
                    audio?.setStreamVolume(
                        AudioManager.STREAM_MUSIC,
                        (value * maxVolume).toInt().coerceIn(0, maxVolume),
                        0,
                    )
                },
            )
        }
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Float,
    trailing: String,
    onValueChange: (Float) -> Unit,
    onTrailingClick: (() -> Unit)? = null,
) {
    Column {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(label, color = Color.White, fontSize = 11.sp)
            Text(
                text = trailing,
                color = Color.White.copy(alpha = 0.58f),
                fontSize = 10.sp,
                modifier = if (onTrailingClick != null) {
                    Modifier.clickable { onTrailingClick() }
                } else {
                    Modifier
                },
            )
        }
        Slider(
            value = value.coerceIn(0f, 1f),
            onValueChange = onValueChange,
        )
    }
}

@Composable
private fun MediaCard(state: VeloraMediaState) {
    val palette = LocalVeloraPalette.current
    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(14.dp),
        intensity = 0.62f,
    ) {
        Column {
            Text(
                text = "NOW PLAYING",
                color = palette.secondary,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = state.title,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            if (state.artist.isNotBlank()) {
                Text(
                    text = state.artist,
                    color = Color.White.copy(alpha = 0.58f),
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                MediaAction("Previous") { state.controller.transportControls.skipToPrevious() }
                MediaAction(if (state.isPlaying) "Pause" else "Play") {
                    if (state.isPlaying) state.controller.transportControls.pause()
                    else state.controller.transportControls.play()
                }
                MediaAction("Next") { state.controller.transportControls.skipToNext() }
            }
        }
    }
}

@Composable
private fun MediaAccessCard() {
    val context = LocalContext.current
    LiquidGlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                openSystemScreen(context, Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            },
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(14.dp),
        intensity = 0.62f,
    ) {
        Column {
            Text("Enable media access", color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(
                "Notification access lets Velora read active media sessions.",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun SafeReleaseMediaCard() {
    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(14.dp),
        intensity = 0.58f,
    ) {
        Column {
            Text("Media", color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(
                "Cross-app media access is not declared in this sideload-safe APK.",
                color = Color.White.copy(alpha = 0.52f),
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun EmptyMediaCard() {
    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(14.dp),
        intensity = 0.58f,
    ) {
        Column {
            Text("Media", color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(
                "Nothing is playing.",
                color = Color.White.copy(alpha = 0.52f),
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun MediaAction(label: String, onClick: () -> Unit) {
    Text(
        text = label,
        color = Color.White,
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@Composable
private fun mediaState(mediaAccess: Boolean): State<VeloraMediaState?> {
    val context = LocalContext.current
    return produceState<VeloraMediaState?>(initialValue = null, key1 = mediaAccess) {
        if (!mediaAccess) {
            value = null
            return@produceState
        }
        while (true) {
            value = findActiveMedia(context)
            delay(1_000)
        }
    }
}

private fun findActiveMedia(context: Context): VeloraMediaState? {
    val manager = context.getSystemService(MediaSessionManager::class.java) ?: return null
    val component = ComponentName(context, VeloraNotificationListener::class.java)
    val controllers = runCatching { manager.getActiveSessions(component) }.getOrDefault(emptyList())
    val controller = controllers.firstOrNull {
        it.playbackState?.state == PlaybackState.STATE_PLAYING
    } ?: controllers.firstOrNull() ?: return null
    val metadata = controller.metadata
    val title = metadata
        ?.getString(MediaMetadata.METADATA_KEY_TITLE)
        ?.takeIf { it.isNotBlank() }
        ?: controller.packageName
    val artist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST).orEmpty()
    return VeloraMediaState(
        title = title,
        artist = artist,
        isPlaying = controller.playbackState?.state == PlaybackState.STATE_PLAYING,
        controller = controller,
    )
}

private fun writeWindowBrightness(context: Context, value: Float) {
    context.findActivity()?.let { activity ->
        val attributes = activity.window.attributes
        attributes.screenBrightness = value.coerceIn(0.01f, 1f)
        activity.window.attributes = attributes
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun readBrightness(context: Context): Float {
    val raw = runCatching {
        Settings.System.getInt(
            context.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS,
            128,
        )
    }.getOrDefault(128)
    return (raw / 255f).coerceIn(0f, 1f)
}

private fun writeBrightness(context: Context, value: Float) {
    runCatching {
        Settings.System.putInt(
            context.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS,
            (value.coerceIn(0f, 1f) * 255f).toInt(),
        )
    }
}

private fun openInternetPanel(context: Context) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        Intent("android.settings.panel.action.INTERNET_CONNECTIVITY")
    } else {
        Intent(Settings.ACTION_WIRELESS_SETTINGS)
    }
    openSystemScreen(context, intent)
}

private fun openSystemScreen(context: Context, intent: Intent) {
    val opened = runCatching {
        context.startActivity(intent)
        true
    }.getOrDefault(false)
    if (!opened) {
        runCatching { context.startActivity(Intent(Settings.ACTION_SETTINGS)) }
    }
}
