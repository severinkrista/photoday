package ru.krista.photoday.data

import ru.krista.photoday.domain.TaskRecord
import ru.krista.photoday.domain.TaskRepository
import java.time.LocalDate

class YandexTaskRepository(private val disk: YandexDiskClient) : TaskRepository {
    private var workbook: ByteArray? = null

    override suspend fun getTasks(from: LocalDate, to: LocalDate): Result<List<TaskRecord>> = runCatching {
        val bytes = disk.downloadWorkbook().getOrThrow()
        workbook = bytes
        XlsxCodec.read(bytes)
            .filter { it.date == null || (!it.date.isBefore(from) && !it.date.isAfter(to)) }
            .sortedWith(compareBy<TaskRecord> { it.date }.thenBy { it.time })
    }

    suspend fun getLatestTasks(limit: Int): Result<List<TaskRecord>> = runCatching {
        val bytes = disk.downloadWorkbook().getOrThrow()
        workbook = bytes
        XlsxCodec.read(bytes)
            .sortedWith(compareByDescending<TaskRecord> { it.date }.thenByDescending { it.time })
            .take(limit.coerceAtLeast(1))
            .reversed()
    }

    fun currentPath(): String = disk.currentPath()

    suspend fun listFolder(path: String): Result<List<YandexDiskItem>> = disk.listFolder(path)

    fun selectPath(path: String) { disk.selectPath(path) }

    suspend fun addTask(task: TaskRecord): Result<Unit> = runCatching {
        val source = disk.downloadWorkbook().getOrThrow()
        val updated = XlsxCodec.appendTask(source, task)
        disk.uploadWorkbook(updated).getOrThrow()
        workbook = updated
    }
}