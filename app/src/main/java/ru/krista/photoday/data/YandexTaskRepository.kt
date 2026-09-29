package ru.krista.photoday.data

import ru.krista.photoday.domain.TaskRecord
import ru.krista.photoday.domain.TaskRepository
import java.time.LocalDate

data class ConnectionTestResult(
    val filePath: String,
    val fileAvailable: Boolean,
    val attachmentFolder: String,
    val attachmentFolderExists: Boolean
)

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

    suspend fun testConnection(): Result<ConnectionTestResult> = runCatching {
        val workbook = disk.downloadWorkbook().getOrThrow()
        if (workbook.isEmpty()) error("Основной XLSX-файл пустой")
        val attachmentRoot = disk.attachmentRootFolder()
        val attachmentExists = disk.testFolderExists(attachmentRoot).getOrThrow()
        ConnectionTestResult(
            filePath = disk.currentPath(),
            fileAvailable = true,
            attachmentFolder = attachmentRoot,
            attachmentFolderExists = attachmentExists
        )
    }

    suspend fun listFolder(path: String): Result<List<YandexDiskItem>> = disk.listFolder(path)

    fun selectPath(path: String) { disk.selectPath(path) }

    fun attachmentTarget(date: LocalDate, originalName: String): Pair<String, String> {
        val folder = disk.attachmentFolder(date)
        val dot = originalName.lastIndexOf('.')
        val base = if (dot > 0) originalName.substring(0, dot) else originalName
        val ext = if (dot > 0) originalName.substring(dot) else ""
        val suffix = java.util.UUID.randomUUID().toString().replace("-", "").take(5)
        return folder to (base + "_" + suffix + ext)
    }

    suspend fun addTask(task: TaskRecord, attachmentBytes: ByteArray? = null): Result<Unit> = runCatching {
        if (!task.attachmentFolder.isNullOrBlank() && !task.attachmentName.isNullOrBlank()) {
            val folder = task.attachmentFolder
            // Создаём именно ту иерархию, в которую будет загружен файл:
            // .../attached -> .../attached/YYYY -> .../attached/YYYY/MM
            val yearFolder = folder.substringBeforeLast('/')
            val attachedFolder = yearFolder.substringBeforeLast('/')
            disk.ensureFolder(attachedFolder).getOrThrow()
            disk.ensureFolder(yearFolder).getOrThrow()
            disk.ensureFolder(folder).getOrThrow()
            val bytes = attachmentBytes ?: error("Не найден локальный файл вложения")
            disk.uploadAttachment(
                folder + "/" + task.attachmentName,
                bytes,
                mimeType(task.attachmentName)
            ).getOrThrow()
        }
        val source = disk.downloadWorkbook().getOrThrow()
        val updated = XlsxCodec.appendTask(source, task)
        disk.uploadWorkbook(updated).getOrThrow()
        workbook = updated
    }

    suspend fun downloadAttachment(task: TaskRecord): Result<ByteArray> = runCatching {
        val folder = task.attachmentFolder ?: error("У задачи нет папки вложения")
        val name = task.attachmentName ?: error("У задачи нет имени вложения")
        disk.downloadFile(folder + "/" + name).getOrThrow()
    }

    private fun mimeType(name: String): String {
        return when (name.substringAfterLast('.', "").lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "gif" -> "image/gif"
            "heic", "heif" -> "image/heic"
            else -> "application/octet-stream"
        }
    }
}