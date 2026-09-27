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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.wonderer.velora.ui.components.LiquidGlassPanel
import tech.wonderer.velora.ui.components.SwipeDismissDirection
import tech.wonderer.velora.ui.components.SwipeDismissSurface

@Composable
fun SimulationNotificationCenter(
    onClose: () -> Unit,
) {
    SwipeDismissSurface(
        direction = SwipeDismissDirection.UP,
        onDismiss = onClose,
    ) {
        LiquidGlassPanel(
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
                            text = "Notifications",
                            color = Color.White,
                            fontSize = 30.sp,
                            fontWeight = FontWeight.Light,
                        )
                        Text(
                            text = "Sunday · 27 September",
                            color = Color.White.copy(alpha = 0.58f),
                            fontSize = 12.sp,
                        )
                    }
                    Text(
                        text = "Clear all",
                        color = Color.White.copy(alpha = 0.64f),
                        fontSize = 12.sp,
                    )
                }
            }

            item {
                SimNotificationCard(
                    app = "Messages",
                    title = "Soumyajit",
                    text = "The new launcher build is ready for the next visual pass.",
                    time = "now",
                )
            }
            item {
                SimNotificationCard(
                    app = "Mail",
                    title = "Design review",
                    text = "Velora glass surfaces and widgets were updated.",
                    time = "8m",
                )
            }
            item {
                SimNotificationCard(
                    app = "Calendar",
                    title = "Product review",
                    text = "Velora preview · 4:30 PM",
                    time = "25m",
                )
            }
            item {
                SimNotificationCard(
                    app = "Tasks",
                    title = "Today",
                    text = "Test Home gestures, notifications and Control Center.",
                    time = "1h",
                )
            }

        }
    }
    }
}

@Composable
private fun SimNotificationCard(
    app: String,
    title: String,
    text: String,
    time: String,
) {
    LiquidGlassPanel(
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
                    color = Color.White.copy(alpha = 0.56f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = time,
                    color = Color.White.copy(alpha = 0.42f),
                    fontSize = 10.sp,
                )
            }
            Spacer(Modifier.height(5.dp))
            Text(
                text = title,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = text,
                color = Color.White.copy(alpha = 0.68f),
                fontSize = 12.sp,
                maxLines = 3,
            )
        }
    }
}
