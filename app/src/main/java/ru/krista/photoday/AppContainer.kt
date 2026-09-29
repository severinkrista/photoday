package ru.krista.photoday

import android.content.Context
import ru.krista.photoday.data.YandexDiskClient
import ru.krista.photoday.data.YandexOAuthClient
import ru.krista.photoday.data.YandexTaskRepository
import ru.krista.photoday.data.YandexTokenStore
import ru.krista.photoday.data.YandexPathStore

class AppContainer(context: Context) {
    val tokenStore = YandexTokenStore(context)
    val pathStore = YandexPathStore(context)
    val oauthClient = YandexOAuthClient()
    val diskClient = YandexDiskClient(tokenStore, pathStore)
    val taskRepository = YandexTaskRepository(diskClient)
}