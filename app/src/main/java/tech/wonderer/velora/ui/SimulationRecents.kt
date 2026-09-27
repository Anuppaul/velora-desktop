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
import tech.wonderer.velora.ui.components.LiquidGlassPanel

@Composable
fun SimulationRecentsPanel(
    recentPackages: List<String>,
    labelForPackage: (String) -> String,
    onOpen: (String) -> Unit,
    onClose: () -> Unit,
) {
    LiquidGlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 34.dp, bottom = 86.dp, start = 12.dp, end = 12.dp),
        shape = RoundedCornerShape(34.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                text = "Recents",
                color = Color.White,
                fontSize = 29.sp,
                fontWeight = FontWeight.Light,
            )
            Text(
                text = "Simulation Mode",
                color = Color.White.copy(alpha = 0.52f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(16.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.weight(1f),
            ) {
                items(recentPackages, key = { it }) { packageName ->
                    LiquidGlassPanel(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpen(packageName) },
                        shape = RoundedCornerShape(26.dp),
                        contentPadding = PaddingValues(16.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            PackageIcon(
                                packageName = packageName,
                                modifier = Modifier.size(54.dp),
                            )
                            Column {
                                Text(
                                    text = labelForPackage(packageName),
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 17.sp,
                                )
                                Text(
                                    text = "Tap to return",
                                    color = Color.White.copy(alpha = 0.50f),
                                    fontSize = 11.sp,
                                )
                            }
                        }
                    }
                }
            }

            Text(
                text = "Back closes Recents · Home returns to Velora",
                color = Color.White.copy(alpha = 0.46f),
                fontSize = 11.sp,
                modifier = Modifier.clickable(onClick = onClose),
            )
        }
    }
}
