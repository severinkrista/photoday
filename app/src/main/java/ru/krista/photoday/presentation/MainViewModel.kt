package ru.krista.photoday.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import android.net.Uri
import ru.krista.photoday.data.AttachmentStore
import ru.krista.photoday.data.PendingTaskStore
import ru.krista.photoday.data.SettingsStore
import ru.krista.photoday.data.TaskTypeDefinition
import ru.krista.photoday.data.YandexOAuthClient
import ru.krista.photoday.data.YandexTaskRepository
import ru.krista.photoday.data.YandexTokenStore
import ru.krista.photoday.domain.TaskRecord
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

class MainViewModel(
    private val oauth: YandexOAuthClient,
    private val repository: YandexTaskRepository,
    private val tokenStore: YandexTokenStore,
    private val settingsStore: SettingsStore,
    private val pendingTaskStore: PendingTaskStore,
    private val attachmentStore: AttachmentStore
) : ViewModel() {
    private val sendingIds = mutableSetOf<String>()
    private val _uiState = MutableStateFlow(
        MainUiState(
            isConnected = tokenStore.getToken() != null,
            displayMode = settingsStore.getDisplayMode(),
            tasksToShow = settingsStore.getTasksToShow(),
            daysToShow = settingsStore.getDaysToShow(),
            taskTypes = settingsStore.getTaskTypes(),
            taskTypeDefinitions = settingsStore.getTaskTypeDefinitions(),
            selectedPath = repository.currentPath(),
            pendingTasks = pendingTaskStore.getTasks()
        )
    )
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        if (_uiState.value.isConnected) refresh()
    }

    fun setDisplayMode(mode: String) {
        if (mode != SettingsStore.DISPLAY_MODE_TASKS && mode != SettingsStore.DISPLAY_MODE_DAYS) return
        settingsStore.saveDisplayMode(mode)
        _uiState.value = _uiState.value.copy(displayMode = mode)
        if (_uiState.value.isConnected) refresh()
    }

    fun setTasksToShow(count: Int) {
        if (count < 1) return
        settingsStore.saveTasksToShow(count)
        _uiState.value = _uiState.value.copy(tasksToShow = count)
        if (_uiState.value.isConnected) refresh()
    }

    fun setDaysToShow(days: Int) {
        if (days < 1) return
        settingsStore.saveDaysToShow(days)
        _uiState.value = _uiState.value.copy(daysToShow = days)
        if (_uiState.value.isConnected) refresh()
    }

    fun setTaskTypeDefinitions(types: List<TaskTypeDefinition>) {
        val normalized = types.map {
            TaskTypeDefinition(it.code.trim(), it.description.trim())
        }.filter { it.code.isNotEmpty() }.distinctBy { it.code }
        if (normalized.isEmpty()) return
        settingsStore.saveTaskTypeDefinitions(normalized)
        _uiState.value = _uiState.value.copy(
            taskTypes = normalized.map { it.code },
            taskTypeDefinitions = normalized
        )
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

    fun testConnection() {
        if (_uiState.value.connectionTestLoading) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                connectionTestLoading = true,
                connectionTestResult = null,
                errorMessage = null
            )
            repository.testConnection()
                .onSuccess { result ->
                    val folderStatus = if (result.attachmentFolderExists) {
                        "папка вложений найдена"
                    } else {
                        "папка вложений пока не создана"
                    }
                    _uiState.value = _uiState.value.copy(
                        connectionTestLoading = false,
                        connectionTestResult = "Подключение работает. Основной файл доступен. $folderStatus."
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        connectionTestLoading = false,
                        connectionTestResult = null,
                        errorMessage = "Проверка подключения не пройдена: " + (it.message ?: "неизвестная ошибка")
                    )
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
            val current = _uiState.value
            val from = today.minusDays((current.daysToShow - 1).toLong())
            _uiState.value = current.copy(isLoading = true, errorMessage = null)
            val result = if (current.displayMode == SettingsStore.DISPLAY_MODE_TASKS) {
                repository.getLatestTasks(current.tasksToShow)
            } else {
                repository.getTasks(from, today)
            }
            result.onSuccess {
                _uiState.value = _uiState.value.copy(
                    records = it,
                    pendingTasks = pendingTaskStore.getTasks(),
                    isLoading = false,
                    isConnected = true
                )
            }.onFailure {
                _uiState.value = _uiState.value.copy(
                    pendingTasks = pendingTaskStore.getTasks(),
                    isLoading = false,
                    errorMessage = it.message
                )
            }
        }
    }

    fun addTask(type: String, difficulty: Int, text: String, attachmentUri: Uri?) {
        if (text.isBlank()) return
        viewModelScope.launch {
            val localAttachment = attachmentUri?.let { uri ->
                attachmentStore.copyFromUri(uri).getOrElse {
                    _uiState.value = _uiState.value.copy(errorMessage = "Не удалось добавить вложение: " + (it.message ?: "неизвестная ошибка"))
                    return@launch
                }
            }
            val date = LocalDate.now()
            val time = LocalTime.now().withSecond(0).withNano(0)
            val target = localAttachment?.let { repository.attachmentTarget(date, it.originalName) }
            val task = TaskRecord(
                id = UUID.randomUUID().toString(),
                date = date,
                time = time,
                weekday = listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс")[date.dayOfWeek.value - 1],
                partOfDay = partOfDay(time),
                taskType = type,
                task = text.trim(),
                difficulty = difficulty,
                attachmentFolder = target?.first,
                attachmentName = target?.second,
                localAttachmentPath = localAttachment?.path
            )

            sendTask(task, keepInPendingOnFailure = true)
        }
    }

    fun retryPendingTask(task: TaskRecord) {
        sendTask(task, keepInPendingOnFailure = false)
    }

    fun cancelPendingTask(task: TaskRecord) {
        task.id?.let(pendingTaskStore::remove)
        attachmentStore.delete(task.localAttachmentPath)
        _uiState.value = _uiState.value.copy(pendingTasks = pendingTaskStore.getTasks())
    }

    fun openAttachment(task: TaskRecord) {
        if (task.attachmentFolder.isNullOrBlank() || task.attachmentName.isNullOrBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(attachmentLoading = true, errorMessage = null)
            repository.downloadAttachment(task).onSuccess { bytes ->
                _uiState.value = _uiState.value.copy(
                    attachmentPreview = ru.krista.photoday.presentation.AttachmentPreview(task.attachmentName, bytes),
                    attachmentLoading = false
                )
            }.onFailure {
                _uiState.value = _uiState.value.copy(
                    attachmentLoading = false,
                    errorMessage = "Не удалось открыть вложение: " + (it.message ?: "неизвестная ошибка")
                )
            }
        }
    }

    fun closeAttachment() {
        _uiState.value = _uiState.value.copy(attachmentPreview = null, attachmentLoading = false)
    }

    private fun sendTask(task: TaskRecord, keepInPendingOnFailure: Boolean) {
        val id = task.id ?: return
        if (!sendingIds.add(id)) return
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(errorMessage = null)
                val attachmentBytes = runCatching {
                    task.localAttachmentPath?.let { attachmentStore.read(it) }
                }.getOrElse {
                    if (keepInPendingOnFailure) {
                        pendingTaskStore.add(task)
                    }
                    _uiState.value = _uiState.value.copy(
                        pendingTasks = pendingTaskStore.getTasks(),
                        errorMessage = "Не найден локальный файл вложения: " + (it.message ?: "неизвестная ошибка")
                    )
                    return@launch
                }

                repository.addTask(task, attachmentBytes).onSuccess {
                    pendingTaskStore.remove(id)
                    attachmentStore.delete(task.localAttachmentPath)
                    _uiState.value = _uiState.value.copy(
                        pendingTasks = pendingTaskStore.getTasks(),
                        errorMessage = null
                    )
                    refresh()
                }.onFailure {
                    if (keepInPendingOnFailure) {
                        pendingTaskStore.add(task)
                    }
                    _uiState.value = _uiState.value.copy(
                        pendingTasks = pendingTaskStore.getTasks(),
                        errorMessage = "Не удалось отправить запись в таблицу: " + (it.message ?: "неизвестная ошибка")
                    )
                }
            } finally {
                sendingIds.remove(id)
            }
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
