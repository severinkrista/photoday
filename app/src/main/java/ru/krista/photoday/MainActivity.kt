package ru.krista.photoday

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ru.krista.photoday.domain.TaskRecord
import ru.krista.photoday.presentation.MainUiState
import ru.krista.photoday.presentation.MainViewModel
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

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
    var code by remember { mutableStateOf("") }

    MaterialTheme {
        if (showSettings) {
            SettingsScreen(
                state = state,
                onBack = { showSettings = false },
                onDaysChanged = vm::setDaysToShow,
                onSelectFile = vm::openFilePicker
            )
        } else {
            MainScreen(
                state = state,
                onSettings = { showSettings = true },
                onRefresh = vm::refresh,
                onAdd = { showAdd = true },
                onRetryPending = vm::retryPendingTask,
                onCancelPending = vm::cancelPendingTask,
                onConnect = {
                    uriHandler.openUri(vm.authorizationUrl())
                    showCode = true
                }
            )
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
            onDismiss = { showAdd = false },
            onSave = { type, difficulty, text ->
                showAdd = false
                vm.addTask(type, difficulty, text)
            }
        )
    }
}

@Composable
private fun MainScreen(
    state: MainUiState,
    onSettings: () -> Unit,
    onRefresh: () -> Unit,
    onAdd: () -> Unit,
    onRetryPending: (TaskRecord) -> Unit,
    onCancelPending: (TaskRecord) -> Unit,
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
                        Text("Последние ${state.daysToShow} дн.", style = MaterialTheme.typography.labelMedium)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (state.isConnected) TextButton(onClick = onRefresh) { Text("Обновить") }
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

                LazyColumn(
                    Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.records) { TaskCard(it) }
                }


                Button(onClick = onAdd, Modifier.fillMaxWidth()) { Text("＋ Новая задача") }            }
        }
    }
}

@Composable
private fun SettingsScreen(
    state: MainUiState,
    onBack: () -> Unit,
    onDaysChanged: (Int) -> Unit,
    onSelectFile: () -> Unit
) {
    var value by remember(state.daysToShow) { mutableStateOf(state.daysToShow.toString()) }

    Scaffold { padding ->
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
                    OutlinedTextField(
                        value = value,
                        onValueChange = { value = it.filter(Char::isDigit).take(3) },
                        label = { Text("Количество дней") },
                        supportingText = { Text("Показывать записи за последние N дней") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { value.toIntOrNull()?.takeIf { it > 0 }?.let(onDaysChanged) },
                        enabled = value.toIntOrNull()?.let { it > 0 && it != state.daysToShow } == true,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Сохранить") }
                }
            }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Подключение", style = MaterialTheme.typography.titleMedium)
                    Text(if (state.isConnected) "Яндекс Диск подключён" else "Яндекс Диск не подключён")
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
            Text("${record.date ?: ""}  ${record.time?.format(DateTimeFormatter.ofPattern("HH:mm")) ?: ""}  •  ${record.partOfDay}", style = MaterialTheme.typography.labelMedium)
            Text("${record.taskType}   ${if ((record.difficulty ?: 0) == 0) "0" else "★".repeat(record.difficulty ?: 0)}", style = MaterialTheme.typography.labelLarge)
            Text(record.task, style = MaterialTheme.typography.bodyLarge)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { onCancel(record) }) { Text("Отменить") }
                Button(onClick = { onRetry(record) }) { Text("Повторить отправку") }
            }
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
private fun TaskCard(record: TaskRecord) {
    var expanded by rememberSaveable(record.id) { mutableStateOf(false) }

    Card(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${record.date ?: ""}  ${record.time?.format(DateTimeFormatter.ofPattern("HH:mm")) ?: ""}  •  ${record.partOfDay}", style = MaterialTheme.typography.labelMedium)
            Text("${record.taskType}   ${if ((record.difficulty ?: 0) == 0) "0" else "★".repeat(record.difficulty ?: 0)}", style = MaterialTheme.typography.labelLarge)
            Text(record.task, style = MaterialTheme.typography.bodyLarge, maxLines = if (expanded) Int.MAX_VALUE else 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun AddTaskCard(
    onDismiss: () -> Unit,
    onSave: (String, Int, String) -> Unit
) {
    var type by remember { mutableStateOf("Р") }
    var difficulty by remember { mutableIntStateOf(0) }
    var text by remember { mutableStateOf("") }

    val date = LocalDate.now()
    val time = LocalTime.now()
    val timePart = when (time.hour) {
        in 0..7 -> "До начала рабочего дня"
        in 8..11 -> "Утро"
        in 12..14 -> "Обед"
        in 15..17 -> "Вечер"
        else -> "После конца рабочего дня"
    }
    val descriptions = mapOf(
        "У" to "Управленческие", "Р" to "Рутинные рабочие", "ОК" to "Вся компания",
        "Л" to "Личные", "ЗП" to "Зарплата / премия", "ГК" to "Гос. контракты", "КК" to "КристаКоманда"
    )

    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Новая задача", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onDismiss) { Text("Отмена") }
            }
            Text("${date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))}  •  ${time.format(DateTimeFormatter.ofPattern("HH:mm"))}  •  $timePart", style = MaterialTheme.typography.labelMedium)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("У","Р","ОК","Л","ЗП","ГК","КК").forEach { value ->
                    Text(
                        if (value == type) "[$value]" else value,
                        modifier = Modifier.clickable { type = value }.padding(horizontal = 7.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
            Text(descriptions[type].orEmpty(), style = MaterialTheme.typography.labelSmall)
            Text("Сложность: ${if (difficulty == 0) "0" else "★".repeat(difficulty)}")
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
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("Описание задачи") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 8,
                maxLines = 14
            )
            Button(onClick = { onSave(type, difficulty, text) }, enabled = text.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                Text("Сохранить")
            }
        }
    }
}
