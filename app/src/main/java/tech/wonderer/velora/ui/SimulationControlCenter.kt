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
import androidx.compose.foundation.layout.weight
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

@Composable
fun SimulationControlCenter(
    onClose: () -> Unit,
) {
    var brightness by remember { mutableFloatStateOf(0.72f) }
    var volume by remember { mutableFloatStateOf(0.56f) }
    val palette = LocalVeloraPalette.current

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
                            text = "2:14",
                            color = Color.White,
                            fontSize = 34.sp,
                            fontWeight = FontWeight.Light,
                        )
                        Text(
                            text = "Sun, 27 Sep",
                            color = Color.White.copy(alpha = 0.62f),
                        )
                    }
                    Text(
                        text = "87%",
                        color = Color.White.copy(alpha = 0.82f),
                    )
                }
            }

            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    SimulationQuickControl("Wi-Fi", "Home 5G", Modifier.weight(1f))
                    SimulationQuickControl("Bluetooth", "On", Modifier.weight(1f))
                }
            }

            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    SimulationQuickControl("Focus", "Personal", Modifier.weight(1f))
                    SimulationQuickControl("Rotate", "Auto", Modifier.weight(1f))
                }
            }

            item {
                GlassPanel(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    Column {
                        SimulationSlider(
                            label = "Brightness",
                            value = brightness,
                            onValueChange = { brightness = it },
                        )
                        SimulationSlider(
                            label = "Volume",
                            value = volume,
                            onValueChange = { volume = it },
                        )
                    }
                }
            }

            item {
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
                            color = Color.White.copy(alpha = 0.58f),
                            fontSize = 12.sp,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                            Text("Previous", color = Color.White, fontSize = 12.sp)
                            Text("Pause", color = Color.White, fontSize = 12.sp)
                            Text("Next", color = Color.White, fontSize = 12.sp)
                        }
                    }
                }
            }

            item {
                Text(
                    text = "Notifications",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            item {
                SimulationNotificationGroup(
                    app = "Messages",
                    count = 2,
                    firstTitle = "Soumyajit",
                    firstText = "The new launcher build looks ready to test.",
                    secondTitle = "Design",
                    secondText = "Glass widget pass is complete.",
                )
            }

            item {
                SimulationNotificationGroup(
                    app = "Calendar",
                    count = 1,
                    firstTitle = "Product review",
                    firstText = "Velora preview · 4:30 PM",
                )
            }

            item {
                Text(
                    text = "Close Control Center",
                    color = Color.White.copy(alpha = 0.68f),
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
private fun SimulationQuickControl(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    GlassPanel(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Column {
            Text(
                text = title,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = value,
                color = Color.White.copy(alpha = 0.55f),
                fontSize = 10.sp,
            )
        }
    }
}

@Composable
private fun SimulationSlider(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
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
                text = ((value * 100).toInt()).toString() + "%",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 11.sp,
            )
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
        )
    }
}

@Composable
private fun SimulationNotificationGroup(
    app: String,
    count: Int,
    firstTitle: String,
    firstText: String,
    secondTitle: String? = null,
    secondText: String? = null,
) {
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
                    text = app,
                    color = Color.White.copy(alpha = 0.60f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (count > 1) {
                    Text(
                        text = count.toString(),
                        color = Color.White.copy(alpha = 0.48f),
                        fontSize = 11.sp,
                    )
                }
            }
            Spacer(Modifier.height(7.dp))
            SimulationNotificationRow(firstTitle, firstText)
            if (secondTitle != null && secondText != null) {
                Spacer(Modifier.height(10.dp))
                SimulationNotificationRow(secondTitle, secondText)
            }
        }
    }
}

@Composable
private fun SimulationNotificationRow(
    title: String,
    text: String,
) {
    Column {
        Text(
            text = title,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = text,
            color = Color.White.copy(alpha = 0.68f),
            fontSize = 12.sp,
            maxLines = 2,
        )
    }
}
