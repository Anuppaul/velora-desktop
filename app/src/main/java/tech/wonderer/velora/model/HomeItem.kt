package tech.wonderer.velora.model

enum class HomeItemKind {
    APP,
    GROUP,
}

data class HomeItem(
    val id: String,
    val kind: HomeItemKind,
    val label: String,
    val packageName: String? = null,
    val members: List<String> = emptyList(),
    val x: Float,
    val y: Float,
    val scale: Float = 1f,
    val zIndex: Float = 0f,
)
