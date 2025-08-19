# settings.py
# Настройки по умолчанию и работа с settings.ini

import os
import sys
import configparser
import tkinter as tk
import state # Импортируем для доступа к state.settings

# === НАСТРОЙКИ ПО УМОЛЧАНИЮ ===
# Используем сырые строки (r"") для путей, чтобы избежать проблем с обратными слэшами
DEFAULT_TXT_PATH = r"d:\Илья\Криста\Скрипт для записи фото рабочего дня ежедневно\через python\Фотодня.txt"
DEFAULT_XLSX_PATH = r"d:\Илья\Криста\Скрипт для записи фото рабочего дня ежедневно\через python\Фотодня.xlsx"
DEFAULT_OLD_TASKS_COUNT = 5  # Количество последних задач по умолчанию

# Новое: Стиль выбора сложности по умолчанию
DEFAULT_DIFFICULTY_STYLE = "buttons"

def get_settings_path():
    """Определяет путь к settings.ini рядом с исполняемым файлом или скриптом."""
    if getattr(sys, 'frozen', False):
        # Если запущено как .exe (например, собрано PyInstaller)
        application_path = os.path.dirname(sys.executable)
    else:
        # Если запущено как скрипт .py
        application_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(application_path, "settings.ini")

def load_settings_from_ini(root):
    """Загружает настройки из settings.ini, если файл существует.
       root необходим для создания Tkinter переменных."""
    settings_path = get_settings_path()
    
    # Инициализируем settings с дефолтными значениями Tkinter переменных
    # Это место, где инициализируются переменные Tkinter
    state.settings = {
        "save_txt": tk.BooleanVar(master=root, value=True),
        "save_excel": tk.BooleanVar(master=root, value=True), # По умолчанию включено
        "txt_path": tk.StringVar(master=root, value=DEFAULT_TXT_PATH),
        "excel_path": tk.StringVar(master=root, value=DEFAULT_XLSX_PATH),
        "old_tasks_count": tk.IntVar(master=root, value=DEFAULT_OLD_TASKS_COUNT),
        # Новое: Переменная для стиля сложности
        "difficulty_style": tk.StringVar(master=root, value=DEFAULT_DIFFICULTY_STYLE),
    }
    
    if os.path.exists(settings_path):
        config = configparser.ConfigParser()
        # Убедимся, что значения читаются как есть (без преобразования нижнего регистра)
        config.optionxform = str 
        try:
            config.read(settings_path, encoding='utf-8')
            if 'Settings' in config:
                section = config['Settings']
                # Обновляем переменные Tkinter значениями из файла
                if 'save_txt' in section:
                    state.settings["save_txt"].set(section.getboolean('save_txt'))
                if 'save_excel' in section:
                    state.settings["save_excel"].set(section.getboolean('save_excel'))
                if 'txt_path' in section:
                    state.settings["txt_path"].set(section['txt_path'])
                if 'excel_path' in section:
                    state.settings["excel_path"].set(section['excel_path'])
                if 'old_tasks_count' in section:
                    try:
                        state.settings["old_tasks_count"].set(int(section['old_tasks_count']))
                    except ValueError:
                        pass # Игнорируем некорректные значения, оставляем значение по умолчанию
                # Новое: Загрузка стиля сложности
                if 'difficulty_style' in section:
                    style_value = section['difficulty_style']
                    # Убедимся, что значение допустимое
                    if style_value in ['dropdown', 'buttons']:
                        state.settings["difficulty_style"].set(style_value)
                    else:
                        state.settings["difficulty_style"].set(DEFAULT_DIFFICULTY_STYLE) # значение по умолчанию
                        
            print(f"Настройки загружены из {settings_path}") # Для отладки
        except Exception as e:
            print(f"Ошибка при загрузке настроек из {settings_path}: {e}")
            # messagebox.showwarning("Предупреждение", f"Не удалось загрузить настройки из файла: {e}")

def save_settings_to_ini():
    """Сохраняет текущие настройки в settings.ini."""
    settings_path = get_settings_path()
    config = configparser.ConfigParser()
    config.optionxform = str # Сохраняем ключи в исходном регистре
    
    # Заполняем секцию Settings текущими значениями из state.settings
    config['Settings'] = {
        'save_txt': str(state.settings["save_txt"].get()),
        'save_excel': str(state.settings["save_excel"].get()),
        'txt_path': state.settings["txt_path"].get(),
        'excel_path': state.settings["excel_path"].get(),
        'old_tasks_count': str(state.settings["old_tasks_count"].get()),
        # Новое: Сохранение стиля сложности
        'difficulty_style': state.settings["difficulty_style"].get(),
    }
    
    try:
        with open(settings_path, 'w', encoding='utf-8') as configfile:
            config.write(configfile)
        print(f"Настройки сохранены в {settings_path}") # Для отладки
    except Exception as e:
        error_msg = f"Не удалось сохранить настройки в файл {settings_path}: {e}"
        print(error_msg)
        # messagebox.showwarning("Ошибка сохранения настроек", error_msg) # Может потребоваться доступ к root
