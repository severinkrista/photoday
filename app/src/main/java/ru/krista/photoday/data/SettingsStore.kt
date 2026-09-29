package ru.krista.photoday.data

import android.content.Context

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("photoday_settings", Context.MODE_PRIVATE)

    private val defaultTaskTypes = listOf("У", "Р", "ОК", "Л", "ЗП", "ГК", "КК")

    fun getDaysToShow(): Int = prefs.getInt("days_to_show", 2)

    fun saveDaysToShow(days: Int) {
        prefs.edit().putInt("days_to_show", days).apply()
    }

    fun getTaskTypes(): List<String> {
        val stored = prefs.getStringSet("task_types", null)
        return stored?.toList()?.sortedBy { prefs.getInt("task_type_order_$it", Int.MAX_VALUE) }
            ?.takeIf { it.isNotEmpty() }
            ?: defaultTaskTypes
    }

    fun saveTaskTypes(types: List<String>) {
        val normalized = types.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        val editor = prefs.edit().putStringSet("task_types", normalized.toSet())
        normalized.forEachIndexed { index, type ->
            editor.putInt("task_type_order_$type", index)
        }
        editor.apply()
    }
}