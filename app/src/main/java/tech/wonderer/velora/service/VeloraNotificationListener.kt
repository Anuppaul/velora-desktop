package tech.wonderer.velora.service

import android.app.Notification
import android.app.PendingIntent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class VeloraNotification(
    val key: String,
    val packageName: String,
    val appLabel: String,
    val title: String,
    val text: String,
    val postedAt: Long,
    val contentIntent: PendingIntent?,
)

object NotificationRepository {
    private val mutableNotifications = MutableStateFlow<List<VeloraNotification>>(emptyList())
    val notifications: StateFlow<List<VeloraNotification>> = mutableNotifications.asStateFlow()

    internal fun replace(items: List<VeloraNotification>) {
        mutableNotifications.value = items
    }
}

class VeloraNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        refresh()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        refresh()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        refresh()
    }

    override fun onListenerDisconnected() {
        NotificationRepository.replace(emptyList())
        super.onListenerDisconnected()
    }

    private fun refresh() {
        val items = runCatching {
            activeNotifications
                .asSequence()
                .filter { it.packageName != packageName }
                .mapNotNull(::toVeloraNotification)
                .sortedByDescending { it.postedAt }
                .toList()
        }.getOrDefault(emptyList())

        NotificationRepository.replace(items)
    }

    private fun toVeloraNotification(sbn: StatusBarNotification): VeloraNotification? {
        val notification = sbn.notification ?: return null
        val extras = notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return null

        val label = runCatching {
            val info = packageManager.getApplicationInfo(sbn.packageName, 0)
            packageManager.getApplicationLabel(info).toString()
        }.getOrDefault(sbn.packageName)

        return VeloraNotification(
            key = sbn.key,
            packageName = sbn.packageName,
            appLabel = label,
            title = title.ifBlank { label },
            text = text,
            postedAt = sbn.postTime,
            contentIntent = notification.contentIntent,
        )
    }
}
