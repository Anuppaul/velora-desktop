package tech.wonderer.velora.ui

import android.content.Intent
import android.provider.Settings
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
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.ui.components.GlassPanel

@Composable
fun HiddenAppsPanel(
    apps: List<InstalledApp>,
    hiddenPackages: Set<String>,
    onToggle: (String, Boolean) -> Unit,
    onClose: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 28.dp, bottom = 82.dp, start = 10.dp, end = 10.dp),
        shape = RoundedCornerShape(34.dp),
        contentPadding = PaddingValues(18.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                text = "Hidden Apps",
                color = Color.White,
                fontSize = 28.sp,
            )
            Text(
                text = "Hidden apps disappear from Apps and Home.",
                color = Color.White.copy(alpha = 0.58f),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(14.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
            ) {
                items(apps, key = { it.packageName }) { app ->
                    val hidden = app.packageName in hiddenPackages
                    GlassPanel(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onToggle(app.packageName, !hidden)
                            },
                        shape = RoundedCornerShape(20.dp),
                        contentPadding = PaddingValues(12.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            PackageIcon(
                                packageName = app.packageName,
                                modifier = Modifier.size(44.dp),
                            )
                            Column(Modifier.weight(1f)) {
                                Text(
                                    text = app.label,
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    text = app.packageName,
                                    color = Color.White.copy(alpha = 0.42f),
                                    fontSize = 10.sp,
                                    maxLines = 1,
                                )
                            }
                            Text(
                                text = if (hidden) "Hidden" else "Visible",
                                color = if (hidden) {
                                    Color.White.copy(alpha = 0.58f)
                                } else {
                                    Color.White
                                },
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }

            Button(
                onClick = onClose,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Done")
            }
        }
    }
}

@Composable
fun FirstRunSetup(
    onComplete: () -> Unit,
) {
    val context = LocalContext.current

    GlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(12.dp),
        shape = RoundedCornerShape(38.dp),
        contentPadding = PaddingValues(24.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxSize(),
        ) {
            Text(
                text = "Velora",
                color = Color.White,
                fontSize = 42.sp,
                fontWeight = FontWeight.Light,
            )
            Text(
                text = "Your freeform glass home.",
                color = Color.White.copy(alpha = 0.68f),
                fontSize = 16.sp,
            )
            Spacer(Modifier.height(28.dp))

            SetupStep(
                title = "1 · Make Velora your Home",
                detail = "Required for the full launcher experience.",
            ) {
                context.startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
            }
            SetupStep(
                title = "2 · Notification access",
                detail = "Optional. Powers the Velora Control Center.",
            ) {
                context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            SetupStep(
                title = "3 · Navigation controls",
                detail = "Optional. Enables global Back and Recents from Velora's glass nav.",
            ) {
                context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
            SetupStep(
                title = "4 · Choose wallpaper",
                detail = "Velora automatically derives its glass tint from the wallpaper.",
            ) {
                context.startActivity(Intent(Intent.ACTION_SET_WALLPAPER))
            }

            Spacer(Modifier.height(22.dp))
            Button(
                onClick = onComplete,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Enter Velora")
            }
        }
    }
}

@Composable
private fun SetupStep(
    title: String,
    detail: String,
    onClick: () -> Unit,
) {
    GlassPanel(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(14.dp),
    ) {
        Column {
            Text(
                text = title,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = detail,
                color = Color.White.copy(alpha = 0.58f),
                fontSize = 12.sp,
            )
        }
    }
}
