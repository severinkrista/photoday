package ru.krista.photoday

import android.content.Context
import ru.krista.photoday.data.YandexDiskClient
import ru.krista.photoday.data.YandexOAuthClient
import ru.krista.photoday.data.YandexTaskRepository
import ru.krista.photoday.data.YandexTokenStore
import ru.krista.photoday.data.YandexPathStore
import ru.krista.photoday.data.SettingsStore
import ru.krista.photoday.data.PendingTaskStore

class AppContainer(context: Context) {
    val tokenStore = YandexTokenStore(context)
    val pathStore = YandexPathStore(context)
    val settingsStore = SettingsStore(context)
    val pendingTaskStore = PendingTaskStore(context)
    val oauthClient = YandexOAuthClient()
    val diskClient = YandexDiskClient(tokenStore, pathStore)
    val taskRepository = YandexTaskRepository(diskClient)
}