package ru.krista.photoday

import android.content.Context
import ru.krista.photoday.domain.TaskRepository

class AppContainer(
    private val context: Context
) {
    // Concrete repositories are wired here as integrations are added.
    val taskRepository: TaskRepository? = null
}
