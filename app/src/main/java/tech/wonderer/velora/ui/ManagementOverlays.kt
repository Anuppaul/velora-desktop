package tech.wonderer.velora.ui

import android.app.role.RoleManager
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import tech.wonderer.velora.BuildConfig
import tech.wonderer.velora.data.InstalledApp
import tech.wonderer.velora.ui.components.GlassPanel
import tech.wonderer.velora.ui.components.LiquidGlassPanel

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
    val notificationIntegration =
        BuildConfig.NOTIFICATION_INTEGRATION || BuildConfig.DEV_ADVANCED_INTEGRATIONS
    val advancedNavigation = BuildConfig.DEV_ADVANCED_INTEGRATIONS

    val steps = remember(notificationIntegration, advancedNavigation) {
        buildList {
            add(SetupStage.HOME)
            if (notificationIntegration) add(SetupStage.NOTIFICATIONS)
            if (advancedNavigation) add(SetupStage.ADVANCED_NAVIGATION)
            add(SetupStage.WALLPAPER)
            add(SetupStage.FINISH)
        }
    }

    var stepIndex by remember { mutableIntStateOf(0) }
    var refreshToken by remember { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refreshToken += 1
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val stage = steps[stepIndex.coerceIn(0, steps.lastIndex)]
    val notificationAccess = remember(refreshToken, notificationIntegration) {
        notificationIntegration &&
            NotificationManagerCompat.getEnabledListenerPackages(context)
                .contains(context.packageName)
    }
    val homeSelected = remember(refreshToken) {
        isVeloraHome(context)
    }

    val homeRoleLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) {
        refreshToken += 1
    }

    fun next() {
        if (stepIndex < steps.lastIndex) stepIndex += 1
    }

    fun previous() {
        if (stepIndex > 0) stepIndex -= 1
    }

    LiquidGlassPanel(
        modifier = Modifier
            .fillMaxSize()
            .padding(12.dp),
        shape = RoundedCornerShape(38.dp),
        contentPadding = PaddingValues(24.dp),
        intensity = 0.82f,
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
                text = "Private, contextual setup · " +
                    (stepIndex + 1) + " / " + steps.size,
                color = Color.White.copy(alpha = 0.62f),
                fontSize = 13.sp,
            )
            Spacer(Modifier.height(26.dp))

            when (stage) {
                SetupStage.HOME -> {
                    SetupDisclosure(
                        title = "Make Velora your Home",
                        badge = if (homeSelected) "Selected" else "Required for launcher mode",
                        detail = "Android controls the default Home role. Velora does not silently change it. Choose Velora in Android's native Home selector.",
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                val roleManager = context.getSystemService(RoleManager::class.java)
                                if (
                                    roleManager != null &&
                                    roleManager.isRoleAvailable(RoleManager.ROLE_HOME)
                                ) {
                                    homeRoleLauncher.launch(
                                        roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME),
                                    )
                                } else {
                                    context.startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
                                }
                            } else {
                                context.startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (homeSelected) "Review Home app" else "Choose Velora as Home")
                    }
                    SetupSkipNext(
                        onBack = if (stepIndex > 0) ::previous else null,
                        onSkip = ::next,
                        nextLabel = if (homeSelected) "Continue" else "Continue anyway",
                    )
                }

                SetupStage.NOTIFICATIONS -> {
                    SetupDisclosure(
                        title = "Notification Center",
                        badge = if (notificationAccess) "Enabled" else "Optional",
                        detail = "If you enable Notification Access, Velora can read the app name, notification title/text and tap action needed to render Velora Notifications and active media controls. This processing stays on the device; Velora has no account, analytics or cloud upload.",
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "Android will show its own Notification Access screen. Velora cannot grant this access for you.",
                        color = Color.White.copy(alpha = 0.56f),
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = {
                            context.startActivity(
                                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (notificationAccess) {
                                "Review notification access"
                            } else {
                                "Open notification access"
                            },
                        )
                    }
                    SetupSkipNext(
                        onBack = ::previous,
                        onSkip = ::next,
                        nextLabel = if (notificationAccess) "Continue" else "Not now",
                    )
                }

                SetupStage.ADVANCED_NAVIGATION -> {
                    SetupDisclosure(
                        title = "Developer navigation controls",
                        badge = "Debug / development only",
                        detail = "This development build can use Android Accessibility solely to invoke global Back, Home and Recents. Velora's AccessibilityService ignores accessibility event content. This capability is not declared in the Play release.",
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = {
                            context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Open Accessibility settings")
                    }
                    SetupSkipNext(
                        onBack = ::previous,
                        onSkip = ::next,
                        nextLabel = "Skip / Continue",
                    )
                }

                SetupStage.WALLPAPER -> {
                    SetupDisclosure(
                        title = "Choose wallpaper",
                        badge = "Optional",
                        detail = "Velora derives glass accents from your wallpaper. Wallpaper selection uses Android's native picker and does not require broad storage access.",
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = {
                            context.startActivity(Intent(Intent.ACTION_SET_WALLPAPER))
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Open wallpaper picker")
                    }
                    SetupSkipNext(
                        onBack = ::previous,
                        onSkip = ::next,
                        nextLabel = "Continue",
                    )
                }

                SetupStage.FINISH -> {
                    SetupDisclosure(
                        title = "Setup complete",
                        badge = BuildConfig.DISTRIBUTION_CHANNEL,
                        detail = buildString {
                            append(
                                if (homeSelected) {
                                    "Velora is selected as Home. "
                                } else {
                                    "You can select Velora as Home later. "
                                },
                            )
                            if (notificationIntegration) {
                                append(
                                    if (notificationAccess) {
                                        "Notification Center access is enabled."
                                    } else {
                                        "Notification access remains off until you enable it."
                                    },
                                )
                            } else {
                                append(
                                    "This sideload-safe build does not declare Notification Listener, Accessibility or WRITE_SETTINGS.",
                                )
                            }
                        },
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = onComplete,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Enter Velora")
                    }
                    if (stepIndex > 0) {
                        Text(
                            text = "Back",
                            color = Color.White.copy(alpha = 0.68f),
                            modifier = Modifier
                                .align(Alignment.CenterHorizontally)
                                .clickable(onClick = ::previous)
                                .padding(12.dp),
                        )
                    }
                }
            }
        }
    }
}

private enum class SetupStage {
    HOME,
    NOTIFICATIONS,
    ADVANCED_NAVIGATION,
    WALLPAPER,
    FINISH,
}

@Composable
private fun SetupDisclosure(
    title: String,
    badge: String,
    detail: String,
) {
    GlassPanel(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column {
            Text(
                text = badge.uppercase(),
                color = Color.White.copy(alpha = 0.48f),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = title,
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = detail,
                color = Color.White.copy(alpha = 0.64f),
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun SetupSkipNext(
    onBack: (() -> Unit)?,
    onSkip: () -> Unit,
    nextLabel: String,
) {
    Spacer(Modifier.height(12.dp))
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (onBack != null) {
            Text(
                text = "Back",
                color = Color.White.copy(alpha = 0.62f),
                modifier = Modifier
                    .clickable(onClick = onBack)
                    .padding(12.dp),
            )
        } else {
            Spacer(Modifier.size(1.dp))
        }

        Text(
            text = nextLabel,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clickable(onClick = onSkip)
                .padding(12.dp),
        )
    }
}

private fun isVeloraHome(context: android.content.Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roleManager = context.getSystemService(RoleManager::class.java)
        if (
            roleManager != null &&
            roleManager.isRoleAvailable(RoleManager.ROLE_HOME)
        ) {
            return roleManager.isRoleHeld(RoleManager.ROLE_HOME)
        }
    }

    val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val resolved = context.packageManager.resolveActivity(
        homeIntent,
        android.content.pm.PackageManager.MATCH_DEFAULT_ONLY,
    )
    return resolved?.activityInfo?.packageName == context.packageName
}
