package tech.wonderer.velora.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.ui.components.GlassPanel

@Composable
fun AppDrawer(
    apps: List<InstalledApp>,
    onLaunch: (String) -> Unit,
    onPin: (InstalledApp) -> Unit,
    onClose: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(apps, query) {
        if (query.isBlank()) apps
        else apps.filter {
            it.label.contains(query, ignoreCase = true) ||
                it.packageName.contains(query, ignoreCase = true)
        }
    }

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
                text = "Tap to open • Hold to pin on the freeform home",
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
                        onPin = {
                            onPin(app)
                            onClose()
                        },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DrawerApp(
    app: InstalledApp,
    onLaunch: () -> Unit,
    onPin: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.combinedClickable(
            onClick = onLaunch,
            onLongClick = onPin,
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
    }
}
