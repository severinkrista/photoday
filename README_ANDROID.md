# Фото дня — Android

Первый этап читает существующий файл:
Файлы/Криста/Программы/photoday.xlsx

Шапка Excel не меняется:
Дата | Время | День недели | Часть дня | Вид задачи | Задача | Сложность

Приложение подключает Яндекс через LoginSDK, скачивает XLSX через REST API и показывает строки за последние N дней. По умолчанию N=2.

## OAuth
Создать приложение: https://oauth.yandex.ru/client/new/id/

Выбрать Android-приложение. Указать package name:
ru.krista.photoday

Для будущего полного сценария чтения/записи нужны разрешения:
cloud_api:disk.read
cloud_api:disk.write

В properties Android-проекта передать:
YANDEX_CLIENT_ID=ВАШ_CLIENT_ID

Client Secret в APK не хранить.

Официальная документация:
https://yandex.ru/dev/id/doc/ru/register-auth
https://yandex.ru/dev/id/doc/ru/mobileauthsdk/android/3.1.3/sdk-android-use
https://yandex.ru/dev/disk/rest/
