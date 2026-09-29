package ru.krista.photoday.domain

import java.time.LocalDate

interface TaskRepository {
    suspend fun getTasks(from: LocalDate, to: LocalDate): Result<List<TaskRecord>>
}
