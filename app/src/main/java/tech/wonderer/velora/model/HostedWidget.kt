package tech.wonderer.velora.model

data class HostedWidget(
    val id: String,
    val appWidgetId: Int,
    val provider: String,
    val label: String,
    val x: Float,
    val y: Float,
    val widthDp: Float = 220f,
    val heightDp: Float = 140f,
    val scale: Float = 1f,
    val zIndex: Float = 0f,
    val page: Int = 0,
)
