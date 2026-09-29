package ru.krista.photoday.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class YandexDiskItem(val name: String, val path: String, val type: String)

class YandexDiskClient(
    private val tokenStore: YandexTokenStore,
    private val pathStore: YandexPathStore
) {
    suspend fun downloadWorkbook(): Result<ByteArray> = withContext(Dispatchers.IO) {
        runCatching {
            val href = operationHref("resources/download", pathStore.getPath())
            val c = URL(href).openConnection() as HttpURLConnection
            c.requestMethod = "GET"
            c.inputStream.use { it.readBytes() }
        }
    }

    suspend fun uploadWorkbook(bytes: ByteArray): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val href = operationHref("resources/upload", pathStore.getPath(), "&overwrite=true")
            val c = URL(href).openConnection() as HttpURLConnection
            c.requestMethod = "PUT"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            c.outputStream.use { it.write(bytes) }
            if (c.responseCode !in 200..299) error("Яндекс Диск: HTTP ${c.responseCode}")
        }
    }

    fun attachmentFolder(date: java.time.LocalDate): String {
        val parent = pathStore.getPath().substringBeforeLast("/", "")
        require(parent.isNotBlank()) { "Не удалось определить родительскую папку XLSX" }
        return parent + "/attached/" + date.year + "/" + date.monthValue.toString().padStart(2, '0')
    }

    suspend fun uploadAttachment(path: String, bytes: ByteArray, contentType: String?): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val href = operationHref("resources/upload", path, "&overwrite=true")
            val c = URL(href).openConnection() as HttpURLConnection
            c.requestMethod = "PUT"
            c.doOutput = true
            if (!contentType.isNullOrBlank()) c.setRequestProperty("Content-Type", contentType)
            c.outputStream.use { it.write(bytes) }
            if (c.responseCode !in 200..299) error("Яндекс Диск: HTTP " + c.responseCode)
        }
    }

    suspend fun ensureFolder(path: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val token = tokenStore.getToken() ?: error("Яндекс Диск не подключён")
            val encodedPath = URLEncoder.encode(path, "UTF-8")
            val url = "https://cloud-api.yandex.net/v1/disk/resources?path=" + encodedPath
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "PUT"
            connection.setRequestProperty("Authorization", "OAuth " + token)
            if (connection.responseCode !in 200..299 && connection.responseCode != 409) {
                val message = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                error("Яндекс Диск: HTTP " + connection.responseCode + ": " + message)
            }
        }
    }

    suspend fun downloadFile(path: String): Result<ByteArray> = withContext(Dispatchers.IO) {
        runCatching {
            val href = operationHref("resources/download", path)
            val c = URL(href).openConnection() as HttpURLConnection
            c.requestMethod = "GET"
            if (c.responseCode !in 200..299) error("Яндекс Диск: HTTP " + c.responseCode)
            c.inputStream.use { it.readBytes() }
        }
    }
    fun currentPath(): String = pathStore.getPath()

    fun selectPath(path: String) { pathStore.savePath(path) }

    suspend fun listFolder(path: String): Result<List<YandexDiskItem>> = withContext(Dispatchers.IO) {
        runCatching {
            val token = tokenStore.getToken() ?: error("Яндекс Диск не подключён")
            val encodedPath = URLEncoder.encode(path, "UTF-8")
            val url = "https://cloud-api.yandex.net/v1/disk/resources?path=$encodedPath&limit=100"
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "OAuth $token")
            if (connection.responseCode !in 200..299) {
                val message = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                error("Яндекс Диск: HTTP ${connection.responseCode}: $message")
            }
            val root = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val items = root.optJSONObject("_embedded")?.optJSONArray("items") ?: return@runCatching emptyList()
            buildList {
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    add(YandexDiskItem(item.optString("name"), item.optString("path"), item.optString("type")))
                }
            }.sortedWith(compareBy<YandexDiskItem> { it.type != "dir" }.thenBy { it.name.lowercase() })
        }
    }

    private fun operationHref(operation: String, pathValue: String, extra: String = ""): String {
        val token = tokenStore.getToken() ?: error("Яндекс Диск не подключён")
        val path = URLEncoder.encode(pathValue, "UTF-8")
        val url = "https://cloud-api.yandex.net/v1/disk/$operation?path=$path$extra"
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = "GET"
        c.setRequestProperty("Authorization", "OAuth $token")
        if (c.responseCode !in 200..299) {
            val message = c.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            error("Яндекс Диск: HTTP ${c.responseCode}: $message")
        }
        val response = c.inputStream.bufferedReader().use { it.readText() }
        return Regex("\"href\"\\s*:\\s*\"([^\"]+)\"").find(response)?.groupValues?.get(1)
            ?.replace("\\/","/")
            ?: error("Яндекс Диск не вернул ссылку операции")
    }
}