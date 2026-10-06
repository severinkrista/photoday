# Фото дня

Проект содержит два клиента одной системы:

- Android-приложение в app;
- браузерное расширение в web-extension.

Оба клиента используют существующий photoday.xlsx на Яндекс Диске как authoritative source.

## Архитектура

UI -> repository -> платформенные adapters -> Яндекс Диск / XLSX.

Бизнес-контракт должен оставаться одинаковым, а UI и инфраструктурные реализации могут быть платформенными.

Браузерное расширение реализует:

- подключение к Яндекс Диску;
- чтение и запись photoday.xlsx;
- просмотр последних задач по количеству или дням;
- добавление задачи с указанием даты и времени (в том числе задним числом);
- типы задач;
- сложность 0–5;
- изображения-вложения;
- очередь неотправленных записей;
- повторную отправку и отмену;
- проверку подключения, XLSX и папки вложений;
- отдельную страницу настроек.

Подробная архитектура описана в web-extension/ARCHITECTURE.md.

## Сборка

Android:

- `build-apk.bat` — сам скачивает Gradle 9.6.0 и JDK 17 в `.tools`, собирает debug-APK
  и кладёт его в `build-output/photoday-<версия>.apk`;
- версии Gradle, Android Gradle Plugin и Kotlin Compose задаются в одном месте —
  `settings.gradle.kts` (`pluginManagement { plugins { ... } }`). Не дублируйте `version`
  в `build.gradle.kts` и `app/build.gradle.kts`: разные версии в двух файлах дают ошибку
  «the plugin is already on the classpath with a different version».

Браузерное расширение:

- `cd web-extension && npm install && npm run build` (TypeScript + esbuild);
- собранные `popup.js`, `settings.js`, `viewer.js` в корне `web-extension` коммитятся,
  их пересобирает workflow `.github/workflows/web-extension-build.yml`.
