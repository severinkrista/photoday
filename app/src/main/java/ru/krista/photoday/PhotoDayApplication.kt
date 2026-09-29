package ru.krista.photoday

import android.app.Application

class PhotoDayApplication : Application() {
    val appContainer: AppContainer by lazy { AppContainer(this) }
}
