package ru.krista.photoday.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import ru.krista.photoday.domain.TaskRecord
import java.time.LocalDate
import java.time.LocalTime

class PendingTaskStore(context: Context) {
    private val prefs = context.getSharedPreferences("photoday_pending_tasks", Context.MODE_PRIVATE)
    private val key = "tasks"

    fun getTasks(): List<TaskRecord> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val o = array.getJSONObject(i)
                    add(
                        TaskRecord(
                            id = o.getString("id"),
                            date = o.optString("date").takeIf { it.isNotBlank() }?.let(LocalDate::parse),
                            time = o.optString("time").takeIf { it.isNotBlank() }?.let(LocalTime::parse),
                            weekday = o.optString("weekday"),
                            partOfDay = o.optString("partOfDay"),
                            taskType = o.optString("taskType"),
                            task = o.optString("task"),
                            difficulty = if (o.has("difficulty")) o.optInt("difficulty") else null
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun add(task: TaskRecord) {
        save(getTasks().filterNot { it.id == task.id } + task)
    }

    fun remove(id: String) {
        save(getTasks().filterNot { it.id == id })
    }

    private fun save(tasks: List<TaskRecord>) {
        val array = JSONArray()
        tasks.forEach { task ->
            array.put(
                JSONObject().apply {
                    put("id", task.id ?: "")
                    put("date", task.date?.toString() ?: "")
                    put("time", task.time?.toString() ?: "")
                    put("weekday", task.weekday)
                    put("partOfDay", task.partOfDay)
                    put("taskType", task.taskType)
                    put("task", task.task)
                    put("difficulty", task.difficulty)
                }
            )
        }
        prefs.edit().putString(key, array.toString()).apply()
    }
}
