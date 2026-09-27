package tech.wonderer.velora.ui

import android.app.BatteryManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
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
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
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
import tech.wonderer.velora.service.NotificationActions
import tech.wonderer.velora.service.NotificationRepository
import tech.wonderer.velora.service.VeloraNotification
import tech.wonderer.velora.service.VeloraNotificationListener
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.LocalVeloraPalette
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
    val notifications by NotificationRepository.notifications.collectAsState()
    val notificationAccess =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    val now by produceState(initialValue = Date()) {
        while (true) {
            value = Date()
            delay(1_000)
        }
    }
    val battery = context.getSystemService(BatteryManager::class.java)
        ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        ?.takeIf { it >= 0 }
    val media by mediaState(notificationAccess)

    GlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 18.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
        shape = RoundedCornerShape(34.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column {
                        Text(
                            text = SimpleDateFormat("h:mm", Locale.getDefault()).format(now),
                            color = Color.White,
                            fontSize = 34.sp,
                            fontWeight = FontWeight.Light,
                        )
                        Text(
                            text = SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(now),
                            color = Color.White.copy(alpha = 0.62f),
                        )
                    }
                    Text(
                        text = battery?.let { it.toString() + "%" } ?: "Velora",
                        color = Color.White.copy(alpha = 0.82f),
                    )
                }
            }

            item {
                QuickControls()
            }

            item {
                SystemSliders()
            }

            media?.let { mediaValue ->
                item {
                    MediaCard(mediaValue)
                }
            }

            item {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = "Notifications",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (notifications.isNotEmpty() && notificationAccess) {
                        Text(
                            text = "Clear all",
                            color = Color.White.copy(alpha = 0.66f),
                            fontSize = 12.sp,
                            modifier = Modifier.clickable {
                                NotificationActions.clearAll()
                            },
                        )
                    }
                }
            }

            when {
                !notificationAccess -> {
                    item {
                        NotificationAccessCard {
                            context.startActivity(
                                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
                            )
                        }
                    }
                }

                notifications.isEmpty() -> {
                    item {
                        Text(
                            text = "You're all caught up.",
                            color = Color.White.copy(alpha = 0.60f),
                            modifier = Modifier.padding(vertical = 18.dp),
                        )
                    }
                }

                else -> {
                    val groups = notifications
                        .groupBy { it.packageName }
                        .values
                        .toList()

                    items(
                        items = groups,
                        key = { group -> group.first().packageName },
                    ) { group ->
                        NotificationGroup(group)
                    }
                }
            }

            item {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Close Control Center",
                    color = Color.White.copy(alpha = 0.70f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onClose)
                        .padding(vertical = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun QuickControls() {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            QuickControl("Wi-Fi", Modifier.weight(1f)) {
                context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
            }
            QuickControl("Bluetooth", Modifier.weight(1f)) {
                context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            QuickControl("Sound", Modifier.weight(1f)) {
                context.startActivity(Intent(Settings.ACTION_SOUND_SETTINGS))
            }
            QuickControl("Settings", Modifier.weight(1f)) {
                context.startActivity(Intent(Settings.ACTION_SETTINGS))
            }
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
    var brightness by remember {
        mutableFloatStateOf(readBrightness(context))
    }
    val canWriteBrightness = Settings.System.canWrite(context)

    GlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Column {
            SliderRow(
                label = "Brightness",
                value = brightness,
                onValueChange = { value ->
                    brightness = value
                    if (canWriteBrightness) {
                        writeBrightness(context, value)
                    }
                },
                trailing = ((brightness * 100).toInt()).toString() + if (canWriteBrightness) "%" else "% · Grant",
                onTrailingClick = if (canWriteBrightness) {
                    null
                } else {
                    {
                        context.startActivity(
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
                onValueChange = { value ->
                    volume = value
                    audio?.setStreamVolume(
                        AudioManager.STREAM_MUSIC,
                        (value * maxVolume).toInt().coerceIn(0, maxVolume),
                        0,
                    )
                },
                trailing = ((volume * 100).toInt()).toString() + "%",
            )
        }
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
    trailing: String,
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
                color = Color.White.copy(alpha = 0.58f),
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

    GlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(26.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            Text(
                text = "Now Playing",
                color = palette.secondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
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
                    color = Color.White.copy(alpha = 0.58f),
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(18.dp),
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
private fun QuickControl(
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    GlassPanel(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 16.dp),
    ) {
        Text(
            text = label,
            color = Color.White,
        )
    }
}

@Composable
private fun NotificationAccessCard(onClick: () -> Unit) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            Text(
                text = "Enable notification access",
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Required for notifications and media sessions inside Velora.",
                color = Color.White.copy(alpha = 0.62f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun NotificationGroup(
    group: List<VeloraNotification>,
) {
    val first = group.first()
    GlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(14.dp),
    ) {
        Column {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = first.appLabel,
                    color = Color.White.copy(alpha = 0.62f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (group.size > 1) {
                    Text(
                        text = group.size.toString(),
                        color = Color.White.copy(alpha = 0.52f),
                        fontSize = 11.sp,
                    )
                }
            }

            group.take(5).forEachIndexed { index, item ->
                if (index > 0) {
                    Spacer(Modifier.height(10.dp))
                }
                NotificationRow(item)
            }
        }
    }
}

@Composable
private fun NotificationRow(item: VeloraNotification) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                runCatching { item.contentIntent?.send() }
            },
    ) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = item.title,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
                maxLines = 1,
            )
            Text(
                text = "×",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 18.sp,
                modifier = Modifier
                    .padding(start = 12.dp)
                    .clickable {
                        NotificationActions.dismiss(item.key)
                    },
            )
        }
        if (item.text.isNotBlank()) {
            Text(
                text = item.text,
                color = Color.White.copy(alpha = 0.72f),
                maxLines = 3,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun mediaState(
    notificationAccess: Boolean,
): State<VeloraMediaState?> {
    val context = LocalContext.current
    return produceState<VeloraMediaState?>(
        initialValue = null,
        key1 = notificationAccess,
    ) {
        if (!notificationAccess) {
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
