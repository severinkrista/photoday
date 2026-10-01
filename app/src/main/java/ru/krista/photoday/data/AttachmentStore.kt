package ru.krista.photoday.data

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

data class LocalAttachment(
    val path: String,
    val originalName: String
)

class AttachmentStore(context: Context) {
    private val appContext = context.applicationContext
    private val dir = File(appContext.filesDir, "pending_attachments").apply { mkdirs() }

    fun copyFromUri(uri: Uri): Result<LocalAttachment> = runCatching {
        val resolver = appContext.contentResolver
        val originalName = queryDisplayName(uri)
            ?: "photo_" + System.currentTimeMillis() + ".jpg"
        val safeName = originalName.replace(Regex("[^A-Za-zА-Яа-я0-9._ -]"), "_")
        val target = File(dir, System.currentTimeMillis().toString() + "_" + safeName)
        resolver.openInputStream(uri)?.use { input ->
            FileOutputStream(target).use { output -> input.copyTo(output) }
        } ?: error("Не удалось прочитать выбранный файл")
        LocalAttachment(target.absolutePath, originalName)
    }

    fun read(path: String): ByteArray = FileInputStream(File(path)).use { it.readBytes() }

    fun delete(path: String?) {
        if (path.isNullOrBlank()) return
        runCatching { File(path).delete() }
    }

    private fun queryDisplayName(uri: Uri): String? {
        appContext.contentResolver.query(uri, arrayOf("_display_name"), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) return cursor.getString(0)
        }
        return null
    }
}
