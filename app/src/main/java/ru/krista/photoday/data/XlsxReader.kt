package ru.krista.photoday.data
import org.apache.poi.ss.usermodel.DataFormatter
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import ru.krista.photoday.model.TaskRecord
import java.io.File
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

class XlsxReader{
 private val f=DataFormatter()
 fun read(file:File,days:Long):List<TaskRecord>{
  XSSFWorkbook(file.inputStream()).use{wb->
   val s=wb.getSheetAt(0);val h=s.getRow(0)?:return emptyList();val c=mutableMapOf<String,Int>()
   for(cell in h)c[f.formatCellValue(cell).trim()]=cell.columnIndex
   val dc=c["Дата"]?:0;val tc=c["Время"]?:1;val wc=c["День недели"]?:2;val pc=c["Часть дня"]?:3;val yc=c["Вид задачи"]?:4;val taskc=c["Задача"]?:5;val diffc=c["Сложность"]?:6
   val from=LocalDate.now().minusDays(days.coerceAtLeast(0));val out=mutableListOf<TaskRecord>()
   for(i in 1..s.lastRowNum){
    val r=s.getRow(i)?:continue;val date=parseDate(text(r,dc));if(date!=null&&date.isBefore(from))continue
    val task=text(r,taskc);if(task.isBlank())continue
    out+=TaskRecord(i+1,date,parseTime(text(r,tc)),text(r,wc),text(r,pc),text(r,yc),task,text(r,diffc).toIntOrNull())
   }
   return out.sortedWith(compareByDescending<TaskRecord>{it.date}.thenByDescending{it.time})
  }
 }
 private fun text(r:org.apache.poi.ss.usermodel.Row,c:Int)=f.formatCellValue(r.getCell(c)).trim()
 private fun parseDate(v:String):LocalDate?=listOf("dd.MM.yyyy","d.M.yyyy","yyyy-MM-dd").firstNotNullOfOrNull{runCatching{LocalDate.parse(v,DateTimeFormatter.ofPattern(it))}.getOrNull()}
 private fun parseTime(v:String):LocalTime?=listOf("HH:mm:ss","H:mm:ss","HH:mm","H:mm").firstNotNullOfOrNull{runCatching{LocalTime.parse(v,DateTimeFormatter.ofPattern(it))}.getOrNull()}
}