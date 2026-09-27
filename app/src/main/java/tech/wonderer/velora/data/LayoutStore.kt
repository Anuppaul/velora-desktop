package tech.wonderer.velora.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import tech.wonderer.velora.model.HomeItem
import tech.wonderer.velora.model.HomeItemKind

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

    private companion object {
        const val KEY_LAYOUT = "home_layout_v1"
        const val KEY_GLOBAL_SCALE = "global_icon_scale"
    }
}
