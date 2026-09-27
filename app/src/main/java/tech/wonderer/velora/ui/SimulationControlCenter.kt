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

private data class SimCompactControl(
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
                .padding(top = 18.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
            shape = RoundedCornerShape(34.dp),
            contentPadding = PaddingValues(18.dp),
        ) {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(14.dp),
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
                                fontSize = 29.sp,
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

                item {
                    SimSectionTitle("Connectivity")
                    Spacer(Modifier.height(8.dp))
                    SimConnectivity()
                }

                item {
                    SimSectionTitle("System controls")
                    Spacer(Modifier.height(8.dp))
                    SimSystemControls()
                }

                item {
                    LiquidGlassPanel(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    ) {
                        Column {
                            SimSlider(
                                label = "Brightness",
                                value = brightness,
                                onValueChange = { brightness = it },
                            )
                            SimSlider(
                                label = "Volume",
                                value = volume,
                                onValueChange = { volume = it },
                            )
                        }
                    }
                }

                item { SimMediaCard() }
            }
        }
    }
}

@Composable
private fun SimSectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        color = Color.White.copy(alpha = 0.55f),
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun SimConnectivity() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            SimHeroControl("◎", "Internet", "Connected", Modifier.weight(1f))
            SimHeroControl("⌁", "Wi-Fi", "Home 5G", Modifier.weight(1f))
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            SimHeroControl("ᛒ", "Bluetooth", "On", Modifier.weight(1f))
            SimHeroControl("▥", "Mobile", "5G", Modifier.weight(1f))
        }
    }
}

@Composable
private fun SimSystemControls() {
    val controls = listOf(
        SimCompactControl("✈", "Airplane", "Off"),
        SimCompactControl("◐", "Focus", "Personal"),
        SimCompactControl("↻", "Display", "Auto"),
        SimCompactControl("◒", "Battery", "Saver"),
        SimCompactControl("⌁", "Hotspot", "Off"),
        SimCompactControl("⌖", "Location", "On"),
        SimCompactControl("◇", "VPN", "Off"),
        SimCompactControl("▱", "Cast", "Ready"),
        SimCompactControl("♪", "Sound", "Normal"),
        SimCompactControl("N", "NFC", "On"),
        SimCompactControl("A", "Access", "Services"),
        SimCompactControl("⚙", "Settings", "System"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        controls.chunked(4).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                row.forEach { control ->
                    SimCompact(
                        control = control,
                        modifier = Modifier.weight(1f),
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
private fun SimHeroControl(
    symbol: String,
    label: String,
    detail: String,
    modifier: Modifier = Modifier,
) {
    val palette = LocalVeloraPalette.current
    LiquidGlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Column {
            Text(symbol, color = palette.secondary, fontSize = 22.sp)
            Spacer(Modifier.height(8.dp))
            Text(label, color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(detail, color = Color.White.copy(alpha = 0.52f), fontSize = 10.sp)
        }
    }
}

@Composable
private fun SimCompact(
    control: SimCompactControl,
    modifier: Modifier = Modifier,
) {
    val palette = LocalVeloraPalette.current
    LiquidGlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 12.dp),
    ) {
        Column {
            Text(
                text = control.symbol,
                color = palette.secondary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(7.dp))
            Text(
                text = control.label,
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Text(
                text = control.detail,
                color = Color.White.copy(alpha = 0.48f),
                fontSize = 8.sp,
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
            Text(label, color = Color.White, fontSize = 12.sp)
            Text(
                ((value * 100).toInt()).toString() + "%",
                color = Color.White.copy(alpha = 0.60f),
                fontSize = 11.sp,
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
                text = "Midnight Architecture",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Velora Sessions",
                color = Color.White.copy(alpha = 0.60f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                Text("Previous", color = Color.White, fontSize = 12.sp)
                Text("Pause", color = Color.White, fontSize = 12.sp)
                Text("Next", color = Color.White, fontSize = 12.sp)
            }
        }
    }
}
