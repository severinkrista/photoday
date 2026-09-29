package ru.krista.photoday.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class TaskTypeDefinition(
    val code: String,
    val description: String
)

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("photoday_settings", Context.MODE_PRIVATE)

    private val defaultTaskTypes = listOf(
        TaskTypeDefinition("У", "управленческие задачи"),
        TaskTypeDefinition("Р", "рутина, рядовые рабочие задачи"),
        TaskTypeDefinition("ОК", "задачи касающиеся всей компании в целом, не только моим департаментом"),
        TaskTypeDefinition("Л", "личные задачи, не касающиеся рабочих вопросов"),
        TaskTypeDefinition("ЗП", "задачи, связанные с зарплатой или премией моих сотрудников"),
        TaskTypeDefinition("ГК", "задачи, связанные с государственными конктрактами"),
        TaskTypeDefinition("КК", "задачи КристаКоманды (тренинги в нашей компании, выездные мероприятия и т.п.)")
    )

    fun getDaysToShow(): Int = prefs.getInt("days_to_show", 2)

    fun saveDaysToShow(days: Int) {
        prefs.edit().putInt("days_to_show", days).apply()
    }

    fun getTaskTypes(): List<String> = getTaskTypeDefinitions().map { it.code }

    fun getTaskTypeDefinitions(): List<TaskTypeDefinition> {
        val raw = prefs.getString("task_type_definitions", null) ?: return defaultTaskTypes
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val item = array.optJSONObject(i) ?: continue
                    val code = item.optString("code").trim()
                    if (code.isNotEmpty()) {
                        add(TaskTypeDefinition(code, item.optString("description").trim()))
                    }
                }
            }.distinctBy { it.code }.takeIf { it.isNotEmpty() } ?: defaultTaskTypes
        }.getOrDefault(defaultTaskTypes)
    }

    fun saveTaskTypeDefinitions(types: List<TaskTypeDefinition>) {
        val normalized = types.map {
            TaskTypeDefinition(it.code.trim(), it.description.trim())
        }.filter { it.code.isNotEmpty() }.distinctBy { it.code }
        val array = JSONArray()
        normalized.forEach {
            array.put(JSONObject().put("code", it.code).put("description", it.description))
        }
        prefs.edit()
            .putString("task_type_definitions", array.toString())
            .putStringSet("task_types", normalized.map { it.code }.toSet())
            .apply()
    }

    fun saveTaskTypes(types: List<String>) {
        val existing = getTaskTypeDefinitions().associateBy { it.code }
        saveTaskTypeDefinitions(types.map { code ->
            TaskTypeDefinition(code, existing[code]?.description.orEmpty())
        })
    }
}