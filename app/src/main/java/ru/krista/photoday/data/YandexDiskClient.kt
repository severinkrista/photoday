package ru.krista.photoday.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.krista.photoday.YandexConfig
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class YandexDiskClient(private val tokenStore: YandexTokenStore) {
    suspend fun downloadWorkbook(): Result<ByteArray> = withContext(Dispatchers.IO) {
        runCatching {
            val href = operationHref("resources/download")
            val c = URL(href).openConnection() as HttpURLConnection
            c.requestMethod = "GET"
            c.inputStream.use { it.readBytes() }
        }
    }

    suspend fun uploadWorkbook(bytes: ByteArray): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val href = operationHref("resources/upload", "&overwrite=true")
            val c = URL(href).openConnection() as HttpURLConnection
            c.requestMethod = "PUT"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            c.outputStream.use { it.write(bytes) }
            if (c.responseCode !in 200..299) error("Яндекс Диск: HTTP ${c.responseCode}")
        }
    }

    private fun operationHref(operation: String, extra: String = ""): String {
        val token = tokenStore.getToken() ?: error("Яндекс Диск не подключён")
        val path = URLEncoder.encode(YandexConfig.DISK_PATH, "UTF-8")
        val url = "https://cloud-api.yandex.net/v1/disk/$operation?path=$path$extra"
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = "GET"
        c.setRequestProperty("Authorization", "OAuth $token")
        if (c.responseCode !in 200..299) {
            val message = c.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            error("Яндекс Диск: HTTP ${c.responseCode}: $message")
        }
        val response = c.inputStream.bufferedReader().use { it.readText() }
        return Regex(""href"\\s*:\\s*"([^"]+)"").find(response)?.groupValues?.get(1)
            ?.replace("\\/","/")
            ?: error("Яндекс Диск не вернул ссылку операции")
    }
}