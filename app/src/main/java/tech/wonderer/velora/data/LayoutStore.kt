package tech.wonderer.velora.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.HomeWidget
import tech.wonderer.velora.model.HostedWidget
import tech.wonderer.velora.model.IconAppearance
import tech.wonderer.velora.model.PremiumWidgetType
import tech.wonderer.velora.model.VeloraIconShape
import tech.wonderer.velora.model.VeloraIconStyle

class LayoutStore(context: Context) {
    private val prefs = context.getSharedPreferences("velora_layout", Context.MODE_PRIVATE)

    fun loadHomeItems(): List<HomeItem> {
        val raw = prefs.getString(KEY_LAYOUT, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.getJSONObject(index)
                    val membersJson = obj.optJSONArray("members") ?: JSONArray()
                    val members = buildList {
                        for (memberIndex in 0 until membersJson.length()) {
                            add(membersJson.getString(memberIndex))
                        }
                    }
                    add(
                        HomeItem(
                            id = obj.getString("id"),
                            kind = HomeItemKind.valueOf(obj.getString("kind")),
                            label = obj.optString("label", "App"),
                            packageName = obj.optString("packageName").takeIf { it.isNotBlank() },
                            members = members,
                            x = obj.optDouble("x", 0.1).toFloat(),
                            y = obj.optDouble("y", 0.2).toFloat(),
                            scale = obj.optDouble("scale", 1.0).toFloat(),
                            zIndex = obj.optDouble("zIndex", index.toDouble()).toFloat(),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun saveHomeItems(items: List<HomeItem>) {
        val array = JSONArray()
        items.forEach { item ->
            array.put(
                JSONObject().apply {
                    put("id", item.id)
                    put("kind", item.kind.name)
                    put("label", item.label)
                    put("packageName", item.packageName ?: "")
                    put("x", item.x)
                    put("y", item.y)
                    put("scale", item.scale)
                    put("zIndex", item.zIndex)
                    put("members", JSONArray(item.members))
                },
            )
        }
        prefs.edit().putString(KEY_LAYOUT, array.toString()).apply()
    }

    fun hasWidgetLayout(): Boolean = prefs.contains(KEY_WIDGETS)

    fun loadHomeWidgets(): List<HomeWidget> {
        val raw = prefs.getString(KEY_WIDGETS, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.getJSONObject(index)
                    add(
                        HomeWidget(
                            id = obj.getString("id"),
                            type = PremiumWidgetType.valueOf(obj.getString("type")),
                            x = obj.optDouble("x", 0.08).toFloat(),
                            y = obj.optDouble("y", 0.10).toFloat(),
                            scale = obj.optDouble("scale", 1.0).toFloat(),
                            zIndex = obj.optDouble("zIndex", index.toDouble()).toFloat(),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun saveHomeWidgets(widgets: List<HomeWidget>) {
        val array = JSONArray()
        widgets.forEach { widget ->
            array.put(
                JSONObject().apply {
                    put("id", widget.id)
                    put("type", widget.type.name)
                    put("x", widget.x)
                    put("y", widget.y)
                    put("scale", widget.scale)
                    put("zIndex", widget.zIndex)
                },
            )
        }
        prefs.edit().putString(KEY_WIDGETS, array.toString()).apply()
    }

    fun loadHostedWidgets(): List<HostedWidget> {
        val raw = prefs.getString(KEY_HOSTED_WIDGETS, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.getJSONObject(index)
                    add(
                        HostedWidget(
                            id = obj.getString("id"),
                            appWidgetId = obj.getInt("appWidgetId"),
                            provider = obj.getString("provider"),
                            label = obj.optString("label", "Android Widget"),
                            x = obj.optDouble("x", 0.10).toFloat(),
                            y = obj.optDouble("y", 0.16).toFloat(),
                            widthDp = obj.optDouble("widthDp", 220.0).toFloat(),
                            heightDp = obj.optDouble("heightDp", 140.0).toFloat(),
                            scale = obj.optDouble("scale", 1.0).toFloat(),
                            zIndex = obj.optDouble("zIndex", index.toDouble()).toFloat(),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun saveHostedWidgets(widgets: List<HostedWidget>) {
        val array = JSONArray()
        widgets.forEach { widget ->
            array.put(
                JSONObject().apply {
                    put("id", widget.id)
                    put("appWidgetId", widget.appWidgetId)
                    put("provider", widget.provider)
                    put("label", widget.label)
                    put("x", widget.x)
                    put("y", widget.y)
                    put("widthDp", widget.widthDp)
                    put("heightDp", widget.heightDp)
                    put("scale", widget.scale)
                    put("zIndex", widget.zIndex)
                },
            )
        }
        prefs.edit().putString(KEY_HOSTED_WIDGETS, array.toString()).apply()
    }

    fun loadGlobalIconScale(): Float = prefs.getFloat(KEY_GLOBAL_SCALE, 1f)

    fun saveGlobalIconScale(scale: Float) {
        prefs.edit().putFloat(KEY_GLOBAL_SCALE, scale).apply()
    }

    fun loadWallpaperBlur(): Float =
        prefs.getFloat(KEY_WALLPAPER_BLUR, 0.42f).coerceIn(0f, 1f)

    fun saveWallpaperBlur(value: Float) {
        prefs.edit()
            .putFloat(KEY_WALLPAPER_BLUR, value.coerceIn(0f, 1f))
            .apply()
    }

    fun loadIconAppearance(): IconAppearance {
        val style = runCatching {
            VeloraIconStyle.valueOf(
                prefs.getString(KEY_ICON_STYLE, VeloraIconStyle.GLASS.name)
                    ?: VeloraIconStyle.GLASS.name,
            )
        }.getOrDefault(VeloraIconStyle.GLASS)

        val shape = runCatching {
            VeloraIconShape.valueOf(
                prefs.getString(KEY_ICON_SHAPE, VeloraIconShape.SQUIRCLE.name)
                    ?: VeloraIconShape.SQUIRCLE.name,
            )
        }.getOrDefault(VeloraIconShape.SQUIRCLE)

        return IconAppearance(
            style = style,
            shape = shape,
            showHomeLabels = prefs.getBoolean(KEY_HOME_LABELS, true),
        )
    }

    fun saveIconAppearance(appearance: IconAppearance) {
        prefs.edit()
            .putString(KEY_ICON_STYLE, appearance.style.name)
            .putString(KEY_ICON_SHAPE, appearance.shape.name)
            .putBoolean(KEY_HOME_LABELS, appearance.showHomeLabels)
            .apply()
    }

    fun loadHiddenPackages(): Set<String> =
        prefs.getStringSet(KEY_HIDDEN_PACKAGES, emptySet())?.toSet().orEmpty()

    fun saveHiddenPackages(packages: Set<String>) {
        prefs.edit().putStringSet(KEY_HIDDEN_PACKAGES, packages).apply()
    }

    fun isOnboardingComplete(): Boolean = prefs.getBoolean(KEY_ONBOARDING_COMPLETE, false)

    fun setOnboardingComplete(complete: Boolean) {
        prefs.edit().putBoolean(KEY_ONBOARDING_COMPLETE, complete).apply()
    }

    private companion object {
        const val KEY_LAYOUT = "home_layout_v1"
        const val KEY_WIDGETS = "home_widgets_v1"
        const val KEY_HOSTED_WIDGETS = "hosted_widgets_v1"
        const val KEY_GLOBAL_SCALE = "global_icon_scale"
        const val KEY_WALLPAPER_BLUR = "wallpaper_blur"
        const val KEY_ICON_STYLE = "icon_style"
        const val KEY_ICON_SHAPE = "icon_shape"
        const val KEY_HOME_LABELS = "home_labels"
        const val KEY_HIDDEN_PACKAGES = "hidden_packages"
        const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"
    }
}
