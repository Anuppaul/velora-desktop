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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.ui.components.FullPageLiquidGlass
import tech.wonderer.velora.ui.components.LiquidGlassPanel

@Composable
fun LauncherRecentsPanel(
    recentPackages: List<String>,
    labelForPackage: (String) -> String,
    onOpen: (String) -> Unit,
    onClose: () -> Unit,
) {
    FullPageLiquidGlass(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            top = 68.dp,
            bottom = 96.dp,
            start = 18.dp,
            end = 18.dp,
        ),
        intensity = 0.74f,
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                text = "Recents",
                color = Color.White,
                fontSize = 29.sp,
                fontWeight = FontWeight.Light,
            )
            Text(
                text = "Recent Velora apps · frequent apps fill empty history",
                color = Color.White.copy(alpha = 0.54f),
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(16.dp))

            if (recentPackages.isEmpty()) {
                Text(
                    text = "No launchable apps found.",
                    color = Color.White.copy(alpha = 0.62f),
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    items(recentPackages, key = { it }) { packageName ->
                        LiquidGlassPanel(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpen(packageName) },
                            shape = RoundedCornerShape(24.dp),
                            contentPadding = PaddingValues(14.dp),
                            intensity = 0.60f,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                PackageIcon(
                                    packageName = packageName,
                                    modifier = Modifier.size(48.dp),
                                )
                                Column {
                                    Text(
                                        text = labelForPackage(packageName),
                                        color = Color.White,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = "Tap to open",
                                        color = Color.White.copy(alpha = 0.48f),
                                        fontSize = 10.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Text(
                text = "Back closes Recents",
                color = Color.White.copy(alpha = 0.42f),
                fontSize = 10.sp,
                modifier = Modifier.clickable(onClick = onClose),
            )
        }
    }
}
