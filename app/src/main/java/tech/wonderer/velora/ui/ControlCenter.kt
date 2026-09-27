package tech.wonderer.velora.ui

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.BatteryManager
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
import tech.wonderer.velora.service.VeloraNotificationListener
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

@Composable
fun ControlCenter(
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val mediaAccess =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
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
        LiquidGlassPanel(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 18.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
        shape = RoundedCornerShape(34.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(bottom = 12.dp),
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
                            fontSize = 29.sp,
                            fontWeight = FontWeight.Light,
                        )
                        Text(
                            text = SimpleDateFormat("h:mm · EEE, d MMM", Locale.getDefault())
                                .format(now),
                            color = Color.White.copy(alpha = 0.58f),
                            fontSize = 12.sp,
                        )
                    }
                    Text(
                        text = battery?.let { it.toString() + "%" } ?: "Velora",
                        color = Color.White.copy(alpha = 0.82f),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            item { QuickControls() }
            item { SystemSliders() }

            item {
                when {
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
private fun QuickControls() {
    val context = LocalContext.current

    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            QuickControl(
                symbol = "⌁",
                label = "Wi-Fi",
                detail = "Network",
                modifier = Modifier.weight(1f),
            ) {
                openSystemScreen(context, Intent(Settings.ACTION_WIFI_SETTINGS))
            }
            QuickControl(
                symbol = "ᛒ",
                label = "Bluetooth",
                detail = "Devices",
                modifier = Modifier.weight(1f),
            ) {
                openSystemScreen(context, Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            QuickControl(
                symbol = "◐",
                label = "Focus",
                detail = "Do Not Disturb",
                modifier = Modifier.weight(1f),
            ) {
                openSystemScreen(
                    context,
                    Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS),
                )
            }
            QuickControl(
                symbol = "↻",
                label = "Display",
                detail = "Rotation & screen",
                modifier = Modifier.weight(1f),
            ) {
                openSystemScreen(context, Intent(Settings.ACTION_DISPLAY_SETTINGS))
            }
        }
    }
}

@Composable
private fun QuickControl(
    symbol: String,
    label: String,
    detail: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val palette = LocalVeloraPalette.current

    LiquidGlassPanel(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Column {
            Text(
                text = symbol,
                color = palette.secondary,
                fontSize = 22.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = label,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = detail,
                color = Color.White.copy(alpha = 0.48f),
                fontSize = 10.sp,
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
    val canWriteBrightness = Settings.System.canWrite(context)

    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Column {
            SliderRow(
                label = "Brightness",
                value = brightness,
                trailing = ((brightness * 100).toInt()).toString() +
                    if (canWriteBrightness) "%" else "% · Grant",
                onValueChange = { value ->
                    brightness = value
                    if (canWriteBrightness) writeBrightness(context, value)
                },
                onTrailingClick = if (canWriteBrightness) {
                    null
                } else {
                    {
                        openSystemScreen(
                            context,
                            Intent(
                                Settings.ACTION_MANAGE_WRITE_SETTINGS,
                                Uri.parse("package:" + context.packageName),
                            ),
                        )
                    }
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
            Text(
                text = label,
                color = Color.White,
                fontSize = 12.sp,
            )
            Text(
                text = trailing,
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 11.sp,
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
        shape = RoundedCornerShape(26.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            Text(
                text = "NOW PLAYING",
                color = palette.secondary,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = state.title,
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            if (state.artist.isNotBlank()) {
                Text(
                    text = state.artist,
                    color = Color.White.copy(alpha = 0.56f),
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                MediaAction("Previous") {
                    state.controller.transportControls.skipToPrevious()
                }
                MediaAction(if (state.isPlaying) "Pause" else "Play") {
                    if (state.isPlaying) {
                        state.controller.transportControls.pause()
                    } else {
                        state.controller.transportControls.play()
                    }
                }
                MediaAction("Next") {
                    state.controller.transportControls.skipToNext()
                }
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
                openSystemScreen(
                    context,
                    Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
                )
            },
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            Text(
                text = "Enable media access",
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Notification access lets Velora read active media sessions.",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun EmptyMediaCard() {
    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            Text(
                text = "Media",
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Nothing is playing.",
                color = Color.White.copy(alpha = 0.52f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun MediaAction(
    label: String,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        color = Color.White,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@Composable
private fun mediaState(
    mediaAccess: Boolean,
): State<VeloraMediaState?> {
    val context = LocalContext.current

    return produceState<VeloraMediaState?>(
        initialValue = null,
        key1 = mediaAccess,
    ) {
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
    val controllers = runCatching {
        manager.getActiveSessions(component)
    }.getOrDefault(emptyList())

    val controller = controllers.firstOrNull {
        it.playbackState?.state == PlaybackState.STATE_PLAYING
    } ?: controllers.firstOrNull() ?: return null

    val metadata = controller.metadata
    val title = metadata
        ?.getString(MediaMetadata.METADATA_KEY_TITLE)
        ?.takeIf { it.isNotBlank() }
        ?: controller.packageName
    val artist = metadata
        ?.getString(MediaMetadata.METADATA_KEY_ARTIST)
        .orEmpty()

    return VeloraMediaState(
        title = title,
        artist = artist,
        isPlaying = controller.playbackState?.state == PlaybackState.STATE_PLAYING,
        controller = controller,
    )
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

private fun writeBrightness(
    context: Context,
    value: Float,
) {
    runCatching {
        Settings.System.putInt(
            context.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS,
            (value.coerceIn(0f, 1f) * 255f).toInt(),
        )
    }
}


private fun openSystemScreen(
    context: Context,
    intent: Intent,
) {
    val opened = runCatching {
        context.startActivity(intent)
        true
    }.getOrDefault(false)

    if (!opened) {
        runCatching {
            context.startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }
}
