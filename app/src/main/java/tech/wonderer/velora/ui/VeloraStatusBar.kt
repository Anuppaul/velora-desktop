package tech.wonderer.velora.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class StatusSnapshot(
    val time: String,
    val network: String,
    val battery: String,
)

@Composable
fun VeloraStatusBar(
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val snapshot by produceState(initialValue = statusSnapshot(context)) {
        while (true) {
            value = statusSnapshot(context)
            delay(5_000)
        }
    }

    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Text(
            text = snapshot.time,
            color = Color.White.copy(alpha = 0.96f),
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = snapshot.network,
                color = Color.White.copy(alpha = 0.88f),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = snapshot.battery,
                color = Color.White.copy(alpha = 0.92f),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun statusSnapshot(context: Context): StatusSnapshot {
    val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val active = connectivity?.activeNetwork
    val capabilities = active?.let { connectivity.getNetworkCapabilities(it) }
    val network = when {
        capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "⌁ Wi-Fi"
        capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "▮▮▮ Mobile"
        capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "▣ LAN"
        else -> "—"
    }

    val battery = context.getSystemService(BatteryManager::class.java)
        ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        ?.takeIf { it in 0..100 }
        ?.let { "$it%" }
        ?: "Velora"

    return StatusSnapshot(
        time = time,
        network = network,
        battery = battery,
    )
}
