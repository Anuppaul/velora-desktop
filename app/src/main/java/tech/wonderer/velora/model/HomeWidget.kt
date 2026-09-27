package tech.wonderer.velora.model

enum class PremiumWidgetType(val displayName: String) {
    CLOCK("Glass Clock"),
    CALENDAR("Today"),
    BATTERY("Battery"),
    DEVICE("Device"),
}

data class HomeWidget(
    val id: String,
    val type: PremiumWidgetType,
    val x: Float,
    val y: Float,
    val scale: Float = 1f,
    val zIndex: Float = 0f,
)
