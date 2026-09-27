package tech.wonderer.velora.ui

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.LocalVeloraPalette
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface

private data class SimControl(
    val symbol: String,
    val label: String,
    val detail: String,
)

@Composable
fun SimulationControlCenter(
    onClose: () -> Unit,
) {
    var brightness by remember { mutableFloatStateOf(0.72f) }
    var volume by remember { mutableFloatStateOf(0.56f) }

    SwipeDismissSurface(
        direction = SwipeDismissDirection.UP,
        onDismiss = onClose,
    ) {
        LiquidGlassPanel(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 52.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
            shape = RoundedCornerShape(34.dp),
            contentPadding = PaddingValues(18.dp),
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
                                text = "2:14 · Sun, 27 Sep",
                                color = Color.White.copy(alpha = 0.62f),
                                fontSize = 12.sp,
                            )
                        }
                        Text(
                            text = "87%",
                            color = Color.White.copy(alpha = 0.88f),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                item { SimConnectivityRow() }

                item {
                    LiquidGlassPanel(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                        intensity = 0.62f,
                    ) {
                        Column {
                            SimSlider("Brightness", brightness) { brightness = it }
                            SimSlider("Volume", volume) { volume = it }
                        }
                    }
                }

                item {
                    Text(
                        text = "SYSTEM CONTROLS",
                        color = Color.White.copy(alpha = 0.50f),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(7.dp))
                    SimSystemGrid()
                }

                item { SimMediaCard() }
            }
        }
    }
}

@Composable
private fun SimConnectivityRow() {
    val controls = listOf(
        SimControl("◎", "Internet", "Panel"),
        SimControl("⌁", "Wi-Fi", "Home 5G"),
        SimControl("ᛒ", "Bluetooth", "On"),
        SimControl("▥", "Mobile", "5G"),
    )
    Row(
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        controls.forEach {
            SimCompact(it, Modifier.weight(1f), 0.60f)
        }
    }
}

@Composable
private fun SimSystemGrid() {
    val controls = listOf(
        SimControl("✈", "Airplane", "Off"),
        SimControl("◐", "Focus", "Personal"),
        SimControl("↻", "Display", "Auto"),
        SimControl("◒", "Battery", "Saver"),
        SimControl("⌁", "Hotspot", "Off"),
        SimControl("⌖", "Location", "On"),
        SimControl("◇", "VPN", "Off"),
        SimControl("▱", "Cast", "Ready"),
        SimControl("♪", "Sound", "Normal"),
        SimControl("N", "NFC", "On"),
        SimControl("A", "Access", "Services"),
        SimControl("⚙", "Settings", "System"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        controls.chunked(4).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                row.forEach {
                    SimCompact(it, Modifier.weight(1f), 0.55f)
                }
            }
        }
    }
}

@Composable
private fun SimCompact(
    control: SimControl,
    modifier: Modifier = Modifier,
    intensity: Float,
) {
    val palette = LocalVeloraPalette.current
    LiquidGlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 7.dp, vertical = 10.dp),
        intensity = intensity,
    ) {
        Column {
            Text(
                text = control.symbol,
                color = palette.secondary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                text = control.label,
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Text(
                text = control.detail,
                color = Color.White.copy(alpha = 0.45f),
                fontSize = 7.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun SimSlider(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
) {
    Column {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(label, color = Color.White, fontSize = 11.sp)
            Text(
                text = ((value * 100).toInt()).toString() + "%",
                color = Color.White.copy(alpha = 0.58f),
                fontSize = 10.sp,
            )
        }
        Slider(value = value, onValueChange = onValueChange)
    }
}

@Composable
private fun SimMediaCard() {
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
                text = "Midnight Architecture",
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Velora Sessions",
                color = Color.White.copy(alpha = 0.58f),
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("Previous", color = Color.White, fontSize = 11.sp)
                Text("Pause", color = Color.White, fontSize = 11.sp)
                Text("Next", color = Color.White, fontSize = 11.sp)
            }
        }
    }
}
