package ru.krista.photoday.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import ru.krista.photoday.data.YandexOAuthClient
import ru.krista.photoday.data.YandexTaskRepository
import ru.krista.photoday.data.YandexTokenStore
import ru.krista.photoday.data.SettingsStore
import ru.krista.photoday.domain.TaskRecord
import java.time.LocalDate
import java.time.LocalTime

class MainViewModel(
    private val oauth: YandexOAuthClient,
    private val repository: YandexTaskRepository,
    private val tokenStore: YandexTokenStore,
    private val settingsStore: SettingsStore
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        MainUiState(isConnected = tokenStore.getToken() != null, daysToShow = settingsStore.getDaysToShow(), selectedPath = repository.currentPath())
    )
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        if (_uiState.value.isConnected) refresh()
    }

    fun setDaysToShow(days: Int) {
        if (days < 1) return
        settingsStore.saveDaysToShow(days)
        _uiState.value = _uiState.value.copy(daysToShow = days)
        if (_uiState.value.isConnected) refresh()
    }

    fun authorizationUrl(): String = oauth.authorizationUrl()

    fun finishAuthorization(code: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            oauth.exchangeCode(code).onSuccess {
                tokenStore.saveToken(it)
                _uiState.value = _uiState.value.copy(isConnected = true)
                refresh()
            }.onFailure {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = it.message)
            }
        }
    }

    fun openFilePicker() {
        _uiState.value = _uiState.value.copy(filePickerOpen = true, filePickerPath = "disk:/", filePickerLoading = true)
        loadFolder("disk:/")
    }

    fun closeFilePicker() {
        _uiState.value = _uiState.value.copy(filePickerOpen = false)
    }

    fun loadFolder(path: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(filePickerLoading = true, errorMessage = null)
            repository.listFolder(path).onSuccess { items ->
                _uiState.value = _uiState.value.copy(filePickerPath = path, filePickerItems = items, filePickerLoading = false)
            }.onFailure {
                _uiState.value = _uiState.value.copy(filePickerLoading = false, errorMessage = it.message)
            }
        }
    }

    fun selectFile(path: String) {
        repository.selectPath(path)
        _uiState.value = _uiState.value.copy(selectedPath = path, filePickerOpen = false, errorMessage = null)
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val today = LocalDate.now()
            val from = today.minusDays((_uiState.value.daysToShow - 1).toLong())
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            repository.getTasks(from, today).onSuccess {
                _uiState.value = _uiState.value.copy(records = it, isLoading = false, isConnected = true)
            }.onFailure {
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = it.message)
            }
        }
    }

    fun addTask(type: String, difficulty: Int, text: String) {
        if (text.isBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val date = LocalDate.now()
            val time = LocalTime.now().withSecond(0).withNano(0)
            val task = TaskRecord(
                id = null,
                date = date,
                time = time,
                weekday = listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс")[date.dayOfWeek.value - 1],
                partOfDay = partOfDay(time),
                taskType = type,
                task = text.trim(),
                difficulty = difficulty
            )
            repository.addTask(task).onSuccess { refresh() }
                .onFailure { _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = it.message) }
        }
    }

    private fun partOfDay(time: LocalTime): String = when (time.hour) {
        in 0..7 -> "До начала рабочего дня"
        in 8..11 -> "Утро"
        in 12..14 -> "Обед"
        in 15..17 -> "Вечер"
        else -> "После конца рабочего дня"
    }
}