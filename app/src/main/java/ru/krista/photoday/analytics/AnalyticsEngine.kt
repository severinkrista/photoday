package ru.krista.photoday.analytics

import ru.krista.photoday.domain.TaskRecord
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale

enum class AnalyticsGroupBy(val title: String) {
    DATE("День"),
    WEEK("Неделя"),
    MONTH("Месяц"),
    WEEKDAY("День недели"),
    PART_OF_DAY("Часть дня"),
    TASK_TYPE("Вид задачи"),
    DIFFICULTY("Сложность"),
    TASK("Задача")
}

enum class AnalyticsMetric(val title: String) {
    COUNT("Количество задач"),
    SUM_DIFFICULTY("Сумма сложности"),
    AVG_DIFFICULTY("Средняя сложность"),
    MIN_DIFFICULTY("Минимальная сложность"),
    MAX_DIFFICULTY("Максимальная сложность")
}

enum class AnalyticsChart(val title: String) {
    BAR("Столбцы"),
    LINE("Линия"),
    TABLE("Таблица")
}

data class AnalyticsQuery(
    val from: LocalDate,
    val to: LocalDate,
    val groupBy: AnalyticsGroupBy = AnalyticsGroupBy.DATE,
    val metric: AnalyticsMetric = AnalyticsMetric.COUNT,
    val taskTypes: Set<String> = emptySet(),
    val minDifficulty: Int? = null,
    val chart: AnalyticsChart = AnalyticsChart.BAR,
    val limit: Int = 20
)

data class AnalyticsBucket(
    val label: String,
    val value: Double,
    val count: Int,
    val tasks: List<TaskRecord> = emptyList()
)

data class AnalyticsResult(
    val totalTasks: Int,
    val totalDifficulty: Int,
    val averageDifficulty: Double,
    val maxDifficulty: Int,
    val buckets: List<AnalyticsBucket>
)

object AnalyticsEngine {
    fun calculate(records: List<TaskRecord>, query: AnalyticsQuery): AnalyticsResult {
        val filtered = records.filter { record ->
            val date = record.date ?: return@filter false
            date >= query.from &&
                date <= query.to &&
                (query.taskTypes.isEmpty() || query.taskTypes.contains(record.taskType)) &&
                (query.minDifficulty == null || (record.difficulty ?: 0) >= query.minDifficulty)
        }

        val totalDifficulty = filtered.sumOf { it.difficulty ?: 0 }
        val average = if (filtered.isEmpty()) 0.0 else totalDifficulty.toDouble() / filtered.size
        val max = filtered.maxOfOrNull { it.difficulty ?: 0 } ?: 0

        val grouped = linkedMapOf<String, MutableList<TaskRecord>>()
        filtered.forEach { record ->
            val key = groupKey(record, query.groupBy)
            grouped.getOrPut(key) { mutableListOf() }.add(record)
        }

        val buckets = grouped.map { (label, tasks) ->
            val values = tasks.map { (it.difficulty ?: 0).toDouble() }
            val value = when (query.metric) {
                AnalyticsMetric.COUNT -> tasks.size.toDouble()
                AnalyticsMetric.SUM_DIFFICULTY -> values.sum()
                AnalyticsMetric.AVG_DIFFICULTY -> if (values.isEmpty()) 0.0 else values.average()
                AnalyticsMetric.MIN_DIFFICULTY -> values.minOrNull() ?: 0.0
                AnalyticsMetric.MAX_DIFFICULTY -> values.maxOrNull() ?: 0.0
            }
            AnalyticsBucket(label, value, tasks.size, tasks)
        }.let { list ->
            if (query.groupBy == AnalyticsGroupBy.DATE || query.groupBy == AnalyticsGroupBy.WEEK || query.groupBy == AnalyticsGroupBy.MONTH) {
                list.sortedBy { bucket -> bucketSortKey(bucket.label, query.groupBy) }
            } else {
                list.sortedByDescending { it.value }
            }
        }

        return AnalyticsResult(
            totalTasks = filtered.size,
            totalDifficulty = totalDifficulty,
            averageDifficulty = average,
            maxDifficulty = max,
            buckets = if (query.groupBy == AnalyticsGroupBy.TASK) {
                buckets.sortedByDescending { it.value }.take(query.limit.coerceIn(1, 100))
            } else buckets
        )
    }

    private fun groupKey(record: TaskRecord, groupBy: AnalyticsGroupBy): String {
        val date = record.date
        return when (groupBy) {
            AnalyticsGroupBy.DATE -> date?.format(DateTimeFormatter.ofPattern("dd.MM")) ?: "Без даты"
            AnalyticsGroupBy.WEEK -> date?.let {
                val week = it.get(WeekFields.ISO.weekOfWeekBasedYear())
                String.format(Locale.getDefault(), "%d-W%02d", it.year, week)
            } ?: "Без даты"
            AnalyticsGroupBy.MONTH -> date?.format(DateTimeFormatter.ofPattern("MM.yyyy")) ?: "Без даты"
            AnalyticsGroupBy.WEEKDAY -> date?.let { weekday(it.dayOfWeek) } ?: "Без даты"
            AnalyticsGroupBy.PART_OF_DAY -> record.partOfDay.ifBlank { "Не указано" }
            AnalyticsGroupBy.TASK_TYPE -> record.taskType.ifBlank { "Не указан" }
            AnalyticsGroupBy.DIFFICULTY -> (record.difficulty ?: 0).toString()
            AnalyticsGroupBy.TASK -> record.task
        }
    }

    private fun bucketSortKey(label: String, groupBy: AnalyticsGroupBy): String {
        return when (groupBy) {
            AnalyticsGroupBy.MONTH -> label.reversed()
            AnalyticsGroupBy.WEEK -> label
            AnalyticsGroupBy.DATE -> label.substringAfter('.').padStart(2, '0') + label.substringBefore('.').padStart(2, '0')
            else -> label
        }
    }

    private fun weekday(day: DayOfWeek): String = when (day) {
        DayOfWeek.MONDAY -> "Пн"
        DayOfWeek.TUESDAY -> "Вт"
        DayOfWeek.WEDNESDAY -> "Ср"
        DayOfWeek.THURSDAY -> "Чт"
        DayOfWeek.FRIDAY -> "Пт"
        DayOfWeek.SATURDAY -> "Сб"
        DayOfWeek.SUNDAY -> "Вс"
    }
}
