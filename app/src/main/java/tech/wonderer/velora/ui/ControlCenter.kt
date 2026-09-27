package tech.wonderer.velora.ui

import android.app.BatteryManager
import android.content.Intent
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.delay
import tech.wonderer.velora.service.NotificationRepository
import tech.wonderer.velora.service.VeloraNotification
import tech.wonderer.velora.ui.components.GlassPanel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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

    GlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 18.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
        shape = RoundedCornerShape(34.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
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
                    text = battery?.let { "$it%" } ?: "Velora",
                    color = Color.White.copy(alpha = 0.82f),
                )
            }

            Spacer(Modifier.height(18.dp))
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
            Spacer(Modifier.height(10.dp))
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

            Spacer(Modifier.height(20.dp))
            Text(
                text = "Notifications",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))

            when {
                !notificationAccess -> {
                    NotificationAccessCard {
                        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    }
                }

                notifications.isEmpty() -> {
                    Text(
                        text = "You're all caught up.",
                        color = Color.White.copy(alpha = 0.60f),
                        modifier = Modifier.padding(vertical = 18.dp),
                    )
                }

                else -> {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        items(notifications, key = { it.key }) { item ->
                            NotificationCard(item)
                        }
                    }
                }
            }
        }
    }
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
                text = "Required only if you want Android notifications inside Velora's Control Center.",
                color = Color.White.copy(alpha = 0.62f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun NotificationCard(item: VeloraNotification) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                runCatching { item.contentIntent?.send() }
            },
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(14.dp),
    ) {
        Column {
            Text(
                text = item.appLabel,
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 11.sp,
            )
            Text(
                text = item.title,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
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
}
