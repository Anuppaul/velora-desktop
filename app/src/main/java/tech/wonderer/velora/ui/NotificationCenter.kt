package tech.wonderer.velora.ui

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
import tech.wonderer.velora.service.NotificationActions
import tech.wonderer.velora.service.NotificationRepository
import tech.wonderer.velora.service.VeloraNotification
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun NotificationCenter(
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val notifications by NotificationRepository.notifications.collectAsState()
    val accessEnabled =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    val now by produceState(initialValue = Date()) {
        while (true) {
            value = Date()
            delay(30_000)
        }
    }

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
        Column(Modifier.fillMaxSize()) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column {
                    Text(
                        text = "Notifications",
                        color = Color.White,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Light,
                    )
                    Text(
                        text = SimpleDateFormat("EEEE · d MMMM", Locale.getDefault()).format(now),
                        color = Color.White.copy(alpha = 0.58f),
                        fontSize = 12.sp,
                    )
                }
                if (accessEnabled && notifications.isNotEmpty()) {
                    Text(
                        text = "Clear all",
                        color = Color.White.copy(alpha = 0.68f),
                        fontSize = 12.sp,
                        modifier = Modifier
                            .clickable { NotificationActions.clearAll() }
                            .padding(vertical = 8.dp),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            when {
                !accessEnabled -> {
                    LiquidGlassPanel(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                context.startActivity(
                                    Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
                                )
                            },
                        shape = RoundedCornerShape(24.dp),
                        contentPadding = PaddingValues(16.dp),
                    ) {
                        Column {
                            Text(
                                text = "Enable notification access",
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "Velora needs notification access to show your notifications here.",
                                color = Color.White.copy(alpha = 0.60f),
                                fontSize = 12.sp,
                            )
                        }
                    }
                }

                notifications.isEmpty() -> {
                    Text(
                        text = "No new notifications.",
                        color = Color.White.copy(alpha = 0.62f),
                        modifier = Modifier.padding(vertical = 24.dp),
                    )
                }

                else -> {
                    val groups = notifications
                        .groupBy { it.packageName }
                        .values
                        .toList()

                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        items(
                            items = groups,
                            key = { group -> group.first().packageName },
                        ) { group ->
                            NotificationCenterGroup(group)
                        }
                    }
                }
            }

        }
    }
    }
}

@Composable
private fun NotificationCenterGroup(
    group: List<VeloraNotification>,
) {
    val first = group.first()

    LiquidGlassPanel(
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
                    color = Color.White.copy(alpha = 0.58f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (group.size > 1) {
                    Text(
                        text = group.size.toString(),
                        color = Color.White.copy(alpha = 0.46f),
                        fontSize = 11.sp,
                    )
                }
            }

            group.take(6).forEachIndexed { index, item ->
                if (index > 0) Spacer(Modifier.height(12.dp))
                NotificationCenterRow(item)
            }
        }
    }
}

@Composable
private fun NotificationCenterRow(
    item: VeloraNotification,
) {
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
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "×",
                color = Color.White.copy(alpha = 0.52f),
                fontSize = 18.sp,
                modifier = Modifier
                    .padding(start = 12.dp)
                    .clickable { NotificationActions.dismiss(item.key) },
            )
        }
        if (item.text.isNotBlank()) {
            Text(
                text = item.text,
                color = Color.White.copy(alpha = 0.70f),
                fontSize = 13.sp,
                maxLines = 3,
            )
        }
    }
}
