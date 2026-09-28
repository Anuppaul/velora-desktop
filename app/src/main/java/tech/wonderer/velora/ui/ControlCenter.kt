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
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
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
    val id: String,
    val symbol: String,
    val label: String,
    val detail: String,
    val action: () -> Unit,
)

private const val CONTROL_ICON_PREFS = "velora_control_center_icon_colors"

private fun loadControlIconColors(context: Context): Map<String, Color> {
    val prefs = context.getSharedPreferences(CONTROL_ICON_PREFS, Context.MODE_PRIVATE)
    return prefs.all.mapNotNull { (key, value) ->
        (value as? Int)?.let { key to Color(it) }
    }.toMap()
}

private fun persistControlIconColor(
    context: Context,
    controlId: String,
    color: Color,
) {
    context.getSharedPreferences(CONTROL_ICON_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putInt(controlId, color.toArgb())
        .apply()
}

private fun resetControlIconColor(
    context: Context,
    controlId: String,
) {
    context.getSharedPreferences(CONTROL_ICON_PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove(controlId)
        .apply()
}

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
    var editMode by remember { mutableStateOf(false) }
    var selectedControl by remember { mutableStateOf<CompactControlSpec?>(null) }
    val iconColors = remember(context) {
        mutableStateMapOf<String, Color>().apply {
            putAll(loadControlIconColors(context))
        }
    }

    fun selectControl(spec: CompactControlSpec) {
        selectedControl = spec
    }

    fun changeSelectedColor(color: Color) {
        val spec = selectedControl ?: return
        iconColors[spec.id] = color
        persistControlIconColor(context, spec.id, color)
    }

    fun resetSelectedColor() {
        val spec = selectedControl ?: return
        iconColors.remove(spec.id)
        resetControlIconColor(context, spec.id)
    }

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
                        verticalAlignment = Alignment.CenterVertically,
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

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = battery?.let { it.toString() + "%" } ?: "Velora",
                                color = Color.White.copy(alpha = 0.88f),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = if (editMode) "Done" else "✎ Edit",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .clickable {
                                        editMode = !editMode
                                        if (!editMode) selectedControl = null
                                    }
                                    .padding(horizontal = 8.dp, vertical = 7.dp),
                            )
                        }
                    }
                }

                if (editMode) {
                    item {
                        val spec = selectedControl
                        if (spec == null) {
                            LiquidGlassPanel(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(22.dp),
                                contentPadding = PaddingValues(14.dp),
                                intensity = 0.58f,
                            ) {
                                Text(
                                    text = "Tap any control tile to edit its icon color.",
                                    color = Color.White.copy(alpha = 0.72f),
                                    fontSize = 11.sp,
                                )
                            }
                        } else {
                            ControlIconColorEditor(
                                spec = spec,
                                color = iconColors[spec.id] ?: Color.Black,
                                onColorChanged = ::changeSelectedColor,
                                onReset = ::resetSelectedColor,
                            )
                        }
                    }
                }

                item {
                    CompactConnectivityRow(
                        context = context,
                        editMode = editMode,
                        iconColors = iconColors,
                        selectedControlId = selectedControl?.id,
                        onSelect = ::selectControl,
                    )
                }

                item {
                    SystemSliders()
                }

                item {
                    SectionTitle("System controls")
                    Spacer(Modifier.height(7.dp))
                    NativeSystemControls(
                        context = context,
                        editMode = editMode,
                        iconColors = iconColors,
                        selectedControlId = selectedControl?.id,
                        onSelect = ::selectControl,
                    )
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
private fun CompactConnectivityRow(
    context: Context,
    editMode: Boolean,
    iconColors: Map<String, Color>,
    selectedControlId: String?,
    onSelect: (CompactControlSpec) -> Unit,
) {
    val controls = listOf(
        CompactControlSpec("internet", "◎", "Internet", "Panel") {
            openInternetPanel(context)
        },
        CompactControlSpec("wifi", "⌁", "Wi-Fi", "Network") {
            openSystemScreen(context, Intent(Settings.ACTION_WIFI_SETTINGS))
        },
        CompactControlSpec("bluetooth", "ᛒ", "Bluetooth", "Devices") {
            openSystemScreen(context, Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
        },
        CompactControlSpec("mobile", "▥", "Mobile", "SIM") {
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
                editMode = editMode,
                iconColor = iconColors[spec.id] ?: Color.Black,
                selected = selectedControlId == spec.id,
                onSelect = onSelect,
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
private fun NativeSystemControls(
    context: Context,
    editMode: Boolean,
    iconColors: Map<String, Color>,
    selectedControlId: String?,
    onSelect: (CompactControlSpec) -> Unit,
) {
    val controls = buildList {
        add(
            CompactControlSpec("airplane", "✈", "Airplane", "Radios") {
                openSystemScreen(context, Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS))
            },
        )
        add(
            CompactControlSpec("focus", "◐", "Focus", "DND") {
                openSystemScreen(
                    context,
                    Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS),
                )
            },
        )
        add(
            CompactControlSpec("display", "↻", "Display", "Rotate") {
                openSystemScreen(context, Intent(Settings.ACTION_DISPLAY_SETTINGS))
            },
        )
        add(
            CompactControlSpec("battery", "◒", "Battery", "Saver") {
                openSystemScreen(context, Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS))
            },
        )
        add(
            CompactControlSpec("hotspot", "⌁", "Hotspot", "Tether") {
                openSystemScreen(context, Intent("android.settings.TETHER_SETTINGS"))
            },
        )
        add(
            CompactControlSpec("location", "⌖", "Location", "GPS") {
                openSystemScreen(context, Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            },
        )
        add(
            CompactControlSpec("vpn", "◇", "VPN", "Secure") {
                openSystemScreen(context, Intent(Settings.ACTION_VPN_SETTINGS))
            },
        )
        add(
            CompactControlSpec("cast", "▱", "Cast", "Screen") {
                openSystemScreen(context, Intent(Settings.ACTION_CAST_SETTINGS))
            },
        )
        add(
            CompactControlSpec("sound", "♪", "Sound", "Audio") {
                openSystemScreen(context, Intent(Settings.ACTION_SOUND_SETTINGS))
            },
        )
        add(
            CompactControlSpec("nfc", "N", "NFC", "Tap") {
                openSystemScreen(context, Intent(Settings.ACTION_NFC_SETTINGS))
            },
        )

        if (BuildConfig.DEV_ADVANCED_INTEGRATIONS) {
            add(
                CompactControlSpec("access", "A", "Access", "Dev only") {
                    openSystemScreen(context, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                },
            )
        }

        add(
            CompactControlSpec("settings", "⚙", "Settings", "System") {
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
                        editMode = editMode,
                        iconColor = iconColors[control.id] ?: Color.Black,
                        selected = selectedControlId == control.id,
                        onSelect = onSelect,
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
    editMode: Boolean,
    iconColor: Color,
    selected: Boolean,
    onSelect: (CompactControlSpec) -> Unit,
) {
    LiquidGlassPanel(
        modifier = modifier.clickable {
            if (editMode) onSelect(spec) else spec.action()
        },
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 7.dp, vertical = 10.dp),
        intensity = if (selected) 0.92f else intensity,
    ) {
        Column {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(32.dp)
                    .background(
                        color = Color.White.copy(alpha = 0.80f),
                        shape = CircleShape,
                    ),
            ) {
                Text(
                    text = spec.symbol,
                    color = iconColor,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(5.dp))
            Text(
                text = spec.label,
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Text(
                text = if (selected && editMode) "Editing" else spec.detail,
                color = Color.White.copy(alpha = 0.48f),
                fontSize = 7.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ControlIconColorEditor(
    spec: CompactControlSpec,
    color: Color,
    onColorChanged: (Color) -> Unit,
    onReset: () -> Unit,
) {
    LiquidGlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(14.dp),
        intensity = 0.68f,
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(42.dp)
                        .background(Color.White.copy(alpha = 0.84f), CircleShape),
                ) {
                    Text(
                        text = spec.symbol,
                        color = color,
                        fontSize = 21.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = spec.label + " icon",
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = String.format(
                            Locale.US,
                            "#%06X",
                            color.toArgb() and 0x00FFFFFF,
                        ),
                        color = Color.White.copy(alpha = 0.56f),
                        fontSize = 10.sp,
                    )
                }
                Text(
                    text = "Reset black",
                    color = Color.White.copy(alpha = 0.76f),
                    fontSize = 10.sp,
                    modifier = Modifier
                        .clickable(onClick = onReset)
                        .padding(8.dp),
                )
            }

            Spacer(Modifier.height(8.dp))
            ColorChannelSlider(
                label = "R",
                value = color.red,
                onValueChange = {
                    onColorChanged(
                        Color(
                            red = it,
                            green = color.green,
                            blue = color.blue,
                            alpha = 1f,
                        ),
                    )
                },
            )
            ColorChannelSlider(
                label = "G",
                value = color.green,
                onValueChange = {
                    onColorChanged(
                        Color(
                            red = color.red,
                            green = it,
                            blue = color.blue,
                            alpha = 1f,
                        ),
                    )
                },
            )
            ColorChannelSlider(
                label = "B",
                value = color.blue,
                onValueChange = {
                    onColorChanged(
                        Color(
                            red = color.red,
                            green = color.green,
                            blue = it,
                            alpha = 1f,
                        ),
                    )
                },
            )
        }
    }
}

@Composable
private fun ColorChannelSlider(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
        Slider(
            value = value.coerceIn(0f, 1f),
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = (value.coerceIn(0f, 1f) * 255f).toInt().toString(),
            color = Color.White.copy(alpha = 0.58f),
            fontSize = 9.sp,
        )
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
