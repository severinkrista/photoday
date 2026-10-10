package ru.krista.photoday

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import ru.krista.photoday.data.YandexDiskClient
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private data class ReflectionQuestion(val id: String, val title: String, val text: String, val fileTitle: String)
private data class ReflectionEntry(
    val question: ReflectionQuestion,
    val audioPath: String?,
    val questionUploaded: Boolean = false,
    val audioUploaded: Boolean = false,
    val recording: Boolean = false,
    val error: String? = null
) {
    val complete get() = audioPath != null && questionUploaded && audioUploaded
}

private class DailyReflectionStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("daily_reflection_v1", Context.MODE_PRIVATE)
    private val dir = File(context.filesDir, "daily-reflection").apply { mkdirs() }
    private val today get() = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy.MM.dd"))
    private fun key() = "session_$today"

    fun load(fallback: List<ReflectionQuestion>): List<ReflectionEntry> {
        val raw = prefs.getString(key(), null) ?: return fallback.map { ReflectionEntry(it, null) }
        return runCatching {
            val array = JSONArray(raw)
            val stored = (0 until array.length()).associateBy({ array.getJSONObject(it).getString("id") }, { array.getJSONObject(it) })
            fallback.map { q ->
                val item = stored[q.id]
                ReflectionEntry(
                    q,
                    item?.optString("audioPath")?.takeIf { it.isNotBlank() && it != "null" },
                    item?.optBoolean("questionUploaded", false) ?: false,
                    item?.optBoolean("audioUploaded", false) ?: false
                )
            }
        }.getOrElse { fallback.map { ReflectionEntry(it, null) } }
    }

    fun save(entries: List<ReflectionEntry>) {
        val array = JSONArray()
        entries.forEach { e ->
            array.put(JSONObject().put("id", e.question.id)
                .put("audioPath", e.audioPath ?: "")
                .put("questionUploaded", e.questionUploaded)
                .put("audioUploaded", e.audioUploaded))
        }
        prefs.edit().putString(key(), array.toString()).apply()
    }

    fun newAudioFile(id: String): File = File(dir, "${today}_${id}.m4a")
    fun questionFile(entry: ReflectionEntry): File = File(dir, "${today}_${entry.question.id}_question.txt").apply {
        writeText("Вопрос: ${entry.question.text}\nДата: ${today}\n", Charsets.UTF_8)
    }
}

private class ReflectionRecorder {
    private var recorder: MediaRecorder? = null
    @Suppress("DEPRECATION")
    private fun createRecorder(context: Context): MediaRecorder =
        if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()

    fun start(context: Context, file: File) {
        stopQuietly()
        val r = createRecorder(context)
        r.setAudioSource(MediaRecorder.AudioSource.MIC)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioEncodingBitRate(96000)
        r.setAudioSamplingRate(44100)
        r.setOutputFile(file.absolutePath)
        r.prepare()
        r.start()
        recorder = r
    }
    fun stop(): Boolean {
        val r = recorder ?: return false
        return try { r.stop(); true } catch (_: Exception) { false } finally {
            runCatching { r.reset() }; runCatching { r.release() }; recorder = null
        }
    }
    fun stopQuietly() { recorder?.let { runCatching { it.stop() }; runCatching { it.release() } }; recorder = null }
}

private fun fallbackReflectionQuestions() = listOf(
    ReflectionQuestion("main-result", "Главный результат", "Что сегодня удалось сделать важного? Назови конкретный результат, пример, цифру или завершённую задачу.", "Главный результат"),
    ReflectionQuestion("difficult", "Сложность", "Что сегодня было самым трудным или потребовало от меня больше всего усилий? Что именно пришлось сделать?", "Сложность"),
    ReflectionQuestion("people", "Люди и взаимодействие", "С кем сегодня было важное взаимодействие? О чём договорились, кому помог я и кто помог мне?", "Люди и взаимодействие"),
    ReflectionQuestion("new", "Новое", "Что нового я сегодня узнал, понял или попробовал? Где это может пригодиться?", "Новое"),
    ReflectionQuestion("feelings", "Состояние", "Как я себя сегодня чувствовал? Что давало энергию, что раздражало, тревожило или радовало — и почему?", "Состояние"),
    ReflectionQuestion("unexpected", "Неожиданное", "Что сегодня пошло не по плану или оказалось неожиданным? Как я отреагировал и чем всё закончилось?", "Неожиданное"),
    ReflectionQuestion("improve", "Улучшение", "Что завтра стоит сделать иначе? Есть ли конкретный следующий шаг, который я хочу не забыть?", "Улучшение"),
    ReflectionQuestion("proud", "Чем горжусь", "За что я могу себя сегодня похвалить, даже если день был непростым? В чём конкретно проявились мои усилия или качества?", "Чем горжусь"),
    ReflectionQuestion("unfinished", "Открытые вопросы", "Что осталось незавершённым или требует решения? Назови дату, срок, человека или следующий шаг, если они уже известны.", "Открытые вопросы"),
    ReflectionQuestion("free-thought", "Свободная мысль", "О чём ещё мне важно рассказать, чтобы этот день не забылся?", "Свободная мысль")
)

private fun parseReflectionQuestions(bytes: ByteArray): List<ReflectionQuestion> {
    val root = JSONObject(String(bytes, Charsets.UTF_8))
    val array = root.getJSONArray("questions")
    return (0 until array.length()).mapNotNull { i ->
        val q = array.getJSONObject(i)
        if (!q.optBoolean("enabled", true)) null else ReflectionQuestion(
            q.getString("id"), q.optString("title", q.getString("id")),
            q.getString("question"), q.optString("filename", q.optString("title", q.getString("id")))
        )
    }.ifEmpty { fallbackReflectionQuestions() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DailyReflectionScreen(
    disk: YandexDiskClient,
    connected: Boolean,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { DailyReflectionStore(context) }
    val recorder = remember { ReflectionRecorder() }
    var entries by remember { mutableStateOf(store.load(fallbackReflectionQuestions())) }
    var loadingQuestions by remember { mutableStateOf(true) }
    var sending by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var recordingId by remember { mutableStateOf<String?>(null) }
    var showCancelConfirm by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) message = "Для записи ответа нужно разрешить доступ к микрофону в настройках приложения."
    }

    DisposableEffect(Unit) {
        onDispose { recorder.stopQuietly() }
    }

    LaunchedEffect(connected) {
        loadingQuestions = true
        if (connected) {
            val parent = disk.currentPath().substringBeforeLast("/", "")
            val folder = if (parent.isBlank()) "" else "$parent/Итоги дня"
            if (folder.isNotBlank()) {
                val remote = disk.downloadFile("$folder/questions.json").getOrNull()
                val bundled = if (remote == null) runCatching {
                    context.assets.open("daily-reflection/questions.json").use { it.readBytes() }
                }.getOrNull() else null
                val bytes = remote ?: bundled
                if (remote == null && bundled != null) {
                    runCatching {
                        disk.ensureFolder(folder).getOrThrow()
                        disk.uploadAttachment("$folder/questions.json", bundled, "application/json; charset=utf-8").getOrThrow()
                    }.onFailure { message = "Не удалось разместить questions.json на Яндекс Диске: ${it.message}" }
                }
                bytes?.let { data ->
                    runCatching { parseReflectionQuestions(data) }.onSuccess { questions ->
                        val old = entries.associateBy { it.question.id }
                        entries = questions.map { q -> old[q.id]?.copy(question = q) ?: ReflectionEntry(q, null) }
                        store.save(entries)
                    }.onFailure { message = "Не удалось прочитать questions.json: ${it.message}" }
                }
            }
        }
        loadingQuestions = false
    }

    fun persist(updated: List<ReflectionEntry>) {
        entries = updated
        store.save(updated)
    }

    fun beginRecording(entry: ReflectionEntry) {
        if (!connected) { message = "Сначала подключите Яндекс Диск в настройках приложения."; return }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        runCatching {
            val file = store.newAudioFile(entry.question.id)
            recorder.start(context, file)
            recordingId = entry.question.id
            persist(entries.map { it.copy(recording = it.question.id == entry.question.id, error = null) })
        }.onFailure { message = "Не удалось начать запись: ${it.message ?: "неизвестная ошибка"}" }
    }

    fun stopRecording() {
        val id = recordingId ?: return
        val success = recorder.stop()
        recordingId = null
        val entry = entries.firstOrNull { it.question.id == id }
        val file = store.newAudioFile(id)
        if (success && file.exists() && file.length() > 1024) {
            persist(entries.map { if (it.question.id == id) it.copy(audioPath = file.absolutePath, recording = false, audioUploaded = false, error = null) else it.copy(recording = false) })
            message = "Ответ сохранён на устройстве."
        } else {
            file.delete()
            persist(entries.map { it.copy(recording = false) })
            message = "Запись не сохранилась. Попробуйте ещё раз."
        }
    }

    suspend fun uploadFile(entry: ReflectionEntry, audio: Boolean) {
        val parent = disk.currentPath().substringBeforeLast("/", "")
        if (parent.isBlank()) error("Не удалось определить папку рядом с photoday.xlsx")
        val root = "$parent/Итоги дня"
        val dateFolder = "$root/${LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy.MM.dd"))}"
        disk.ensureFolder(root).getOrThrow()
        disk.ensureFolder(dateFolder).getOrThrow()
        val safeTitle = entry.question.fileTitle.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(70)
        val fileName = "${entries.indexOfFirst { it.question.id == entry.question.id }.plus(1).toString().padStart(2, '0')} — $safeTitle — " + if (audio) "ответ.m4a" else "вопрос.txt"
        val bytes = if (audio) {
            val path = entry.audioPath ?: error("Сначала запишите ответ")
            File(path).takeIf { it.exists() }?.readBytes() ?: error("Локальный файл записи не найден")
        } else {
            "Вопрос: ${entry.question.text}\nДата: ${LocalDate.now()}\n".toByteArray(Charsets.UTF_8)
        }
        disk.uploadAttachment("$dateFolder/$fileName", bytes, if (audio) "audio/mp4" else "text/plain; charset=utf-8").getOrThrow()
        persist(entries.map { e ->
            if (e.question.id == entry.question.id) {
                if (audio) e.copy(audioUploaded = true, error = null) else e.copy(questionUploaded = true, error = null)
            } else e
        })
    }

    Scaffold(modifier = Modifier.fillMaxSize()) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 14.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onBack) { Text("‹ Назад", fontSize = 18.sp) }
                Text("Итоги дня", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                TextButton(onClick = { showCancelConfirm = true }) { Text("Отмена", fontSize = 16.sp) }
            }
            Text("Записи сохраняются на устройстве. Отправленные файлы повторно не загружаются.", style = MaterialTheme.typography.bodySmall)
            if (loadingQuestions) LinearProgressIndicator(Modifier.fillMaxWidth())
            message?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 6.dp)) }
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                itemsIndexed(entries, key = { _, e -> e.question.id }) { index, entry ->
                    val uploaded = entry.complete
                    val color = if (uploaded) Color(0xFF188038) else MaterialTheme.colorScheme.onSurface
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = if (uploaded) Color(0xFFE8F5E9) else MaterialTheme.colorScheme.surfaceVariant
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("${index + 1}. ${entry.question.title}", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = color, modifier = Modifier.weight(1f))
                                if (uploaded) Text("✓ Передано", color = Color(0xFF188038), fontWeight = FontWeight.Bold)
                            }
                            Text(entry.question.text, fontSize = 22.sp, lineHeight = 29.sp, color = color)
                            if (entry.recording) {
                                Text("● Идёт запись…", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                                Button(onClick = { stopRecording() }, modifier = Modifier.fillMaxWidth()) { Text("■ Стоп", fontSize = 18.sp) }
                            } else {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = { beginRecording(entry) },
                                        enabled = !sending,
                                        modifier = Modifier.weight(1f)
                                    ) { Text(if (entry.audioPath == null) "● Запись" else "● Записать заново", fontSize = 16.sp) }
                                    OutlinedButton(
                                        onClick = {
                                            if (recordingId == entry.question.id) stopRecording()
                                            val file = entry.audioPath?.let(::File)
                                            file?.delete()
                                            persist(entries.map { if (it.question.id == entry.question.id) it.copy(audioPath = null, audioUploaded = false, questionUploaded = false, error = null) else it })
                                            message = "Ответ отменён."
                                        },
                                        enabled = entry.audioPath != null || recordingId == entry.question.id,
                                        modifier = Modifier.weight(1f)
                                    ) { Text("Отменить", fontSize = 16.sp) }
                                }
                            }
                            if (entry.audioPath != null && !entry.recording) {
                                Text("Запись сохранена на устройстве", color = MaterialTheme.colorScheme.primary, fontSize = 14.sp)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (!entry.questionUploaded) {
                                        OutlinedButton(
                                            onClick = {
                                                scope.launch {
                                                    sending = true
                                                    runCatching { uploadFile(entry, false) }.onFailure { message = "Не отправлен вопрос «${entry.question.title}»: ${it.message}" }
                                                    sending = false
                                                }
                                            }, enabled = connected && !sending, modifier = Modifier.weight(1f)
                                        ) { Text("Отправить вопрос") }
                                    }
                                    if (!entry.audioUploaded) {
                                        OutlinedButton(
                                            onClick = {
                                                scope.launch {
                                                    sending = true
                                                    runCatching { uploadFile(entry, true) }.onFailure { message = "Не отправлен ответ «${entry.question.title}»: ${it.message}" }
                                                    sending = false
                                                }
                                            }, enabled = connected && !sending, modifier = Modifier.weight(1f)
                                        ) { Text("Отправить запись") }
                                    }
                                }
                                entry.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                            } else if (entry.audioPath == null && !entry.recording) {
                                Text("Ответ пока не записан", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            Button(
                onClick = {
                    scope.launch {
                        sending = true
                        message = null
                        val snapshot = entries.toList()
                        for (entry in snapshot) {
                            if (entry.audioPath == null) continue
                            if (!entry.questionUploaded) {
                                runCatching { uploadFile(entry, false) }.onFailure {
                                    message = "Ошибка отправки вопроса «${entry.question.title}»: ${it.message}"
                                    sending = false
                                    return@launch
                                }
                            }
                            val fresh = entries.first { it.question.id == entry.question.id }
                            if (!fresh.audioUploaded) {
                                runCatching { uploadFile(fresh, true) }.onFailure {
                                    message = "Ошибка отправки ответа «${entry.question.title}»: ${it.message}"
                                    sending = false
                                    return@launch
                                }
                            }
                        }
                        sending = false
                        message = if (entries.none { it.audioPath != null && !it.complete }) "Все записанные ответы отправлены." else "Отправка остановлена. Неотправленные файлы можно повторить отдельно."
                    }
                },
                enabled = connected && !sending && entries.any { it.audioPath != null && !it.complete },
                modifier = Modifier.fillMaxWidth().height(58.dp)
            ) {
                if (sending) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                else Text("Отправить", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }
        }
    }

    if (showCancelConfirm) {
        AlertDialog(
            onDismissRequest = { showCancelConfirm = false },
            title = { Text("Закрыть итоги дня?") },
            text = { Text("Локальные записи сохранятся. Вы сможете вернуться и отправить их позже.") },
            confirmButton = { TextButton(onClick = { showCancelConfirm = false; onBack() }) { Text("Закрыть") } },
            dismissButton = { TextButton(onClick = { showCancelConfirm = false }) { Text("Продолжить") } }
        )
    }
}
