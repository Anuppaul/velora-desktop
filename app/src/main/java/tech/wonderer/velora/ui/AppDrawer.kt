package tech.wonderer.velora.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.ModalBackdrop
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface

@Composable
fun AppDrawer(
    apps: List<InstalledApp>,
    onLaunch: (String) -> Unit,
    onPin: (InstalledApp) -> Unit,
    onHide: (InstalledApp) -> Unit,
    onClose: () -> Unit,
    systemActionsEnabled: Boolean = true,
) {
    var query by remember { mutableStateOf("") }
    var selectedApp by remember { mutableStateOf<InstalledApp?>(null) }

    val filtered = remember(apps, query) {
        if (query.isBlank()) {
            apps
        } else {
            apps.filter {
                it.label.contains(query, ignoreCase = true) ||
                    it.packageName.contains(query, ignoreCase = true)
            }
        }
    }

    SwipeDismissSurface(
        direction = SwipeDismissDirection.DOWN,
        onDismiss = onClose,
    ) {
        Box(Modifier.fillMaxSize()) {
            GlassPanel(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 26.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
            shape = RoundedCornerShape(34.dp),
            contentPadding = PaddingValues(18.dp),
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    text = "Apps",
                    color = Color.White,
                    fontSize = 28.sp,
                )
                Text(
                    text = "Tap to open · Hold for app actions",
                    color = Color.White.copy(alpha = 0.58f),
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    placeholder = { Text("Search apps") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))

                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    contentPadding = PaddingValues(bottom = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    items(filtered, key = { it.packageName }) { app ->
                        DrawerApp(
                            app = app,
                            onLaunch = {
                                onLaunch(app.packageName)
                                onClose()
                            },
                            onLongPress = { selectedApp = app },
                            onMenu = { selectedApp = app },
                        )
                    }
                }
            }
        }

        if (selectedApp != null) {
            ModalBackdrop(
                modifier = Modifier.zIndex(50f),
            )
        }

        selectedApp?.let { app ->
            AppActionSheet(
                app = app,
                systemActionsEnabled = systemActionsEnabled,
                onPin = {
                    onPin(app)
                    selectedApp = null
                    onClose()
                },
                onHide = {
                    onHide(app)
                    selectedApp = null
                    onClose()
                },
                onClose = { selectedApp = null },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .zIndex(60f)
                    .padding(horizontal = 16.dp, vertical = 94.dp),
            )
        }
    }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DrawerApp(
    app: InstalledApp,
    onLaunch: () -> Unit,
    onLongPress: () -> Unit,
    onMenu: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.combinedClickable(
            onClick = onLaunch,
            onLongClick = onLongPress,
        ),
    ) {
        PackageIcon(
            packageName = app.packageName,
            modifier = Modifier
                .size(58.dp)
                .clip(RoundedCornerShape(15.dp)),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = app.label,
            color = Color.White,
            fontSize = 11.sp,
            maxLines = 1,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = "⋯",
            color = Color.White.copy(alpha = 0.58f),
            fontSize = 16.sp,
            modifier = Modifier
                .clickable(onClick = onMenu)
                .padding(horizontal = 12.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun AppActionSheet(
    app: InstalledApp,
    systemActionsEnabled: Boolean,
    onPin: () -> Unit,
    onHide: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    GlassPanel(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(30.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                PackageIcon(
                    packageName = app.packageName,
                    modifier = Modifier.size(50.dp),
                )
                Column {
                    Text(
                        text = app.label,
                        color = Color.White,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = app.packageName,
                        color = Color.White.copy(alpha = 0.42f),
                        fontSize = 10.sp,
                        maxLines = 1,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            AppActionRow("Pin to Home", onPin)

            if (systemActionsEnabled) {
                AppActionRow("Hide app", onHide)
                AppActionRow("App info") {
                    runCatching {
                        context.startActivity(
                            Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + app.packageName),
                            ),
                        )
                    }
                    onClose()
                }
                AppActionRow("Uninstall") {
                    runCatching {
                        context.startActivity(
                            Intent(
                                Intent.ACTION_DELETE,
                                Uri.parse("package:" + app.packageName),
                            ),
                        )
                    }
                    onClose()
                }
            }

            AppActionRow("Cancel", onClose)
        }
    }
}

@Composable
private fun AppActionRow(
    label: String,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        color = Color.White,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
    )
}
