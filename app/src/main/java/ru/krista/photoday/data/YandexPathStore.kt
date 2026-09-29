package ru.krista.photoday.data

import android.content.Context
import ru.krista.photoday.YandexConfig

class YandexPathStore(context: Context) {
    private val prefs = context.getSharedPreferences("photoday_settings", Context.MODE_PRIVATE)

    fun getPath(): String =
        prefs.getString("disk_path", null) ?: YandexConfig.DISK_PATH

    fun savePath(path: String) {
        prefs.edit().putString("disk_path", path).apply()
    }
}
