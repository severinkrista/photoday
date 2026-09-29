package ru.krista.photoday

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import ru.krista.photoday.presentation.MainViewModel

class MainViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        MainViewModel(container.oauthClient, container.taskRepository, container.tokenStore, container.settingsStore) as T
}