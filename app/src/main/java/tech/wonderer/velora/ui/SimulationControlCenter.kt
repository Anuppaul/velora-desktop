package tech.wonderer.velora.ui

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.LocalVeloraPalette
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface

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
        GlassPanel(
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
                            text = "2:14 · Sun, 27 Sep",
                            color = Color.White.copy(alpha = 0.58f),
                            fontSize = 12.sp,
                        )
                    }
                    Text(
                        text = "87%",
                        color = Color.White.copy(alpha = 0.82f),
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            item { SimQuickGrid() }

            item {
                GlassPanel(
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
private fun SimQuickGrid() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            SimQuick("⌁", "Wi-Fi", "Home 5G", Modifier.weight(1f))
            SimQuick("ᛒ", "Bluetooth", "On", Modifier.weight(1f))
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            SimQuick("◐", "Focus", "Personal", Modifier.weight(1f))
            SimQuick("↻", "Display", "Auto rotate", Modifier.weight(1f))
        }
    }
}

@Composable
private fun SimQuick(
    symbol: String,
    label: String,
    detail: String,
    modifier: Modifier = Modifier,
) {
    val palette = LocalVeloraPalette.current

    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Column {
            Text(symbol, color = palette.secondary, fontSize = 22.sp)
            Spacer(Modifier.height(8.dp))
            Text(label, color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(detail, color = Color.White.copy(alpha = 0.48f), fontSize = 10.sp)
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
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 11.sp,
            )
        }
        Slider(value = value, onValueChange = onValueChange)
    }
}

@Composable
private fun SimMediaCard() {
    val palette = LocalVeloraPalette.current

    GlassPanel(
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
                color = Color.White.copy(alpha = 0.56f),
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
