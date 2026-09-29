package ru.krista.photoday.data

import android.content.Context

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("photoday_settings", Context.MODE_PRIVATE)

    fun getDaysToShow(): Int = prefs.getInt("days_to_show", 2)

    fun saveDaysToShow(days: Int) {
        prefs.edit().putInt("days_to_show", days).apply()
    }
}
