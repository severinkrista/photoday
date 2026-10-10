package ru.krista.photoday.domain

import java.time.LocalDate
import java.time.LocalTime

/**
 * Единый контракт «момента» записи: день недели и часть дня выводятся из даты и времени.
 * Используется и при сохранении записи, и в интерфейсе, чтобы пользователь видел
 * ровно то, что попадёт в таблицу (в том числе при внесении задачи задним числом).
 */
object TaskMoment {
    private val weekdays = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")

    fun weekday(date: LocalDate): String = weekdays[date.dayOfWeek.value - 1]

    fun partOfDay(time: LocalTime): String = when (time.hour) {
        in 0..7 -> "До начала рабочего дня"
        in 8..11 -> "Утро"
        in 12..14 -> "Обед"
        in 15..17 -> "Вечер"
        else -> "После конца рабочего дня"
    }
}
