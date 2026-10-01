package ru.krista.photoday.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import ru.krista.photoday.domain.TaskRecord
import java.time.LocalDate
import java.time.LocalTime

class PendingTaskStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("photoday_pending_tasks", Context.MODE_PRIVATE)
    private val key = "tasks"

    fun getTasks(): List<TaskRecord> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val task = runCatching { decode(array.getJSONObject(i)) }.getOrNull()
                    if (task != null && !task.id.isNullOrBlank() && task.task.isNotBlank()) add(task)
                }
            }
        }.getOrDefault(emptyList())
    }

    fun add(task: TaskRecord) {
        if (task.id.isNullOrBlank() || task.task.isBlank()) return
        save(getTasks().filterNot { it.id == task.id } + task)
    }

    fun remove(id: String) {
        save(getTasks().filterNot { it.id == id })
    }

    private fun decode(o: JSONObject): TaskRecord {
        return TaskRecord(
            id = o.optString("id").takeIf { it.isNotBlank() },
            date = o.optString("date").takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) },
            time = o.optString("time").takeIf { it.isNotBlank() }?.let { LocalTime.parse(it) },
            weekday = o.optString("weekday"),
            partOfDay = o.optString("partOfDay"),
            taskType = o.optString("taskType"),
            task = o.optString("task"),
            difficulty = if (o.has("difficulty") && !o.isNull("difficulty")) o.optInt("difficulty") else null,
            attachmentFolder = o.optString("attachmentFolder").takeIf { it.isNotBlank() },
            attachmentName = o.optString("attachmentName").takeIf { it.isNotBlank() },
            localAttachmentPath = o.optString("localAttachmentPath").takeIf { it.isNotBlank() }
        )
    }

    private fun save(tasks: List<TaskRecord>) {
        runCatching {
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
                        task.difficulty?.let { put("difficulty", it) }
                        task.attachmentFolder?.let { put("attachmentFolder", it) }
                        task.attachmentName?.let { put("attachmentName", it) }
                        task.localAttachmentPath?.let { put("localAttachmentPath", it) }
                    }
                )
            }
            prefs.edit().putString(key, array.toString()).commit()
        }
    }
}