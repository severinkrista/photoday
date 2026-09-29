package ru.krista.photoday.presentation

import ru.krista.photoday.data.TaskTypeDefinition
import ru.krista.photoday.domain.TaskRecord

data class AttachmentPreview(
    val name: String,
    val bytes: ByteArray
)

data class MainUiState(
    val isLoading: Boolean = false,
    val records: List<TaskRecord> = emptyList(),
    val pendingTasks: List<TaskRecord> = emptyList(),
    val displayMode: String = ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_TASKS,
    val tasksToShow: Int = 10,
    val daysToShow: Int = 2,
    val taskTypes: List<String> = listOf("У", "Р", "ОК", "Л", "ЗП", "ГК", "КК"),
    val taskTypeDefinitions: List<TaskTypeDefinition> = emptyList(),
    val isConnected: Boolean = false,
    val errorMessage: String? = null,
    val attachmentPreview: AttachmentPreview? = null,
    val attachmentLoading: Boolean = false,
    val selectedPath: String = "",
    val filePickerOpen: Boolean = false,
    val filePickerPath: String = "disk:/",
    val filePickerItems: List<ru.krista.photoday.data.YandexDiskItem> = emptyList(),
    val filePickerLoading: Boolean = false
)