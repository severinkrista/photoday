package ru.krista.photoday.presentation

import ru.krista.photoday.domain.TaskRecord

data class MainUiState(
    val isLoading: Boolean = false,
    val records: List<TaskRecord> = emptyList(),
    val pendingTasks: List<TaskRecord> = emptyList(),
    val daysToShow: Int = 2,
    val isConnected: Boolean = false,
    val errorMessage: String? = null,
    val selectedPath: String = "",
    val filePickerOpen: Boolean = false,
    val filePickerPath: String = "disk:/",
    val filePickerItems: List<ru.krista.photoday.data.YandexDiskItem> = emptyList(),
    val filePickerLoading: Boolean = false
)