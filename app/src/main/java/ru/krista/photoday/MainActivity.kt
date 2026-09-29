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
import androidx.lifecycle.viewmodel.compose.viewModel
import ru.krista.photoday.data.TaskTypeDefinition
import ru.krista.photoday.domain.TaskRecord
import ru.krista.photoday.presentation.MainUiState
import ru.krista.photoday.presentation.MainViewModel
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

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
    var code by remember { mutableStateOf("") }

    val goBack = {
        when {
            showCode -> showCode = false
            showAdd -> showAdd = false
            showTaskTypes -> showTaskTypes = false
            showSettings -> showSettings = false
            state.filePickerOpen -> vm.closeFilePicker()
        }
    }
    BackHandler(enabled = state.attachmentPreview != null || showTaskTypes || showSettings || showAdd || showCode || state.filePickerOpen) {
        if (state.attachmentPreview != null) vm.closeAttachment() else goBack()
    }

    MaterialTheme {
        when {
            showTaskTypes -> TaskTypesScreen(
                definitions = state.taskTypeDefinitions,
                onBack = { showTaskTypes = false },
                onSave = vm::setTaskTypeDefinitions
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
                onRefresh = vm::refresh,
                onAdd = { showAdd = true },
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
            onSave = { type, difficulty, text, attachmentUri ->
                showAdd = false
                vm.addTask(type, difficulty, text, attachmentUri)
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScreen(
    state: MainUiState,
    onSettings: () -> Unit,
    onRefresh: () -> Unit,
    onAdd: () -> Unit,
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
                Text("${record.date ?: ""}  •  ${record.taskType}", style = MaterialTheme.typography.labelMedium)
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

@Composable
private fun AddTaskCard(
    taskTypes: List<String>,
    onDismiss: () -> Unit,
    onSave: (String, Int, String, android.net.Uri?) -> Unit
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

    val date = LocalDate.now()
    val time = LocalTime.now()

    Card(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).edgeBackGesture(onDismiss),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Новая задача", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onDismiss) { Text("Отмена") }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("${date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))}  •  $type", style = MaterialTheme.typography.labelMedium)
                Text(if (difficulty == 0) "0" else "★".repeat(difficulty), style = MaterialTheme.typography.labelMedium)
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
            Button(onClick = { onSave(type, difficulty, text, attachmentUri) }, enabled = text.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                Text("Сохранить")
            }
        }
    }
}
