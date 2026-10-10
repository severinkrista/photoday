package ru.krista.photoday

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.graphics.BitmapFactory
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.viewmodel.compose.viewModel
import ru.krista.photoday.data.TaskTypeDefinition
import ru.krista.photoday.analytics.AnalyticsChart
import ru.krista.photoday.analytics.AnalyticsEngine
import ru.krista.photoday.analytics.AnalyticsGroupBy
import ru.krista.photoday.analytics.AnalyticsMetric
import ru.krista.photoday.analytics.AnalyticsQuery
import ru.krista.photoday.domain.TaskMoment
import ru.krista.photoday.domain.TaskRecord
import ru.krista.photoday.presentation.MainUiState
import ru.krista.photoday.presentation.MainViewModel
import com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost
import com.patrykandpatrick.vico.compose.cartesian.axis.HorizontalAxis
import com.patrykandpatrick.vico.compose.cartesian.axis.VerticalAxis
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberLineCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.rememberCartesianChart
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoScrollState
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoZoomState
import com.patrykandpatrick.vico.compose.cartesian.data.CartesianChartModelProducer
import com.patrykandpatrick.vico.compose.cartesian.data.columnModel
import com.patrykandpatrick.vico.compose.cartesian.data.lineModel

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

private val recordDateFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
private val recordTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** Дата и время записи одной строкой: «05.10.2026 14:30». */
private fun momentLabel(record: TaskRecord): String =
    listOfNotNull(
        record.date?.format(recordDateFormatter),
        record.time?.format(recordTimeFormatter)
    ).joinToString(" ")

private fun Modifier.edgeBackGesture(onBack: () -> Unit): Modifier = pointerInput(Unit) {
    var startX = 0f
    var totalDx = 0f
    detectHorizontalDragGestures(
        onDragStart = { offset -> startX = offset.x; totalDx = 0f },
        onHorizontalDrag = { change, dragAmount ->
            if (startX <= 60f) {
                totalDx += dragAmount
                if (totalDx >= 120f) {
                    onBack()
                    totalDx = Float.NEGATIVE_INFINITY
                }
            }
            change.consume()
        },
        onDragEnd = { startX = 0f; totalDx = 0f }
    )
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val container = (application as PhotoDayApplication).appContainer
            val vm: MainViewModel = viewModel(factory = MainViewModelFactory(container))
            PhotoDayScreen(vm)
        }
    }
}

@Composable
private fun PhotoDayScreen(vm: MainViewModel) {
    val state by vm.uiState.collectAsState()
    val uriHandler = LocalUriHandler.current
    var showAdd by remember { mutableStateOf(false) }
    var showCode by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var showTaskTypes by remember { mutableStateOf(false) }
    var showAnalytics by remember { mutableStateOf(false) }
    var showDailyReflection by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }

    val goBack = {
        when {
            showCode -> showCode = false
            showDailyReflection -> showDailyReflection = false
            showAdd -> showAdd = false
            showTaskTypes -> showTaskTypes = false
            showSettings -> showSettings = false
            showAnalytics -> showAnalytics = false
            state.filePickerOpen -> vm.closeFilePicker()
        }
    }
    BackHandler(enabled = state.attachmentPreview != null || showDailyReflection || showTaskTypes || showSettings || showAnalytics || showAdd || showCode || state.filePickerOpen) {
        if (state.attachmentPreview != null) vm.closeAttachment() else goBack()
    }

    MaterialTheme {
        when {
            showDailyReflection -> DailyReflectionScreen(
                disk = (LocalContext.current.applicationContext as PhotoDayApplication).appContainer.diskClient,
                connected = state.isConnected,
                onBack = { showDailyReflection = false }
            )
            showTaskTypes -> TaskTypesScreen(
                definitions = state.taskTypeDefinitions,
                onBack = { showTaskTypes = false },
                onSave = vm::setTaskTypeDefinitions
            )
            showAnalytics -> AnalyticsScreen(
                records = state.analyticsRecords,
                loading = state.analyticsLoading,
                error = state.analyticsError,
                taskTypes = state.taskTypes,
                onBack = { showAnalytics = false },
                onRefresh = vm::loadAnalytics
            )
            showSettings -> SettingsScreen(
                state = state,
                onBack = { showSettings = false },
                onDisplayModeChanged = vm::setDisplayMode,
                onTasksChanged = vm::setTasksToShow,
                onDaysChanged = vm::setDaysToShow,
                onSelectFile = vm::openFilePicker,
                onOpenTaskTypes = { showTaskTypes = true },
                onTestConnection = vm::testConnection
            )
            else -> {
            MainScreen(
                state = state,
                onSettings = { showSettings = true },
                onAnalytics = { showAnalytics = true; vm.loadAnalytics() },
                onRefresh = vm::refresh,
                onAdd = { showAdd = true },\n                onDailyReflection = { showDailyReflection = true },
                onRetryPending = vm::retryPendingTask,
                onCancelPending = vm::cancelPendingTask,
                onOpenAttachment = vm::openAttachment,
                onConnect = {
                    uriHandler.openUri(vm.authorizationUrl())
                    showCode = true
                }
            )
            }
        }
    }

    if (state.filePickerOpen) {
        FilePickerDialog(
            state = state,
            onClose = vm::closeFilePicker,
            onLoadFolder = vm::loadFolder,
            onSelectFile = vm::selectFile
        )
    }

    state.attachmentPreview?.let { preview ->
        AlertDialog(
            onDismissRequest = vm::closeAttachment,
            title = { Text(preview.name) },
            text = {
                val bitmap = remember(preview.bytes) {
                    BitmapFactory.decodeByteArray(preview.bytes, 0, preview.bytes.size)
                }
                if (bitmap != null) {
                    androidx.compose.foundation.Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = preview.name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp)
                    )
                } else {
                    Text("Не удалось отобразить изображение.")
                }
            },
            confirmButton = {
                TextButton(onClick = vm::closeAttachment) { Text("Закрыть") }
            }
        )
    }

    if (showCode) {
        AlertDialog(
            onDismissRequest = { showCode = false },
            title = { Text("Код Яндекс OAuth") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("После подтверждения Яндекс откроет страницу перенаправления. Скопируйте с неё код целиком и вставьте сюда.")
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it.filterNot(Char::isWhitespace) },
                        label = { Text("Код подтверждения") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { showCode = false; vm.finishAuthorization(code) },
                    enabled = code.isNotBlank()
                ) { Text("Подключить") }
            },
            dismissButton = { TextButton(onClick = { showCode = false }) { Text("Отмена") } }
        )
    }

    if (showAdd) {
        AddTaskCard(
            taskTypes = state.taskTypes,
            onDismiss = { showAdd = false },
            onSave = { type, difficulty, text, date, time, attachmentUri ->
                showAdd = false
                vm.addTask(type, difficulty, text, attachmentUri, date, time)
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScreen(
    state: MainUiState,
    onSettings: () -> Unit,
    onAnalytics: () -> Unit,
    onRefresh: () -> Unit,
    onAdd: () -> Unit,
    onDailyReflection: () -> Unit,
    onRetryPending: (TaskRecord) -> Unit,
    onCancelPending: (TaskRecord) -> Unit,
    onOpenAttachment: (TaskRecord) -> Unit,
    onConnect: () -> Unit
) {
    Scaffold { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Фото дня", style = MaterialTheme.typography.headlineSmall)
                    if (state.isConnected) {
                        val displayText = if (state.displayMode == ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_TASKS) {
                            "Последние ${state.tasksToShow} задач"
                        } else {
                            "Последние ${state.daysToShow} дн."
                        }
                        Text(displayText, style = MaterialTheme.typography.labelMedium)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onAnalytics) { Text("Аналитика") }
                    TextButton(onClick = onSettings) { Text("Настройки") }
                }
            }

            state.errorMessage?.let { errorText ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SelectionContainer {
                            Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                        val context = LocalContext.current
                        TextButton(onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Ошибка Фото дня", errorText))
                        }) { Text("Копировать ошибку") }
                    }
                }
            }

            if (!state.isConnected) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Яндекс Диск", style = MaterialTheme.typography.titleMedium)
                        Text("Подключите свой аккаунт, чтобы читать и изменять файл.")
                        Button(onClick = onConnect, Modifier.fillMaxWidth()) { Text("Подключить Яндекс") }
                    }
                }
            } else {
                if (state.pendingTasks.isNotEmpty()) {
                    Text("Ожидают отправки", style = MaterialTheme.typography.titleMedium)
                    state.pendingTasks.forEach { task ->
                        PendingTaskCard(task, onRetryPending, onCancelPending)
                    }
                }

                if (state.isLoading) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (state.records.isEmpty() && state.pendingTasks.isEmpty()) {
                    Card(Modifier.fillMaxWidth()) {
                        Text("Записей за выбранный период нет.", Modifier.padding(16.dp))
                    }
                }

                val pullRefreshState = rememberPullToRefreshState()
                PullToRefreshBox(
                    isRefreshing = state.isLoading,
                    onRefresh = onRefresh,
                    state = pullRefreshState,
                    modifier = Modifier.fillMaxWidth().weight(1f)
                ) {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(state.records) { TaskCard(it, onOpenAttachment) }
                    }
                }


                Button(onClick = onDailyReflection, Modifier.fillMaxWidth()) { Text("🎙 Итоги дня", fontSize = 18.sp) }
                Button(onClick = onAdd, Modifier.fillMaxWidth()) { Text("＋ Новая задача") }            }
        }
    }
}

@Composable
private fun SettingsScreen(
    state: MainUiState,
    onBack: () -> Unit,
    onDisplayModeChanged: (String) -> Unit,
    onTasksChanged: (Int) -> Unit,
    onDaysChanged: (Int) -> Unit,
    onSelectFile: () -> Unit,
    onOpenTaskTypes: () -> Unit,
    onTestConnection: () -> Unit
) {
    var tasksValue by remember(state.tasksToShow) { mutableStateOf(state.tasksToShow.toString()) }
    var daysValue by remember(state.daysToShow) { mutableStateOf(state.daysToShow.toString()) }

    Scaffold(modifier = Modifier.edgeBackGesture(onBack)) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("‹ Назад") }
                Text("Настройки", style = MaterialTheme.typography.headlineSmall)
            }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Файл данных", style = MaterialTheme.typography.titleMedium)
                    Text(
                        state.selectedPath.ifBlank { "Файл не выбран" },
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text("Полный путь к файлу на Яндекс Диске", style = MaterialTheme.typography.labelSmall)
                    Button(onClick = onSelectFile, Modifier.fillMaxWidth()) { Text("Выбрать файл") }
                }
            }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Отображение данных", style = MaterialTheme.typography.titleMedium)
                    Text("Режим отображения", style = MaterialTheme.typography.labelLarge)

                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FilterChip(
                            selected = state.displayMode == ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_TASKS,
                            onClick = { onDisplayModeChanged(ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_TASKS) },
                            label = { Text("Количество задач") }
                        )
                        FilterChip(
                            selected = state.displayMode == ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_DAYS,
                            onClick = { onDisplayModeChanged(ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_DAYS) },
                            label = { Text("Количество дней") }
                        )
                    }

                    if (state.displayMode == ru.krista.photoday.data.SettingsStore.DISPLAY_MODE_TASKS) {
                        OutlinedTextField(
                            value = tasksValue,
                            onValueChange = { tasksValue = it.filter(Char::isDigit).take(3) },
                            label = { Text("Количество задач") },
                            supportingText = { Text("Показывать последние N задач") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Button(
                            onClick = { tasksValue.toIntOrNull()?.takeIf { it > 0 }?.let(onTasksChanged) },
                            enabled = tasksValue.toIntOrNull()?.let { it > 0 && it != state.tasksToShow } == true,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Сохранить") }
                    } else {
                        OutlinedTextField(
                            value = daysValue,
                            onValueChange = { daysValue = it.filter(Char::isDigit).take(3) },
                            label = { Text("Количество дней") },
                            supportingText = { Text("Показывать записи за последние N дней") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Button(
                            onClick = { daysValue.toIntOrNull()?.takeIf { it > 0 }?.let(onDaysChanged) },
                            enabled = daysValue.toIntOrNull()?.let { it > 0 && it != state.daysToShow } == true,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Сохранить") }
                    }
                }
            }

            Card(Modifier.fillMaxWidth().clickable(onClick = onOpenTaskTypes)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Типы задач", style = MaterialTheme.typography.titleMedium)
                    Text("Настройка набора типов и их описаний")
                    Text("›", style = MaterialTheme.typography.titleLarge, modifier = Modifier.align(Alignment.End))
                }
            }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Подключение", style = MaterialTheme.typography.titleMedium)
                    Text(if (state.isConnected) "Яндекс Диск подключён" else "Яндекс Диск не подключён")

                    Button(
                        onClick = onTestConnection,
                        enabled = state.isConnected && !state.connectionTestLoading,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (state.connectionTestLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Проверить подключение")
                        }
                    }

                    state.connectionTestResult?.let {
                        Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            Text(
                "Версия приложения " + BuildConfig.VERSION_NAME,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)
            )
        }
    }
}

@Composable
private fun PendingTaskCard(
    record: TaskRecord,
    onRetry: (TaskRecord) -> Unit,
    onCancel: (TaskRecord) -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Не отправлена в таблицу", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge)
            Text("${record.date ?: ""}", style = MaterialTheme.typography.labelMedium)
            Text("${record.taskType}   •   Сложность: ${if ((record.difficulty ?: 0) == 0) "0" else "★".repeat(record.difficulty ?: 0)}", style = MaterialTheme.typography.labelLarge)
            Text(record.task, style = MaterialTheme.typography.bodyLarge)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { onCancel(record) }) { Text("Отменить") }
                Button(onClick = { onRetry(record) }) { Text("Повторить отправку") }
            }
        }
    }
}

@Composable
private fun TaskTypesScreen(
    definitions: List<TaskTypeDefinition>,
    onBack: () -> Unit,
    onSave: (List<TaskTypeDefinition>) -> Unit
) {
    var items by remember(definitions) { mutableStateOf(definitions) }

    Scaffold(modifier = Modifier.edgeBackGesture(onBack)) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp, vertical = 10.dp)
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("‹ Назад") }
                Text("Типы задач", style = MaterialTheme.typography.headlineSmall)
            }

            Text(
                "Здесь можно полностью изменить набор типов: добавить, удалить или изменить код и описание.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 10.dp)
            )

            LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(items, key = { it.code }) { item ->
                    var code by remember(item.code) { mutableStateOf(item.code) }
                    var description by remember(item.code) { mutableStateOf(item.description) }

                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = code,
                                onValueChange = { value ->
                                    val newCode = value.take(10)
                                    code = newCode
                                    items = items.map { current ->
                                        if (current.code == item.code) current.copy(code = newCode) else current
                                    }
                                },
                                label = { Text("Тип") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            OutlinedTextField(
                                value = description,
                                onValueChange = { value ->
                                    description = value
                                    items = items.map { current ->
                                        if (current.code == code) current.copy(description = value) else current
                                    }
                                },
                                label = { Text("Описание") },
                                minLines = 2,
                                maxLines = 4,
                                modifier = Modifier.fillMaxWidth()
                            )
                            TextButton(
                                onClick = {
                                    if (items.size > 1) {
                                        items = items.filterNot { it.code == code }
                                    }
                                },
                                modifier = Modifier.align(Alignment.End)
                            ) { Text("Удалить") }
                        }
                    }
                }

                item {
                    OutlinedButton(
                        onClick = {
                            var base = "Новый"
                            var n = 1
                            while (items.any { it.code == base }) {
                                base = "Новый" + n++
                            }
                            items = items + TaskTypeDefinition(base, "")
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("＋ Добавить тип") }
                }
            }

            Button(
                onClick = {
                    val normalized = items.map {
                        TaskTypeDefinition(it.code.trim(), it.description.trim())
                    }.filter { it.code.isNotEmpty() }.distinctBy { it.code }
                    if (normalized.isNotEmpty()) onSave(normalized)
                },
                enabled = items.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
            ) { Text("Сохранить изменения") }
        }
    }
}

@Composable
private fun FilePickerDialog(
    state: MainUiState,
    onClose: () -> Unit,
    onLoadFolder: (String) -> Unit,
    onSelectFile: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Выбор файла Яндекс Диска") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(state.filePickerPath, style = MaterialTheme.typography.labelSmall)
                TextButton(onClick = { onLoadFolder("disk:/") }) { Text("К корню") }
                if (state.filePickerLoading) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else if (state.filePickerItems.isEmpty()) {
                    Text("В этой папке ничего нет.")
                } else {
                    LazyColumn(Modifier.fillMaxWidth().height(360.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        items(state.filePickerItems, key = { it.path }) { item ->
                            TextButton(
                                onClick = {
                                    if (item.type == "dir") onLoadFolder(item.path)
                                    else if (item.name.lowercase().endsWith(".xlsx")) onSelectFile(item.path)
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(if (item.type == "dir") "📁 " + item.name else "📄 " + item.name, modifier = Modifier.fillMaxWidth())
                            }
                        }
                    }
                }
                Text("Можно выбрать только XLSX-файл.", style = MaterialTheme.typography.labelSmall)
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Отмена") } }
    )
}

@Composable
private fun TaskCard(record: TaskRecord, onOpenAttachment: (TaskRecord) -> Unit = {}) {
    var expanded by rememberSaveable(record.id) { mutableStateOf(false) }

    Card(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("${momentLabel(record)}  •  ${record.taskType}", style = MaterialTheme.typography.labelMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (!record.attachmentName.isNullOrBlank()) {
                        Text(
                            "📎",
                            modifier = Modifier.clickable { onOpenAttachment(record) }.padding(horizontal = 6.dp),
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                    Text(
                        if ((record.difficulty ?: 0) == 0) "0" else "★".repeat(record.difficulty ?: 0),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
            Text(record.task, style = MaterialTheme.typography.bodyLarge, maxLines = if (expanded) Int.MAX_VALUE else 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AnalyticsScreen(
    records: List<TaskRecord>,
    loading: Boolean,
    error: String?,
    taskTypes: List<String>,
    onBack: () -> Unit,
    onRefresh: () -> Unit
) {
    val today = LocalDate.now()
    var fromText by remember { mutableStateOf(today.minusDays(19).format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))) }
    var toText by remember { mutableStateOf(today.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))) }
    var groupBy by remember { mutableStateOf(AnalyticsGroupBy.DATE) }
    var metric by remember { mutableStateOf(AnalyticsMetric.COUNT) }
    var chart by remember { mutableStateOf(AnalyticsChart.BAR) }
    var selectedTypes by remember { mutableStateOf(emptySet<String>()) }
    var minDifficulty by remember { mutableStateOf<Int?>(null) }
    var limitText by remember { mutableStateOf("20") }

    val formatter = remember { DateTimeFormatter.ofPattern("dd.MM.yyyy") }
    val from = fromText.trim().let { runCatching { LocalDate.parse(it, formatter) }.getOrNull() }
    val to = toText.trim().let { runCatching { LocalDate.parse(it, formatter) }.getOrNull() }
    val query = if (from != null && to != null && !from.isAfter(to)) {
        AnalyticsQuery(from, to, groupBy, metric, selectedTypes, minDifficulty, chart, limitText.toIntOrNull()?.coerceIn(1, 100) ?: 20)
    } else null
    val result = query?.let { AnalyticsEngine.calculate(records, it) }

    Scaffold(modifier = Modifier.edgeBackGesture(onBack)) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("‹ Назад") }
                Text("Аналитика", style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = onRefresh, enabled = !loading) { Text("Обновить") }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let {
                Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp))
                }
            }
            LazyColumn(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 16.dp)
            ) {
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Период", style = MaterialTheme.typography.titleMedium)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(value = fromText, onValueChange = { fromText = it.take(10) }, label = { Text("От") }, singleLine = true, modifier = Modifier.weight(1f))
                                OutlinedTextField(value = toText, onValueChange = { toText = it.take(10) }, label = { Text("До") }, singleLine = true, modifier = Modifier.weight(1f))
                            }
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(false, { fromText = today.minusDays(6).format(formatter); toText = today.format(formatter) }, label = { Text("7 дней") })
                                FilterChip(false, { fromText = today.minusDays(19).format(formatter); toText = today.format(formatter) }, label = { Text("20 дней") })
                                FilterChip(false, { fromText = today.withDayOfMonth(1).format(formatter); toText = today.format(formatter) }, label = { Text("Месяц") })
                                FilterChip(false, {
                                    val month = ((today.monthValue - 1) / 3) * 3 + 1
                                    val start = LocalDate.of(today.year, month, 1)
                                    fromText = start.format(formatter); toText = start.plusMonths(3).minusDays(1).format(formatter)
                                }, label = { Text("Квартал") })
                            }
                        }
                    }
                }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Что считаем", style = MaterialTheme.typography.titleMedium)
                            Text("Группировка", style = MaterialTheme.typography.labelLarge)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                AnalyticsGroupBy.values().forEach { option ->
                                    FilterChip(groupBy == option, { groupBy = option }, label = { Text(option.title) })
                                }
                            }
                            Text("Показатель", style = MaterialTheme.typography.labelLarge)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                AnalyticsMetric.values().forEach { option ->
                                    FilterChip(metric == option, { metric = option }, label = { Text(option.title) })
                                }
                            }
                            Text("График", style = MaterialTheme.typography.labelLarge)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                AnalyticsChart.values().forEach { option ->
                                    FilterChip(chart == option, { chart = option }, label = { Text(option.title) })
                                }
                            }
                            OutlinedTextField(
                                value = limitText,
                                onValueChange = { limitText = it.filter(Char::isDigit).take(3) },
                                label = { Text("Максимум строк для рейтинга") },
                                supportingText = { Text("Применяется к группировке «Задача»") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Фильтр по типу задачи", style = MaterialTheme.typography.titleMedium)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(selectedTypes.isEmpty(), { selectedTypes = emptySet() }, label = { Text("Все") })
                                taskTypes.forEach { type ->
                                    FilterChip(selectedTypes.contains(type), {
                                        selectedTypes = if (selectedTypes.contains(type)) selectedTypes - type else selectedTypes + type
                                    }, label = { Text(type) })
                                }
                            }
                            Text("Минимальная сложность", style = MaterialTheme.typography.labelLarge)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(minDifficulty == null, { minDifficulty = null }, label = { Text("Любая") })
                                (1..5).forEach { level ->
                                    FilterChip(minDifficulty == level, { minDifficulty = level }, label = { Text("≥ $level") })
                                }
                            }
                        }
                    }
                }
                item {
                    if (query == null) {
                        Text("Проверьте даты: используйте формат ДД.ММ.ГГГГ.")
                    } else if (result != null) {
                        AnalyticsSummary(result)
                    }
                }
                item {
                    if (query != null && result != null && result.buckets.isNotEmpty()) {
                        AnalyticsVisualization(result, query)
                    } else if (query != null) {
                        Card(Modifier.fillMaxWidth()) { Text("За выбранный период данных нет.", Modifier.padding(16.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun AnalyticsSummary(result: ru.krista.photoday.analytics.AnalyticsResult) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Сводка", style = MaterialTheme.typography.titleMedium)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Задач: ${result.totalTasks}")
                Text("Сложность: ${result.totalDifficulty}")
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Средняя: ${"%.2f".format(java.util.Locale.getDefault(), result.averageDifficulty)}")
                Text("Максимум: ${result.maxDifficulty}")
            }
        }
    }
}

@Composable
private fun AnalyticsVisualization(
    result: ru.krista.photoday.analytics.AnalyticsResult,
    query: AnalyticsQuery
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Результат", style = MaterialTheme.typography.titleMedium)
            when (query.chart) {
                AnalyticsChart.BAR -> AnalyticsVicoChart(result.buckets, line = false)
                AnalyticsChart.LINE -> AnalyticsVicoChart(result.buckets, line = true)
                AnalyticsChart.TABLE -> AnalyticsTable(result.buckets, query.groupBy)
            }
        }
    }
}

@Composable
private fun AnalyticsVicoChart(
    buckets: List<ru.krista.photoday.analytics.AnalyticsBucket>,
    line: Boolean
) {
    val visible = buckets.take(if (line) 60 else 40)
    val modelProducer = remember { CartesianChartModelProducer() }

    LaunchedEffect(visible, line) {
        modelProducer.runTransaction {
            if (line) {
                lineModel { series(visible.map { it.value }) }
            } else {
                columnModel { series(visible.map { it.value }) }
            }
        }
    }

    val zoomState = rememberVicoZoomState(
        zoomEnabled = visible.size > 6,
        initialZoom = if (visible.size > 12) {
            com.patrykandpatrick.vico.compose.cartesian.Zoom.fixed(0.65f)
        } else {
            com.patrykandpatrick.vico.compose.cartesian.Zoom.Content
        }
    )
    val scrollState = rememberVicoScrollState(
        scrollEnabled = visible.size > 10
    )

    val labels = remember(visible) {
        visible.mapIndexed { index, bucket -> index to bucket.label }
    }

    val bottomAxis = HorizontalAxis.rememberBottom(
        valueFormatter = { _, value, _ ->
            labels.getOrNull(value.toInt())?.second ?: ""
        },
        guideline = null
    )

    CartesianChartHost(
        chart = rememberCartesianChart(
            if (line) rememberLineCartesianLayer() else rememberColumnCartesianLayer(),
            startAxis = VerticalAxis.rememberStart(),
            bottomAxis = bottomAxis
        ),
        modelProducer = modelProducer,
        modifier = Modifier
            .fillMaxWidth()
            .height(270.dp),
        zoomState = zoomState,
        scrollState = scrollState
    )

    Text(
        "Потяните график для прокрутки; щипок — масштаб.",
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.padding(top = 4.dp)
    )
}

@Composable
private fun AnalyticsTable(
    buckets: List<ru.krista.photoday.analytics.AnalyticsBucket>,
    groupBy: AnalyticsGroupBy
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(if (groupBy == AnalyticsGroupBy.TASK) "Задача" else "Группа", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
            Text("Значение", Modifier.width(80.dp), style = MaterialTheme.typography.labelLarge)
            Text("Задач", Modifier.width(55.dp), style = MaterialTheme.typography.labelLarge)
        }
        buckets.take(100).forEach { bucket ->
            HorizontalDivider()
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(bucket.label, maxLines = 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                    if (groupBy == AnalyticsGroupBy.TASK) {
                        bucket.tasks.firstOrNull()?.let { task ->
                            Text("${task.date ?: ""} • ${task.taskType}", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                Text(
                    if (bucket.value % 1.0 == 0.0) "${bucket.value.toInt()}" else "${"%.2f".format(java.util.Locale.getDefault(), bucket.value)}",
                    Modifier.width(80.dp), style = MaterialTheme.typography.bodySmall
                )
                Text(bucket.count.toString(), Modifier.width(55.dp), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun AddTaskCard(
    taskTypes: List<String>,
    onDismiss: () -> Unit,
    onSave: (String, Int, String, LocalDate, LocalTime, android.net.Uri?) -> Unit
) {
    var type by remember(taskTypes) { mutableStateOf(taskTypes.firstOrNull() ?: "") }
    var attachmentUri by remember { mutableStateOf<android.net.Uri?>(null) }
    val attachmentLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        attachmentUri = uri
    }
    var difficulty by remember { mutableIntStateOf(0) }
    var text by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var time by remember { mutableStateOf(LocalTime.now().withSecond(0).withNano(0)) }
    var dateTimeDialogOpen by remember { mutableStateOf(false) }

    val dateFormatter = remember { DateTimeFormatter.ofPattern("dd.MM.yyyy") }
    val timeFormatter = remember { DateTimeFormatter.ofPattern("HH:mm") }

    Card(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).edgeBackGesture(onDismiss),
        shape = RoundedCornerShape(16.dp)
    ) {
        // Форма прокручивается: на невысоких экранах кнопка «Сохранить» остаётся доступной.
        Column(
            Modifier.padding(14.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Новая задача", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onDismiss) { Text("Отмена") }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "${date.format(dateFormatter)}  •  ${time.format(timeFormatter)}  •  $type",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(if (difficulty == 0) "0" else "★".repeat(difficulty), style = MaterialTheme.typography.labelMedium)
            }
            OutlinedButton(
                onClick = { dateTimeDialogOpen = true },
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text("🗓 Изменить дату и время")
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                taskTypes.forEach { value ->
                    Text(
                        if (value == type) "[$value]" else value,
                        modifier = Modifier.clickable { type = value }.padding(horizontal = 7.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
            Row(
                Modifier.fillMaxWidth().height(50.dp).pointerInput(Unit) {
                    detectHorizontalDragGestures { change, _ ->
                        val width = size.width.coerceAtLeast(1)
                        difficulty = ((change.position.x / width) * 6f).toInt().coerceIn(0, 5)
                        change.consume()
                    }
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Text("0", Modifier.clickable { difficulty = 0 }.padding(8.dp))
                (1..5).forEach { level ->
                    Text(if (level <= difficulty) "★" else "☆", Modifier.size(38.dp).clickable { difficulty = level }, style = MaterialTheme.typography.headlineSmall)
                }
            }
            OutlinedButton(
                onClick = { attachmentLauncher.launch(arrayOf("image/*")) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (attachmentUri == null) "＋ Фото / скриншот" else "📎 Фото прикреплено")
            }
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("Описание задачи") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 8,
                maxLines = 14
            )
            Button(
                onClick = { onSave(type, difficulty, text, date, time, attachmentUri) },
                enabled = text.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Сохранить")
            }
        }
    }

    if (dateTimeDialogOpen) {
        TaskDateTimeDialog(
            initialDate = date,
            initialTime = time,
            onDismiss = { dateTimeDialogOpen = false },
            onConfirm = { newDate, newTime ->
                date = newDate
                time = newTime
                dateTimeDialogOpen = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskDateTimeDialog(
    initialDate: LocalDate,
    initialTime: LocalTime,
    onDismiss: () -> Unit,
    onConfirm: (LocalDate, LocalTime) -> Unit
) {
    val dateFormatter = remember { DateTimeFormatter.ofPattern("dd.MM.yyyy") }
    val timeFormatter = remember { DateTimeFormatter.ofPattern("HH:mm") }
    var date by remember(initialDate) { mutableStateOf(initialDate) }
    var time by remember(initialTime) { mutableStateOf(initialTime) }
    var datePickerOpen by remember { mutableStateOf(false) }
    var timePickerOpen by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Дата и время записи") },
        text = {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    "Если задача не была внесена сразу, укажите прошедшую дату и время — запись сохранится в таблице с этой отметкой.",
                    style = MaterialTheme.typography.bodySmall
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { datePickerOpen = true }, modifier = Modifier.weight(1f)) {
                        Text("📅 " + date.format(dateFormatter))
                    }
                    OutlinedButton(onClick = { timePickerOpen = true }, modifier = Modifier.weight(1f)) {
                        Text("🕒 " + time.format(timeFormatter))
                    }
                }
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    FilterChip(
                        selected = false,
                        onClick = {
                            val now = LocalTime.now().withSecond(0).withNano(0)
                            date = LocalDate.now()
                            time = now
                        },
                        label = { Text("Сейчас") }
                    )
                    FilterChip(
                        selected = false,
                        onClick = { date = LocalDate.now() },
                        label = { Text("Сегодня") }
                    )
                    FilterChip(
                        selected = false,
                        onClick = { date = LocalDate.now().minusDays(1) },
                        label = { Text("Вчера") }
                    )
                    FilterChip(
                        selected = false,
                        onClick = { date = LocalDate.now().minusDays(2) },
                        label = { Text("Позавчера") }
                    )
                }
                Text(
                    "В таблицу попадёт: ${date.format(dateFormatter)} (${TaskMoment.weekday(date)}), " +
                        "${time.format(timeFormatter)}, ${TaskMoment.partOfDay(time)}.",
                    style = MaterialTheme.typography.labelSmall
                )
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(date, time) }) { Text("Готово") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Отмена") }
        }
    )

    if (datePickerOpen) {
        val datePickerState = rememberDatePickerState(
            // DatePicker работает в UTC-полуночи, поэтому дата передаётся и читается через UTC.
            initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { datePickerOpen = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    datePickerOpen = false
                }) { Text("ОК") }
            },
            dismissButton = {
                TextButton(onClick = { datePickerOpen = false }) { Text("Отмена") }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (timePickerOpen) {
        val timePickerState = rememberTimePickerState(
            initialHour = time.hour,
            initialMinute = time.minute,
            is24Hour = true
        )
        AlertDialog(
            onDismissRequest = { timePickerOpen = false },
            title = { Text("Время записи") },
            text = {
                Column(
                    Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    TimeInput(state = timePickerState)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    time = LocalTime.of(timePickerState.hour, timePickerState.minute)
                    timePickerOpen = false
                }) { Text("ОК") }
            },
            dismissButton = {
                TextButton(onClick = { timePickerOpen = false }) { Text("Отмена") }
            }
        )
    }
}
