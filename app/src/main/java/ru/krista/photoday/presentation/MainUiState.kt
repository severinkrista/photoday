package ru.krista.photoday.presentation

import ru.krista.photoday.domain.TaskRecord

data class MainUiState(
    val isLoading: Boolean = false,
    val records: List<TaskRecord> = emptyList(),
    val daysToShow: Int = 2,
    val isConnected: Boolean = false,
    val errorMessage: String? = null,\n    val selectedPath: String = "",\n    val filePickerOpen: Boolean = false,\n    val filePickerPath: String = "disk:/",\n    val filePickerItems: List<ru.krista.photoday.data.YandexDiskItem> = emptyList(),\n    val filePickerLoading: Boolean = false
)
