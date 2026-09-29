package ru.krista.photoday.model
import java.time.LocalDate
import java.time.LocalTime
data class TaskRecord(val rowNumber:Int,val date:LocalDate?,val time:LocalTime?,val dayOfWeek:String,val partOfDay:String,val type:String,val task:String,val difficulty:Int?)