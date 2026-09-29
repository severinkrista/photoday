plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "ru.krista.photoday"
    compileSdk = 37
    defaultConfig {
        applicationId = "ru.krista.photoday"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        val yandexClientId = project.findProperty("YANDEX_CLIENT_ID")?.toString() ?: "REPLACE_WITH_YANDEX_CLIENT_ID"
        manifestPlaceholders["YANDEX_CLIENT_ID"] = yandexClientId
    }
    buildFeatures { compose = true }
    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}
dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:5.1.0")
    implementation("com.yandex.android:authsdk:3.1.3")
    implementation("com.github.SUPERCILEX.poi-android:poi:3.17")
    implementation("com.github.SUPERCILEX.poi-android:proguard:3.17")
}
