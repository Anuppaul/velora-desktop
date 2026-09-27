package tech.wonderer.velora.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind
import tech.wonderer.velora.model.IconAppearance
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
                    put("members", JSONArray(item.members))
                },
            )
        }
        prefs.edit().putString(KEY_LAYOUT, array.toString()).apply()
    }

    fun loadGlobalIconScale(): Float = prefs.getFloat(KEY_GLOBAL_SCALE, 1f)

    fun saveGlobalIconScale(scale: Float) {
        prefs.edit().putFloat(KEY_GLOBAL_SCALE, scale).apply()
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

    private companion object {
        const val KEY_LAYOUT = "home_layout_v1"
        const val KEY_GLOBAL_SCALE = "global_icon_scale"
        const val KEY_ICON_STYLE = "icon_style"
        const val KEY_ICON_SHAPE = "icon_shape"
        const val KEY_HOME_LABELS = "home_labels"
    }
}
