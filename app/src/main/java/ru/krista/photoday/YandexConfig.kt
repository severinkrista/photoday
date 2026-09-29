package ru.krista.photoday

object YandexConfig {
    const val CLIENT_ID = "PUT_YANDEX_CLIENT_ID_HERE"
    const val DISK_PATH = "disk:/Файлы/Криста/Программы/photoday.xlsx"
    const val OAUTH_REDIRECT_URI = "https://oauth.yandex.ru/verification_code"
    const val OAUTH_SCOPE = "cloud_api:disk.read cloud_api:disk.write"
}