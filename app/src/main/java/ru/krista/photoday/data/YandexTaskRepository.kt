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

    fun currentPath(): String = disk.currentPath()\n\n    suspend fun listFolder(path: String): Result<List<YandexDiskItem>> = disk.listFolder(path)\n\n    fun selectPath(path: String) { disk.selectPath(path) }\n\n    suspend fun addTask(task: TaskRecord): Result<Unit> = runCatching {
        val source = disk.downloadWorkbook().getOrThrow()
        val updated = XlsxCodec.appendTask(source, task)
        disk.uploadWorkbook(updated).getOrThrow()
        workbook = updated
    }
}