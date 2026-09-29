package ru.krista.photoday

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ru.krista.photoday.domain.TaskRecord
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
    var code by remember { mutableStateOf("") }

    MaterialTheme {
        Scaffold { padding ->
            Column(
                Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Фото дня", style = MaterialTheme.typography.headlineSmall)
                    if (state.isConnected) { Row { TextButton(onClick = vm::openFilePicker) { Text("Файл") }; TextButton(onClick = vm::refresh) { Text("Обновить") } } }
                }

                state.errorMessage?.let { errorText ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            SelectionContainer {
                                Text(
                                    errorText,
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            val context = LocalContext.current
                            TextButton(
                                onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    clipboard.setPrimaryClip(ClipData.newPlainText("Ошибка Фото дня", errorText))
                                }
                            ) { Text("Копировать ошибку") }
                        }
                    }
                }

                if (!state.isConnected) {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("Яндекс Диск", style = MaterialTheme.typography.titleMedium)
                            Text("Подключите свой аккаунт, чтобы читать и изменять photoday.xlsx.")
                            Button(onClick = {
                                uriHandler.openUri(vm.authorizationUrl())
                                showCode = true
                            }, Modifier.fillMaxWidth()) { Text("Подключить Яндекс") }
                        }
                    }
                } else {
                    Text("Файл: " + state.selectedPath.substringAfterLast("/").ifBlank { state.selectedPath }, style = MaterialTheme.typography.bodySmall)
                    Button(onClick = { showAdd = true }, Modifier.fillMaxWidth()) {
                        Text("＋ Новая задача")
                    }
                    if (state.isLoading) {
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    }
                    if (!state.isLoading && state.records.isEmpty()) {
                        Text("За выбранный период записей нет.")
                    }
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(state.records, key = { it.id ?: "${it.date}-${it.time}-${it.task}" }) { TaskCard(it) }
                    }
                }
            }
        }
    }

    if (state.filePickerOpen) {
        AlertDialog(
            onDismissRequest = vm::closeFilePicker,
            title = { Text("Выбор файла Яндекс Диска") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(state.filePickerPath, style = MaterialTheme.typography.labelSmall)
                    TextButton(onClick = { vm.loadFolder("disk:/") }) { Text("К корню") }
                    if (state.filePickerLoading) { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                    else if (state.filePickerItems.isEmpty()) { Text("В этой папке ничего нет.") }
                    else {
                        LazyColumn(Modifier.fillMaxWidth().height(360.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            items(state.filePickerItems, key = { it.path }) { item ->
                                TextButton(onClick = { if (item.type == "dir") vm.loadFolder(item.path) else if (item.name.lowercase().endsWith(".xlsx")) vm.selectFile(item.path) }, modifier = Modifier.fillMaxWidth()) {
                                    Text(if (item.type == "dir") "📁 " + item.name else "📄 " + item.name, modifier = Modifier.fillMaxWidth())
                                }
                            }
                        }
                    }
                    Text("Можно выбрать только XLSX-файл.", style = MaterialTheme.typography.labelSmall)
                }
            },
            confirmButton = { TextButton(onClick = vm::closeFilePicker) { Text("Отмена") } }
        )
    }
    if (showCode) {
        AlertDialog(
            onDismissRequest = { showCode = false },
            title = { Text("Код Яндекс OAuth") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("После подтверждения Яндекс откроет страницу перенаправления. Скопируйте с неё код целиком и вставьте сюда. Код может содержать буквы и цифры.")
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
private fun TaskCard(record: TaskRecord) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "${record.date ?: ""}  ${record.time?.format(DateTimeFormatter.ofPattern("HH:mm")) ?: ""}  •  ${record.partOfDay}",
                style = MaterialTheme.typography.labelMedium
            )
            Text(
                "${record.taskType}   ${if ((record.difficulty ?: 0) == 0) "0" else "★".repeat(record.difficulty ?: 0)}",
                style = MaterialTheme.typography.labelLarge
            )
            Text(record.task, style = MaterialTheme.typography.bodyLarge)
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
        "У" to "Управленческие",
        "Р" to "Рутинные рабочие",
        "ОК" to "Вся компания",
        "Л" to "Личные",
        "ЗП" to "Зарплата / премия",
        "ГК" to "Гос. контракты",
        "КК" to "КристаКоманда"
    )

    Card(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Новая задача", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onDismiss) { Text("Отмена") }
            }

            Text(
                "${date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))}  •  ${time.format(DateTimeFormatter.ofPattern("HH:mm"))}  •  $timePart",
                style = MaterialTheme.typography.labelMedium
            )

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                listOf("У","Р","ОК","Л","ЗП","ГК","КК").forEach { value ->
                    Text(
                        if (value == type) "[$value]" else value,
                        modifier = Modifier
                            .clickable { type = value }
                            .padding(horizontal = 7.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
            Text(descriptions[type].orEmpty(), style = MaterialTheme.typography.labelSmall)

            Text("Сложность: ${if (difficulty == 0) "0" else "★".repeat(difficulty)}")

            Row(
                Modifier.fillMaxWidth()
                    .height(50.dp)
                    .pointerInput(Unit) {
                        detectHorizontalDragGestures { change, _ ->
                            val width = size.width.coerceAtLeast(1)
                            difficulty = ((change.position.x / width) * 6f).toInt().coerceIn(0, 5)
                            change.consume()
                        }
                    },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Text(
                    "0",
                    Modifier.clickable { difficulty = 0 }.padding(8.dp)
                )
                (1..5).forEach { level ->
                    Text(
                        if (level <= difficulty) "★" else "☆",
                        Modifier.size(38.dp).clickable { difficulty = level },
                        style = MaterialTheme.typography.headlineSmall
                    )
                }
            }

            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("Описание задачи") },
                modifier = Modifier.fillMaxWidth().weight(1f, fill = false),
                minLines = 8,
                maxLines = 14
            )

            Button(
                onClick = { onSave(type, difficulty, text) },
                enabled = text.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Сохранить") }
        }
    }
}