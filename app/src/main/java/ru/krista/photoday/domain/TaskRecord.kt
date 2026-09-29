package ru.krista.photoday.domain

import java.time.LocalDate
import java.time.LocalTime

data class TaskRecord(
    val id: String?,
    val date: LocalDate?,
    val time: LocalTime?,
    val weekday: String,
    val partOfDay: String,
    val taskType: String,
    val task: String,
    val difficulty: Int?
)
