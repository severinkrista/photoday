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

    fun currentPath(): String = pathStore.getPath()\n\n    fun selectPath(path: String) { pathStore.savePath(path) }\n\n    suspend fun listFolder(path: String): Result<List<YandexDiskItem>> = withContext(Dispatchers.IO) {\n        runCatching {\n            val token = tokenStore.getToken() ?: error("Яндекс Диск не подключён")\n            val encodedPath = URLEncoder.encode(path, "UTF-8")\n            val url = "https://cloud-api.yandex.net/v1/disk/resources?path=$encodedPath&limit=100"\n            val connection = URL(url).openConnection() as HttpURLConnection\n            connection.requestMethod = "GET"\n            connection.setRequestProperty("Authorization", "OAuth $token")\n            if (connection.responseCode !in 200..299) {\n                val message = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()\n                error("Яндекс Диск: HTTP ${connection.responseCode}: $message")\n            }\n            val root = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })\n            val items = root.optJSONObject("_embedded")?.optJSONArray("items") ?: return@runCatching emptyList()\n            buildList {\n                for (i in 0 until items.length()) {\n                    val item = items.getJSONObject(i)\n                    add(YandexDiskItem(item.optString("name"), item.optString("path"), item.optString("type")))\n                }\n            }.sortedWith(compareBy<YandexDiskItem> { it.type != "dir" }.thenBy { it.name.lowercase() })\n        }\n    }\n\n    private fun operationHref(operation: String, pathValue: String, extra: String = ""): String {
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