package tech.wonderer.velora.ui

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.model.VeloraIconShape
import tech.wonderer.velora.model.VeloraIconStyle
import tech.wonderer.velora.ui.components.GlassPanel

@Composable
fun GroupOverlay(
    item: HomeItem,
    labelForPackage: (String) -> String,
    onLaunch: (String) -> Unit,
    onClose: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .padding(top = 150.dp, bottom = 130.dp),
        shape = RoundedCornerShape(32.dp),
        contentPadding = PaddingValues(20.dp),
    ) {
        Column {
            Text(
                text = item.label,
                color = Color.White,
                fontSize = 24.sp,
            )
            Text(
                text = "Tap an app to open",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.size(18.dp))

            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                verticalArrangement = Arrangement.spacedBy(18.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(item.members, key = { it }) { packageName ->
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.clickable {
                            onLaunch(packageName)
                            onClose()
                        },
                    ) {
                        PackageIcon(
                            packageName = packageName,
                            modifier = Modifier.size(62.dp),
                        )
                        Text(
                            text = labelForPackage(packageName),
                            color = Color.White,
                            fontSize = 11.sp,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ItemEditSheet(
    item: HomeItem,
    onScaleChanged: (Float) -> Unit,
    onRemove: () -> Unit,
    onClose: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 104.dp),
        shape = RoundedCornerShape(30.dp),
        contentPadding = PaddingValues(20.dp),
    ) {
        Column {
            Text(
                text = item.label,
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Individual icon size",
                color = Color.White.copy(alpha = 0.60f),
                fontSize = 12.sp,
            )
            Slider(
                value = item.scale,
                onValueChange = onScaleChanged,
                valueRange = 0.6f..1.8f,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onRemove) {
                    Text("Remove from Home")
                }
                Button(onClick = onClose) {
                    Text("Done")
                }
            }
        }
    }
}

@Composable
fun SettingsPanel(
    globalScale: Float,
    iconAppearance: IconAppearance,
    onGlobalScaleChanged: (Float) -> Unit,
    onIconStyleChanged: (VeloraIconStyle) -> Unit,
    onIconShapeChanged: (VeloraIconShape) -> Unit,
    onHomeLabelsChanged: (Boolean) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current

    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 70.dp),
        shape = RoundedCornerShape(32.dp),
        contentPadding = PaddingValues(20.dp),
    ) {
        Column {
            Text(
                text = "Velora Settings",
                color = Color.White,
                fontSize = 26.sp,
            )
            Text(
                text = "Appearance",
                color = Color.White.copy(alpha = 0.55f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.size(10.dp))

            Text(
                text = "Global icon size",
                color = Color.White,
            )
            Slider(
                value = globalScale,
                onValueChange = onGlobalScaleChanged,
                valueRange = 0.72f..1.35f,
            )

            SettingValueButton(
                label = "Icon pack",
                value = iconAppearance.style.displayName,
            ) {
                onIconStyleChanged(nextIconStyle(iconAppearance.style))
            }
            SettingValueButton(
                label = "Icon shape",
                value = iconAppearance.shape.displayName,
            ) {
                onIconShapeChanged(nextIconShape(iconAppearance.shape))
            }
            SettingValueButton(
                label = "Home labels",
                value = if (iconAppearance.showHomeLabels) "On" else "Off",
            ) {
                onHomeLabelsChanged(!iconAppearance.showHomeLabels)
            }

            Spacer(Modifier.size(8.dp))
            SettingButton("Choose default Home app") {
                context.startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
            }
            SettingButton("Notification access") {
                context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            SettingButton("Enable Velora navigation controls") {
                context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
            Spacer(Modifier.size(8.dp))
            SettingButton("Close") { onClose() }
        }
    }
}

@Composable
private fun SettingValueButton(
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
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = label,
                color = Color.White,
            )
            Text(
                text = value,
                color = Color.White.copy(alpha = 0.62f),
            )
        }
    }
}

@Composable
private fun SettingButton(
    label: String,
    onClick: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Text(
            text = label,
            color = Color.White,
        )
    }
}

private fun nextIconStyle(current: VeloraIconStyle): VeloraIconStyle = when (current) {
    VeloraIconStyle.GLASS -> VeloraIconStyle.AURORA
    VeloraIconStyle.AURORA -> VeloraIconStyle.ORIGINAL
    VeloraIconStyle.ORIGINAL -> VeloraIconStyle.GLASS
}

private fun nextIconShape(current: VeloraIconShape): VeloraIconShape = when (current) {
    VeloraIconShape.SQUIRCLE -> VeloraIconShape.CIRCLE
    VeloraIconShape.CIRCLE -> VeloraIconShape.SOFT_SQUARE
    VeloraIconShape.SOFT_SQUARE -> VeloraIconShape.SQUIRCLE
}
