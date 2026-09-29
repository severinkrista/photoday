package ru.krista.photoday.data

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.krista.photoday.YandexConfig
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

class YandexOAuthClient {
    private var verifier: String? = null

    fun authorizationUrl(): String {
        check(YandexConfig.CLIENT_ID != "PUT_YANDEX_CLIENT_ID_HERE") { "Не задан Client ID Яндекс OAuth" }
        verifier = ByteArray(32).also { SecureRandom().nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        val challenge = MessageDigest.getInstance("SHA-256").digest(verifier!!.toByteArray())
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        return Uri.Builder().scheme("https").authority("oauth.yandex.ru").path("authorize")
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("client_id", YandexConfig.CLIENT_ID)
            .appendQueryParameter("redirect_uri", YandexConfig.OAUTH_REDIRECT_URI)
            .appendQueryParameter("scope", YandexConfig.OAUTH_SCOPE)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "S256").build().toString()
    }

    suspend fun exchangeCode(code: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val body = listOf(
                "grant_type" to "authorization_code",
                "code" to code,
                "client_id" to YandexConfig.CLIENT_ID,
                "redirect_uri" to YandexConfig.OAUTH_REDIRECT_URI,
                "code_verifier" to (verifier ?: error("Начните авторизацию заново"))
            ).joinToString("&") { (k,v) -> "${URLEncoder.encode(k,"UTF-8")}=${URLEncoder.encode(v,"UTF-8")}" }
            val c = URL("https://oauth.yandex.ru/token").openConnection() as HttpURLConnection
            c.requestMethod = "POST"; c.doOutput = true
            c.setRequestProperty("Content-Type","application/x-www-form-urlencoded")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val response = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
            if (c.responseCode !in 200..299) error("Яндекс OAuth: HTTP ${c.responseCode}: $response")
            Regex("\"access_token\"\\s*:\\s*\"([^\"]+)\"").find(response)?.groupValues?.get(1)
                ?: error("Яндекс не вернул OAuth-токен")
        }
    }
}