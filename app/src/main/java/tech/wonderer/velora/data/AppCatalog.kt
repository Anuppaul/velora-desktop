package tech.wonderer.velora.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.util.LruCache
import androidx.core.graphics.drawable.toBitmap

data class InstalledApp(
    val label: String,
    val packageName: String,
)

object AppCatalog {
    private val iconCache = LruCache<String, Bitmap>(96)

    fun loadInstalledApps(context: Context): List<InstalledApp> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, 0)
        }

        return resolved
            .asSequence()
            .map { info ->
                InstalledApp(
                    label = info.loadLabel(pm).toString(),
                    packageName = info.activityInfo.packageName,
                )
            }
            .filter { it.packageName != context.packageName }
            .distinctBy { it.packageName }
            .sortedBy { it.label.lowercase() }
            .toList()
    }

    fun loadIcon(context: Context, packageName: String): Bitmap? {
        iconCache.get(packageName)?.let { return it }
        return runCatching {
            context.packageManager
                .getApplicationIcon(packageName)
                .toBitmap(width = 144, height = 144, config = Bitmap.Config.ARGB_8888)
                .also { iconCache.put(packageName, it) }
        }.getOrNull()
    }

    fun launch(context: Context, packageName: String): Boolean {
        val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return true
    }
}
