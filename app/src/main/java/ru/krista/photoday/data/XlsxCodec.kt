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
        val nextRow = Regex("<row[^>]*\\br=\"(\\d+)\"")
            .findAll(xml).map { it.groupValues[1].toInt() }.maxOrNull()?.plus(1) ?: 2
        val row = buildRow(nextRow, task)
        entries[sheet] = xml.replace("</sheetData>", "$row</sheetData>").toByteArray(Charsets.UTF_8)
        return zip(entries)
    }

    private fun readSheet(bytes: ByteArray, shared: List<String>): List<TaskRecord> {
        val parser = Xml.newPullParser()
        parser.setInput(bytes.inputStream(), "UTF-8")
        val result = mutableListOf<TaskRecord>()
        var row: MutableMap<String,String>? = null
        var ref = ""
        var type: String? = null
        var value = ""
        var inValue = false
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
                        if (r != null && r["A"] != "Дата" && r["F"].orEmpty().isNotBlank()) {
                            result += TaskRecord(
                                id = r["A"],
                                date = r["A"]?.let { parseDateOrExcelSerial(it) },
                                time = r["B"]?.let { parseTimeOrExcelSerial(it) },
                                weekday = r["C"].orEmpty(),
                                partOfDay = r["D"].orEmpty(),
                                taskType = r["E"].orEmpty(),
                                task = r["F"].orEmpty(),
                                difficulty = r["G"]?.toIntOrNull()
                            )
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

    private fun buildRow(row: Int, task: TaskRecord): String {
        fun text(col: String, value: String) =
            "<c r=\"$col$row\" t=\"inlineStr\"><is><t>${escape(value)}</t></is></c>"
        fun number(col: String, value: String) = "<c r=\"$col$row\"><v>$value</v></c>"
        return buildString {
            append("<row r=\"$row\">")
            append(text("A", task.date?.format(dateFormatter).orEmpty()))
            append(text("B", task.time?.format(timeFormatter).orEmpty()))
            append(text("C", task.weekday))
            append(text("D", task.partOfDay))
            append(text("E", task.taskType))
            append(text("F", task.task))
            append(number("G", (task.difficulty ?: 0).toString()))
            append("</row>")
        }
    }

    private fun escape(v: String) = v.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;")
    private fun column(ref: String) = ref.takeWhile { it.isLetter() }
    private fun parseDateOrExcelSerial(v: String): LocalDate? {
        runCatching { return LocalDate.parse(v, dateFormatter) }
        val serial = v.toDoubleOrNull() ?: return null
        return runCatching { LocalDate.of(1899, 12, 30).plusDays(serial.toLong()) }.getOrNull()
    }

    private fun parseTimeOrExcelSerial(v: String): LocalTime? {
        runCatching { return LocalTime.parse(v, timeFormatter) }
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