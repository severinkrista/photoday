package ru.krista.photoday.data

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import ru.krista.photoday.domain.TaskRecord
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.time.LocalTime
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

object XlsxCodec {
    private val dateFormatter = DateTimeFormatter.ISO_LOCAL_DATE
    private val displayDateFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
    private val displayTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")
    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    fun read(bytes: ByteArray): List<TaskRecord> {
        val entries = unzip(bytes)
        val strings = readSharedStrings(entries["xl/sharedStrings.xml"])
        val sheet = entries.keys.firstOrNull { it.startsWith("xl/worksheets/") && it.endsWith(".xml") }
            ?: error("В XLSX не найден лист")
        return readSheet(entries.getValue(sheet), strings)
    }

    fun appendTask(bytes: ByteArray, task: TaskRecord): ByteArray {
        val entries = unzip(bytes).toMutableMap()
        val sheet = entries.keys.firstOrNull { it.startsWith("xl/worksheets/") && it.endsWith(".xml") }
            ?: error("В XLSX не найден лист")
        val xml = entries.getValue(sheet).toString(Charsets.UTF_8)
        if (!hasIdHeader(xml)) {
            error("В XLSX отсутствует первая колонка ID. Добавьте колонку «ID» перед колонкой «Дата».")
        }

        val nextRow = Regex("<row[^>]*r=\"(\\d+)\"")
            .findAll(xml).map { it.groupValues[1].toInt() }.maxOrNull()?.plus(1) ?: 2
        val nextId = Regex("<c[^>]*r=\"A(\\d+)\"[^>]*>.*?</c>", RegexOption.DOT_MATCHES_ALL)
            .findAll(xml)
            .mapNotNull { match ->
                Regex("<v>(.*?)</v>|<t>(.*?)</t>", RegexOption.DOT_MATCHES_ALL)
                    .find(match.value)?.let { it.groupValues[1].ifBlank { it.groupValues[2] } }
                    ?.toIntOrNull()
            }
            .maxOrNull()?.plus(1) ?: 1

        val row = buildRow(nextRow, nextId, task)
        entries[sheet] = xml.replace("</sheetData>", row + "</sheetData>").toByteArray(Charsets.UTF_8)
        return zip(entries)
    }

    private fun hasIdHeader(xml: String): Boolean {
        val header = Regex("<c[^>]*r=\"A1\"[^>]*>.*?</c>", RegexOption.DOT_MATCHES_ALL)
            .find(xml)?.value ?: return false
        return Regex("<t>(.*?)</t>|<v>(.*?)</v>", RegexOption.DOT_MATCHES_ALL)
            .find(header)?.let { it.groupValues[1].ifBlank { it.groupValues[2] } }
            ?.equals("ID", ignoreCase = true) == true
    }

    private fun readSheet(bytes: ByteArray, shared: List<String>): List<TaskRecord> {
        val parser = Xml.newPullParser()
        parser.setInput(bytes.inputStream(), "UTF-8")
        val result = mutableListOf<TaskRecord>()
        var row: MutableMap<String, String>? = null
        var ref = ""
        var type: String? = null
        var value = ""
        var inValue = false
        var header: Map<String, String>? = null

        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> when (parser.name) {
                    "row" -> row = mutableMapOf()
                    "c" -> {
                        ref = parser.getAttributeValue(null, "r").orEmpty()
                        type = parser.getAttributeValue(null, "t")
                        value = ""
                    }
                    "v", "t" -> if (ref.isNotEmpty()) inValue = true
                }
                XmlPullParser.TEXT -> if (inValue) value += parser.text
                XmlPullParser.END_TAG -> when (parser.name) {
                    "v", "t" -> inValue = false
                    "c" -> row?.set(column(ref), decode(value, type, shared))
                    "row" -> {
                        val r = row
                        if (r != null) {
                            if (header == null) {
                                header = r.mapNotNull { (col, name) ->
                                    name.trim().takeIf { it.isNotEmpty() }?.let { it to col }
                                }.toMap()
                            } else {
                                val dateCol = header?.get("Дата") ?: "B"
                                val timeCol = header?.get("Время") ?: "C"
                                val weekdayCol = header?.get("День недели") ?: "D"
                                val partCol = header?.get("Часть дня") ?: "E"
                                val typeCol = header?.get("Вид задачи") ?: "F"
                                val taskCol = header?.get("Задача") ?: "G"
                                val difficultyCol = header?.get("Сложность") ?: "H"
                                val dateValue = r[dateCol].orEmpty()
                                val taskValue = r[taskCol].orEmpty()

                                if (dateValue.isNotBlank() && taskValue.isNotBlank()) {
                                    result += TaskRecord(
                                        id = header?.get("ID")?.let { r[it] }?.takeIf { it.isNotBlank() },
                                        date = parseDateOrExcelSerial(dateValue),
                                        time = parseTimeOrExcelSerial(r[timeCol].orEmpty()),
                                        weekday = r[weekdayCol].orEmpty(),
                                        partOfDay = r[partCol].orEmpty(),
                                        taskType = r[typeCol].orEmpty(),
                                        task = taskValue,
                                        difficulty = r[difficultyCol]?.toIntOrNull()
                                    )
                                }
                            }
                        }
                        row = null
                    }
                }
            }
        }
        return result
    }

    private fun decode(value: String, type: String?, shared: List<String>): String =
        if (type == "s") shared.getOrNull(value.toIntOrNull() ?: -1).orEmpty() else value

    private fun readSharedStrings(bytes: ByteArray?): List<String> {
        if (bytes == null) return emptyList()
        val parser = Xml.newPullParser()
        parser.setInput(bytes.inputStream(), "UTF-8")
        val result = mutableListOf<String>()
        var active = false
        var text = StringBuilder()
        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> if (parser.name == "si") { active = true; text = StringBuilder() }
                XmlPullParser.TEXT -> if (active) text.append(parser.text)
                XmlPullParser.END_TAG -> if (parser.name == "si") { result += text.toString(); active = false }
            }
        }
        return result
    }

    private fun buildRow(row: Int, id: Int, task: TaskRecord): String {
        fun text(col: String, value: String) =
            "<c r=\"$col$row\" t=\"inlineStr\"><is><t>${escape(value)}</t></is></c>"
        fun number(col: String, value: String) = "<c r=\"$col$row\"><v>$value</v></c>"
        return buildString {
            append("<row r=\"$row\">")
            append(number("A", id.toString()))
            append(text("B", task.date?.format(displayDateFormatter).orEmpty()))
            append(text("C", task.time?.format(displayTimeFormatter).orEmpty()))
            append(text("D", task.weekday))
            append(text("E", task.partOfDay))
            append(text("F", task.taskType))
            append(text("G", task.task))
            append(number("H", (task.difficulty ?: 0).toString()))
            append("</row>")
        }
    }

    private fun escape(v: String) = v.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;")
    private fun column(ref: String) = ref.takeWhile { it.isLetter() }
    private fun parseDateOrExcelSerial(v: String): LocalDate? {
        runCatching { return LocalDate.parse(v, dateFormatter) }
        runCatching { return LocalDate.parse(v, displayDateFormatter) }
        val serial = v.toDoubleOrNull() ?: return null
        return runCatching { LocalDate.of(1899, 12, 30).plusDays(serial.toLong()) }.getOrNull()
    }

    private fun parseTimeOrExcelSerial(v: String): LocalTime? {
        runCatching { return LocalTime.parse(v, timeFormatter) }
        runCatching { return LocalTime.parse(v, displayTimeFormatter) }
        val serial = v.toDoubleOrNull() ?: return null
        val seconds = (serial - serial.toLong()) * 86_400.0
        return runCatching {
            LocalTime.MIDNIGHT.plusSeconds(seconds.toLong().coerceIn(0, 86_399))
        }.getOrNull()
    }

    private fun unzip(bytes: ByteArray): Map<String,ByteArray> {
        val out = linkedMapOf<String,ByteArray>()
        ZipInputStream(bytes.inputStream()).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                if (!e.isDirectory) out[e.name] = z.readBytes()
            }
        }
        return out
    }

    private fun zip(entries: Map<String,ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            entries.forEach { (name,data) ->
                z.putNextEntry(ZipEntry(name)); z.write(data); z.closeEntry()
            }
        }
        return out.toByteArray()
    }
}