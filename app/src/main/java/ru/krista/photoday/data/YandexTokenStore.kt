package ru.krista.photoday.data

import android.content.Context

class YandexTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("yandex_auth", Context.MODE_PRIVATE)
    fun getToken(): String? = prefs.getString("oauth_token", null)
    fun saveToken(token: String) { prefs.edit().putString("oauth_token", token).apply() }
    fun clear() { prefs.edit().remove("oauth_token").apply() }
}