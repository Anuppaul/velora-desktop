package tech.wonderer.velora.data

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent

class AndroidWidgetHostController(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val packageManager = appContext.packageManager

    val manager: AppWidgetManager = AppWidgetManager.getInstance(appContext)
    val host: AppWidgetHost = AppWidgetHost(appContext, HOST_ID)

    fun startListening() {
        runCatching { host.startListening() }
    }

    fun stopListening() {
        runCatching { host.stopListening() }
    }

    fun providers(): List<AppWidgetProviderInfo> =
        runCatching { manager.installedProviders.orEmpty() }
            .getOrDefault(emptyList())
            .sortedBy { widgetLabel(it).lowercase() }

    fun allocateId(): Int = host.allocateAppWidgetId()

    fun hostedIds(): Set<Int> =
        runCatching { host.appWidgetIds.toSet() }.getOrDefault(emptySet())

    fun deleteId(appWidgetId: Int) {
        runCatching { host.deleteAppWidgetId(appWidgetId) }
    }

    fun bindIfAllowed(
        appWidgetId: Int,
        provider: ComponentName,
    ): Boolean = runCatching {
        manager.bindAppWidgetIdIfAllowed(appWidgetId, provider)
    }.getOrDefault(false)

    fun info(appWidgetId: Int): AppWidgetProviderInfo? =
        runCatching { manager.getAppWidgetInfo(appWidgetId) }.getOrNull()

    fun widgetLabel(info: AppWidgetProviderInfo): String =
        runCatching { info.loadLabel(packageManager)?.toString().orEmpty() }
            .getOrDefault("")
            .ifBlank { info.provider.className.substringAfterLast('.') }

    fun appLabel(info: AppWidgetProviderInfo): String =
        runCatching {
            val applicationInfo = packageManager.getApplicationInfo(info.provider.packageName, 0)
            packageManager.getApplicationLabel(applicationInfo).toString()
        }.getOrDefault(info.provider.packageName)

    fun suggestedSize(info: AppWidgetProviderInfo): Pair<Float, Float> {
        val density = appContext.resources.displayMetrics.density.coerceAtLeast(1f)
        val width = if (info.minWidth > 0) info.minWidth / density else 220f
        val height = if (info.minHeight > 0) info.minHeight / density else 140f
        return width.coerceIn(140f, 320f) to height.coerceIn(90f, 260f)
    }

    fun createView(
        context: Context,
        appWidgetId: Int,
    ): AppWidgetHostView? {
        val info = info(appWidgetId) ?: return null
        return runCatching {
            host.createView(context, appWidgetId, info).apply {
                setAppWidget(appWidgetId, info)
            }
        }.getOrNull()
    }

    fun bindIntent(
        appWidgetId: Int,
        provider: ComponentName,
    ): Intent = Intent(AppWidgetManager.ACTION_APPWIDGET_BIND).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, provider)
    }

    fun configureIntent(
        appWidgetId: Int,
        info: AppWidgetProviderInfo,
    ): Intent? {
        val configure = info.configure ?: return null
        return Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE).apply {
            component = configure
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        }
    }

    companion object {
        private const val HOST_ID = 0x56454C
    }
}
