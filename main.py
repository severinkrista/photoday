import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime
from babel.dates import format_date
import locale
import os
import subprocess
import platform
# Импорты для работы с настройками и модулями приложения
import configparser
import sys
# Импорты модулей проекта
import state # Для доступа к глобальным настройкам
import settings # Для загрузки/сохранения настроек
import data_processing # Для функций обработки данных
import ui_components # Для компонентов UI
import file_operations # Для операций с файлами
import statistic # Для отображения статистики
import googlesheets # Для сохранения в Google Sheets

# === ОСНОВНОЕ ОКНО ПРИЛОЖЕНИЯ ===
root = tk.Tk()
root.title("Журнал рабочих задач")
# Установка размера окна по умолчанию
root.geometry("800x500")
root.resizable(True, True)

# === ИНИЦИАЛИЗАЦИЯ НАСТРОЕК ===
# Загрузка сохраненных настроек из файла settings.ini
settings.load_settings_from_ini(root) # Передаем root для создания Tkinter переменных

# === ИНТЕРФЕЙС: ФРЕЙМ ДЛЯ ЗАПИСЕЙ С ПРОКРУТКОЙ ===
# Область с прокручиваемым списком записей
records_frame = tk.Frame(root)
records_frame.pack(pady=5, padx=10, fill="both", expand=True)
canvas = tk.Canvas(records_frame)
scrollbar = ttk.Scrollbar(records_frame, orient="vertical", command=canvas.yview)
scrollable_frame = tk.Frame(canvas)
scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
canvas.configure(yscrollcommand=scrollbar.set)
canvas.pack(side="left", fill="both", expand=True)
scrollbar.pack(side="right", fill="y")

# === СПИСОК ВИДЖЕТОВ ЗАПИСЕЙ ===
# Хранит ссылки на все созданные виджеты записей для последующей обработки
record_widgets = []

# === ФУНКЦИЯ: СОЗДАНИЕ НОВОЙ ЗАПИСИ ===
# Обертка для функции создания записи из модуля ui_components
def create_record_wrapper(parent, default_date=None, default_time=None):
    """Создает новую запись и передает ей список record_widgets."""
    rec_dict = ui_components.create_record(parent, record_widgets, default_date, default_time)
    # Установка фокуса на поле описания после создания записи
    root.after_idle(lambda: rec_dict['description_text'].focus_set())
    return rec_dict

# === ФУНКЦИЯ: ОТКРЫТИЕ ОКНА НАСТРОЕК ===
# Открывает отдельное окно для настройки путей сохранения и других параметров
def open_settings():
    """Создает и отображает окно настроек приложения."""
    settings_window = tk.Toplevel(root)
    settings_window.title("Настройки")
    settings_window.resizable(False, False)
    settings_window.grab_set()
    settings_window.focus_set()

    # Основной фрейм для размещения элементов настроек
    settings_frame = tk.Frame(settings_window)
    settings_frame.pack(padx=20, pady=10)

    # Настройки форматов сохранения
    tk.Label(settings_frame, text="Формат сохранения:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(0, 5))
    tk.Checkbutton(settings_frame, text="Текстовый файл (.txt)", variable=state.settings["save_txt"]).pack(anchor="w", padx=20)
    tk.Label(settings_frame, text="Путь к TXT:").pack(anchor="w", padx=40)
    txt_path_frame = tk.Frame(settings_frame)
    txt_path_frame.pack(anchor="w", fill="x", padx=40, pady=2)
    tk.Entry(txt_path_frame, textvariable=state.settings["txt_path"], width=55).pack(side="left", fill="x", expand=True)
    tk.Button(
        txt_path_frame, text="...", command=lambda: state.settings["txt_path"].set(
            filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt"), ("All files", "*.*")])
            or state.settings["txt_path"].get())
    ).pack(side="right", padx=(5, 0))

    tk.Checkbutton(settings_frame, text="Таблица Excel (.xlsx)", variable=state.settings["save_excel"]).pack(anchor="w", padx=20, pady=(10, 0))
    tk.Label(settings_frame, text="Путь к XLSX:").pack(anchor="w", padx=40)
    xlsx_path_frame = tk.Frame(settings_frame)
    xlsx_path_frame.pack(anchor="w", fill="x", padx=40, pady=2)
    tk.Entry(xlsx_path_frame, textvariable=state.settings["excel_path"], width=55).pack(side="left", fill="x", expand=True)
    tk.Button(
        xlsx_path_frame, text="...", command=lambda: state.settings["excel_path"].set(
            filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")])
            or state.settings["excel_path"].get())
    ).pack(side="right", padx=(5, 0))

    # Настройки Google Sheets
    tk.Label(settings_frame, text="Google Таблицы:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(15, 5))
    tk.Checkbutton(settings_frame, text="Сохранять в Google Таблицы", variable=state.settings["save_google_sheets"]).pack(anchor="w", padx=20)
    
    tk.Label(settings_frame, text="ID Google Таблицы:").pack(anchor="w", padx=40)
    google_id_frame = tk.Frame(settings_frame)
    google_id_frame.pack(anchor="w", fill="x", padx=40, pady=2)
    google_id_entry = tk.Entry(google_id_frame, textvariable=state.settings["google_spreadsheet_id"], width=55)
    google_id_entry.pack(side="left", fill="x", expand=True)
    # Разрешаем вставку из буфера обмена по Ctrl+V
    google_id_entry.bind("<Control-v>", lambda event: google_id_entry.event_generate("<<Paste>>"))
    
    tk.Label(settings_frame, text="Имя листа:").pack(anchor="w", padx=40)
    sheet_name_frame = tk.Frame(settings_frame)
    sheet_name_frame.pack(anchor="w", fill="x", padx=40, pady=2)
    sheet_name_entry = tk.Entry(sheet_name_frame, textvariable=state.settings["google_sheet_name"], width=30)
    sheet_name_entry.pack(side="left")
    # Разрешаем вставку из буфера обмена по Ctrl+V
    sheet_name_entry.bind("<Control-v>", lambda event: sheet_name_entry.event_generate("<<Paste>>"))

    # Настройка количества отображаемых последних задач
    tk.Label(settings_frame, text="Количество последних задач:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(15, 5))
    count_frame = tk.Frame(settings_frame)
    count_frame.pack(anchor="w", padx=40, pady=2)
    tk.Label(count_frame, text="Количество (1-50):").pack(side="left")
    count_spinbox = tk.Spinbox(count_frame, from_=1, to=50, width=5)
    count_spinbox.pack(side="left", padx=(5, 0))
    try:
        current_count = state.settings["old_tasks_count"].get()
        count_spinbox.delete(0, "end")
        count_spinbox.insert(0, str(min(max(current_count, 1), 50)))
    except (tk.TclError, ValueError):
        count_spinbox.delete(0, "end")
        count_spinbox.insert(0, "5")

    # Настройка стиля выбора сложности задачи
    tk.Label(settings_frame, text="Стиль выбора сложности:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(15, 5))
    style_frame = tk.Frame(settings_frame)
    style_frame.pack(anchor="w", padx=40, pady=2)
    difficulty_style_var = tk.StringVar(value=state.settings["difficulty_style"].get())
    tk.Radiobutton(style_frame, text="Выпадающий список", variable=difficulty_style_var, value="dropdown").pack(anchor="w")
    tk.Radiobutton(style_frame, text="Кнопки", variable=difficulty_style_var, value="buttons").pack(anchor="w")

    # Логика сохранения настроек
    def save_settings():
        # Проверка, что выбран хотя бы один формат сохранения
        if (not state.settings["save_txt"].get() and 
            not state.settings["save_excel"].get() and
            not state.settings["save_google_sheets"].get()):
            messagebox.showwarning("Ошибка", "Выберите хотя бы один формат сохранения.")
            return
        # Проверка заполненности путей для выбранных форматов
        if state.settings["save_txt"].get() and not state.settings["txt_path"].get().strip():
            messagebox.showwarning("Ошибка", "Укажите путь для TXT-файла.")
            return
        if state.settings["save_excel"].get() and not state.settings["excel_path"].get().strip():
            messagebox.showwarning("Ошибка", "Укажите путь для Excel-файла.")
            return
        # Сохранение количества последних задач
        try:
            count_value = int(count_spinbox.get())
            count_value = min(max(count_value, 1), 50)
            state.settings["old_tasks_count"].set(count_value)
        except ValueError:
            messagebox.showwarning("Ошибка", "Некорректное значение количества задач.")
            return
        # Сохранение стиля выбора сложности
        state.settings["difficulty_style"].set(difficulty_style_var.get())
        # Закрытие окна и сохранение настроек в файл
        settings_window.destroy()
        settings.save_settings_to_ini()
        # Обновление отображения последних задач
        update_last_tasks_display()

    # Кнопка сохранения настроек
    button_frame = tk.Frame(settings_frame)
    button_frame.pack(fill="x", pady=(20, 0))
    tk.Button(button_frame, text="Сохранить", command=save_settings, bg="#4CAF50", fg="white").pack(side="right")

    # Автоматическая подстройка размера окна под содержимое
    settings_window.update_idletasks()
    req_width = settings_frame.winfo_reqwidth()
    req_height = settings_frame.winfo_reqheight()
    window_width = req_width + 40
    window_height = req_height + 20
    settings_window.geometry(f"{window_width}x{window_height}")

# === ФУНКЦИЯ: СОХРАНЕНИЕ ВСЕХ ЗАПИСЕЙ ===
# Сохраняет все записи в выбранные пользователем форматы (TXT, Excel, Google Sheets)
def save_all():
    """Сохраняет все записи в выбранные форматы и очищает список записей."""
    # Проверка и создание директорий для файлов, если нужно
    txt_path = state.settings["txt_path"].get().strip()
    xlsx_path = state.settings["excel_path"].get().strip()
    if state.settings["save_txt"].get() and txt_path:
        txt_dir = os.path.dirname(txt_path)
        if txt_dir and not os.path.exists(txt_dir):
            try:
                os.makedirs(txt_dir)
            except Exception as e:
                 messagebox.showwarning("Предупреждение", f"Не удалось создать директорию для TXT файла:\n{txt_dir}\nОшибка: {e}")
    if state.settings["save_excel"].get() and xlsx_path:
        xlsx_dir = os.path.dirname(xlsx_path)
        if xlsx_dir and not os.path.exists(xlsx_dir):
            try:
                os.makedirs(xlsx_dir)
            except Exception as e:
                 messagebox.showwarning("Предупреждение", f"Не удалось создать директорию для XLSX файла:\n{xlsx_dir}\nОшибка: {e}")

    # Проверка, что выбран хотя бы один формат сохранения
    if (not state.settings["save_txt"].get() and 
        not state.settings["save_excel"].get() and
        not state.settings["save_google_sheets"].get()):
        messagebox.showwarning("Ошибка", "В настройках не выбран ни один формат сохранения.")
        return

    saved = False
    save_error = False # Флаг для отслеживания ошибок

    # Сохранение в текстовый файл
    if state.settings["save_txt"].get():
        if not file_operations.save_records_to_txt(record_widgets):
            save_error = True
        else:
            saved = True

    # Сохранение в Excel
    if state.settings["save_excel"].get():
        if not file_operations.save_records_to_excel(record_widgets):
            save_error = True
        else:
            saved = True

    # Сохранение в Google Sheets (Временно отключаю, вызывает ошибку гугла)
#    if state.settings["save_google_sheets"].get():
#        if not googlesheets.save_records_to_google_sheets(record_widgets):
#            save_error = True
#        else:
#            saved = True

    # Отображение результата сохранения
    if saved and not save_error:
        messagebox.showinfo("Успех", "Данные сохранены!")
        # Обновляем отображение последних задач
        update_last_tasks_display()
        
        # Удаление всех записей из интерфейса и добавление новой пустой
        widgets_to_delete = record_widgets.copy()
        for rec_dict in widgets_to_delete:
            rec_dict['frame'].destroy()
            record_widgets.remove(rec_dict)
        create_record_wrapper(scrollable_frame)
    elif save_error:
        # Сообщения об ошибках уже показаны в соответствующих функциях
        pass

# === ФУНКЦИЯ: ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ПОСЛЕДНИХ ЗАДАЧ ===
# Обновляет область отображения последних задач на основе настроек
def update_last_tasks_display():
    """Обновляет область отображения последних задач."""
    # Очистка предыдущего содержимого
    for widget in last_tasks_frame.winfo_children():
        widget.destroy()
    # Получение количества строк для отображения
    try:
        num_lines = min(state.settings["old_tasks_count"].get(), 50)
    except (tk.TclError, ValueError):
        num_lines = settings.DEFAULT_OLD_TASKS_COUNT
    # Чтение последних строк из текстового файла
    txt_path = state.settings["txt_path"].get()
    last_lines = data_processing.read_last_lines(txt_path, num_lines)
    # Отображение текста
    if last_lines:
        text_widget = tk.Text(last_tasks_frame, height=min(num_lines + 1, 50), width=80, font=("Arial", 9))
        text_widget.pack(fill="both", expand=True, padx=5, pady=5)
        text_widget.insert("1.0", f"Последние {len(last_lines)} задач(и):\n")
        text_widget.insert("2.0", "-" * 50 + "\n")
        for i, line in enumerate(last_lines, start=3):
            text_widget.insert(f"{i}.0", line)
        text_widget.config(state="disabled")
    else:
        tk.Label(last_tasks_frame, text="Нет данных для отображения", fg="gray").pack(pady=10)

# === ИНТЕРФЕЙС: НИЖНИЙ ФРЕЙМ С КНОПКАМИ ===
# Панель с основными кнопками управления
bottom_frame = tk.Frame(root)
bottom_frame.pack(pady=5, padx=10, fill="x")

# Кнопки для открытия файлов, настроек, добавления и сохранения записей
tk.Button(bottom_frame, text="📂 Открыть текст", command=file_operations.open_text, bg="#2196F3", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="📊 Открыть таблицу", command=file_operations.open_excel, bg="#4CAF50", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="⚙️ Настройки", command=open_settings, bg="#9C27B0", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="➕ Добавить запись", command=lambda: create_record_wrapper(scrollable_frame), bg="#FF9800", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="💾 Сохранить всё", command=save_all, bg="#009688", fg="white").pack(side="left", padx=2)
# Кнопка для отображения статистики
tk.Button(bottom_frame, text="📊 Статистика", command=lambda: statistic.show_statistics(root), bg="#FF5722", fg="white").pack(side="left", padx=2)

# === ИНТЕРФЕЙС: ФРЕЙМ ДЛЯ ОТОБРАЖЕНИЯ ПОСЛЕДНИХ ЗАДАЧ ===
# Область для отображения последних сохраненных задач
last_tasks_frame = tk.LabelFrame(root, text="Последние задачи", padx=5, pady=5)
last_tasks_frame.pack(pady=5, padx=10, fill="both", expand=True)

# === СОЗДАНИЕ ПЕРВОЙ ЗАПИСИ ПО УМОЛЧАНИЮ ===
# При запуске приложения создается одна пустая запись
create_record_wrapper(scrollable_frame)

# === ИНИЦИАЛИЗАЦИЯ ОТОБРАЖЕНИЯ ПОСЛЕДНИХ ЗАДАЧ ===
# Первоначальное заполнение области последних задач
update_last_tasks_display()

# === ЗАПУСК ПРИЛОЖЕНИЯ ===
root.mainloop()
