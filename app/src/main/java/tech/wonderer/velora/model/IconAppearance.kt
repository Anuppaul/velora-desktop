package tech.wonderer.velora.model

enum class VeloraIconStyle(val displayName: String) {
    GLASS("Velora Glass"),
    AURORA("Velora Aurora"),
    ORIGINAL("Original"),
}

enum class VeloraIconShape(val displayName: String) {
    SQUIRCLE("Squircle"),
    CIRCLE("Circle"),
    SOFT_SQUARE("Soft Square"),
}

data class IconAppearance(
    val style: VeloraIconStyle = VeloraIconStyle.GLASS,
    val shape: VeloraIconShape = VeloraIconShape.SQUIRCLE,
    val showHomeLabels: Boolean = true,
)
