package tech.wonderer.velora.model

enum class NavIconSlot {
    RECENTS,
    HOME,
    BACK,
}

data class NavIconConfig(
    val recentsUri: String? = null,
    val homeUri: String? = null,
    val backUri: String? = null,
) {
    fun uriFor(slot: NavIconSlot): String? = when (slot) {
        NavIconSlot.RECENTS -> recentsUri
        NavIconSlot.HOME -> homeUri
        NavIconSlot.BACK -> backUri
    }

    fun withUri(slot: NavIconSlot, uri: String?): NavIconConfig = when (slot) {
        NavIconSlot.RECENTS -> copy(recentsUri = uri)
        NavIconSlot.HOME -> copy(homeUri = uri)
        NavIconSlot.BACK -> copy(backUri = uri)
    }
}
