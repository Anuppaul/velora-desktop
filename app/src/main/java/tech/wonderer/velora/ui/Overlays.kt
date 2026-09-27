package tech.wonderer.velora.ui

import android.content.Intent
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.model.PremiumWidgetType
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
                gridItems(item.members, key = { it }) { packageName ->
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
    onRenameGroup: (String) -> Unit,
    onUngroup: () -> Unit,
    onRemove: () -> Unit,
    onClose: () -> Unit,
) {
    var groupName by remember(item.id) { mutableStateOf(item.label) }

    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 88.dp),
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

            if (item.kind == HomeItemKind.GROUP) {
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = groupName,
                    onValueChange = { groupName = it.take(24) },
                    label = { Text("Group name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(6.dp))
                Button(
                    onClick = {
                        onRenameGroup(groupName)
                        onClose()
                    },
                ) {
                    Text("Rename")
                }
            }

            Spacer(Modifier.height(10.dp))
            Text(
                text = if (item.kind == HomeItemKind.GROUP) "Group size" else "Individual icon size",
                color = Color.White.copy(alpha = 0.60f),
                fontSize = 12.sp,
            )
            Slider(
                value = item.scale,
                onValueChange = onScaleChanged,
                valueRange = 0.6f..1.8f,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (item.kind == HomeItemKind.GROUP) {
                    Button(onClick = onUngroup) {
                        Text("Ungroup")
                    }
                }
                Button(onClick = onRemove) {
                    Text("Remove")
                }
                Button(onClick = onClose) {
                    Text("Done")
                }
            }
        }
    }
}

@Composable
fun WidgetEditSheet(
    widget: HomeWidget,
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
                text = widget.type.displayName,
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Widget size",
                color = Color.White.copy(alpha = 0.60f),
                fontSize = 12.sp,
            )
            Slider(
                value = widget.scale,
                onValueChange = onScaleChanged,
                valueRange = 0.72f..1.45f,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onRemove) {
                    Text("Remove")
                }
                Button(onClick = onClose) {
                    Text("Done")
                }
            }
        }
    }
}

@Composable
fun WidgetPicker(
    onAdd: (PremiumWidgetType) -> Unit,
    onClose: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 86.dp),
        shape = RoundedCornerShape(32.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column {
            Text(
                text = "Velora Widgets",
                color = Color.White,
                fontSize = 26.sp,
            )
            Text(
                text = "Native, lightweight and freeform",
                color = Color.White.copy(alpha = 0.56f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(14.dp))
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(PremiumWidgetType.entries) { type ->
                    GlassPanel(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(126.dp)
                            .clickable {
                                onAdd(type)
                                onClose()
                            },
                        shape = RoundedCornerShape(26.dp),
                        contentPadding = PaddingValues(12.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            PremiumWidgetPreview(
                                type = type,
                                modifier = Modifier.size(154.dp, 92.dp),
                            )
                            Text(
                                text = type.displayName,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsPanel(
    globalScale: Float,
    iconAppearance: IconAppearance,
    backupJson: () -> String,
    restoreBackup: (String) -> Boolean,
    onGlobalScaleChanged: (Float) -> Unit,
    onIconStyleChanged: (VeloraIconStyle) -> Unit,
    onIconShapeChanged: (VeloraIconShape) -> Unit,
    onHomeLabelsChanged: (Boolean) -> Unit,
    onAddWidget: () -> Unit,
    onManageHiddenApps: () -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current

    val exportLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri != null) {
            val ok = runCatching {
                context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use {
                    it.write(backupJson())
                } ?: error("Unable to open destination")
            }.isSuccess
            Toast.makeText(
                context,
                if (ok) "Velora backup saved" else "Backup failed",
                Toast.LENGTH_SHORT,
            ).show()
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            val raw = runCatching {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            }.getOrNull()
            val ok = raw?.let(restoreBackup) == true
            Toast.makeText(
                context,
                if (ok) "Velora layout restored" else "Invalid Velora backup",
                Toast.LENGTH_SHORT,
            ).show()
        }
    }

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
                    text = "Appearance & Home",
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
                SettingButton("Add premium widget", onAddWidget)
                SettingButton("Manage hidden apps", onManageHiddenApps)
                SettingButton("Choose wallpaper") {
                    context.startActivity(Intent(Intent.ACTION_SET_WALLPAPER))
                }

                Spacer(Modifier.size(8.dp))
                Text(
                    text = "Backup",
                    color = Color.White.copy(alpha = 0.55f),
                    fontSize = 12.sp,
                )
                SettingButton("Export Velora layout") {
                    exportLauncher.launch("velora-layout.json")
                }
                SettingButton("Restore Velora layout") {
                    importLauncher.launch(arrayOf("application/json", "text/plain"))
                }

                Spacer(Modifier.size(8.dp))
                Text(
                    text = "System integration",
                    color = Color.White.copy(alpha = 0.55f),
                    fontSize = 12.sp,
                )
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
                SettingButton("Close", onClose)
            }
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
