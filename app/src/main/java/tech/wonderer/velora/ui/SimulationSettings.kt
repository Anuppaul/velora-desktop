package tech.wonderer.velora.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.model.HomeTransitionMode
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.ui.components.GlassPanel

@Composable
fun GlassSimulationSettings(
    globalScale: Float,
    wallpaperBlur: Float,
    transitionMode: HomeTransitionMode,
    transitionSoftness: Float,
    appearance: IconAppearance,
    onScale: (Float) -> Unit,
    onWallpaperBlur: (Float) -> Unit,
    onTransitionMode: () -> Unit,
    onTransitionSoftness: (Float) -> Unit,
    onStyle: () -> Unit,
    onShape: () -> Unit,
    onLabels: () -> Unit,
    onWidgets: () -> Unit,
    onClose: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 44.dp),
        shape = RoundedCornerShape(32.dp),
        contentPadding = PaddingValues(20.dp),
    ) {
        LazyColumn {
            item {
                Text(
                    text = "Velora Settings",
                    color = Color.White,
                    fontSize = 26.sp,
                )
                Text(
                    text = "Simulation Mode · changes are temporary",
                    color = Color.White.copy(alpha = 0.54f),
                    fontSize = 12.sp,
                )
                Spacer(Modifier.size(12.dp))

                Text(
                    text = "Global icon size",
                    color = Color.White,
                )
                Slider(
                    value = globalScale,
                    onValueChange = onScale,
                    valueRange = 0.72f..1.35f,
                )

                Text(
                    text = "Wallpaper blur · " + (wallpaperBlur * 100).toInt() + "%",
                    color = Color.White,
                )
                Slider(
                    value = wallpaperBlur,
                    onValueChange = onWallpaperBlur,
                    valueRange = 0f..1f,
                )

                SimulationSettingRow(
                    label = "Home transition",
                    value = transitionMode.displayName,
                    onClick = onTransitionMode,
                )

                if (transitionMode == HomeTransitionMode.JELLY) {
                    Text(
                        text = "Jelly softness · " + (transitionSoftness * 100).toInt() + "%",
                        color = Color.White,
                    )
                    Slider(
                        value = transitionSoftness,
                        onValueChange = onTransitionSoftness,
                        valueRange = 0f..1f,
                    )
                }

                SimulationSettingRow(
                    label = "Icon pack",
                    value = appearance.style.displayName,
                    onClick = onStyle,
                )
                SimulationSettingRow(
                    label = "Icon shape",
                    value = appearance.shape.displayName,
                    onClick = onShape,
                )
                SimulationSettingRow(
                    label = "Home labels",
                    value = if (appearance.showHomeLabels) "On" else "Off",
                    onClick = onLabels,
                )
                SimulationSettingRow(
                    label = "Premium widgets",
                    value = "Open",
                    onClick = onWidgets,
                )
                SimulationSettingRow(
                    label = "Preview state",
                    value = "Isolated",
                    onClick = {},
                )
                SimulationSettingRow(
                    label = "Close",
                    value = "",
                    onClick = onClose,
                )
            }
        }
    }
}

@Composable
private fun SimulationSettingRow(
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 13.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = label,
                color = Color.White,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = value,
                color = Color.White.copy(alpha = 0.58f),
            )
        }
    }
}
