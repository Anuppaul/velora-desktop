package tech.wonderer.velora.service

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class VeloraAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        VeloraNavActions.service = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (VeloraNavActions.service === this) {
            VeloraNavActions.service = null
        }
        super.onDestroy()
    }
}

object VeloraNavActions {
    @Volatile
    internal var service: VeloraAccessibilityService? = null

    fun back(): Boolean =
        service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK) == true

    fun home(): Boolean =
        service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME) == true

    fun recents(): Boolean =
        service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS) == true

    fun isEnabled(): Boolean = service != null
}
