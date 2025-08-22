# main.py
# Основной файл приложения

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import os
import subprocess
import platform
# === НОВЫЙ ИМПОРТ ===
import configparser
import sys  # Для определения пути к .exe
# === НОВЫЕ ИМПОРТЫ ===
import state # Для доступа к глобальным настройкам
import settings # Для загрузки/сохранения настроек
import data_processing # Для функций обработки данных
import ui_components # Для компонентов UI
import file_operations # Для операций с файлами
import statistic # === НОВЫЙ ИМПОРТ ДЛЯ СТАТИСТИКИ ===
# === /НОВЫЕ ИМПОРТЫ ===
# from openpyxl import load_workbook, Workbook
# from openpyxl.styles import Alignment

# === ОСНОВНОЕ ОКНО ПРИЛОЖЕНИЯ ===
root = tk.Tk()
root.title("Журнал рабочих задач")
# 2. Изменён размер окна по умолчанию на 800x500
root.geometry("800x500")  # Увеличил высоту для отображения последних задач
root.resizable(True, True)

# === ЗАГРУЗКА НАСТРОЕК ===
# Инициализируем и загружаем настройки
settings.load_settings_from_ini(root) # Передаем root для создания Tkinter переменных

# === ФРЕЙМ ДЛЯ ЗАПИСЕЙ С ПРОКРУТКОЙ ===
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
record_widgets = []

# === ФУНКЦИЯ: СОЗДАНИЕ НОВОЙ ЗАПИСИ (обертка для ui_components.create_record) ===
def create_record_wrapper(parent, default_date=None, default_time=None):
    """Обертка для создания записи, чтобы передать record_widgets."""
    rec_dict = ui_components.create_record(parent, record_widgets, default_date, default_time)
    # Установка фокуса на поле описания после создания записи
    # Делаем это здесь, так как у нас есть доступ к root
    root.after_idle(lambda: rec_dict['description_text'].focus_set())
    return rec_dict

# === КНОПКА: ОТКРЫТЬ НАСТРОЙКИ ===
def open_settings():
    settings_window = tk.Toplevel(root)
    settings_window.title("Настройки")
    # settings_window.geometry("550x230")
    settings_window.resizable(False, False)
    settings_window.grab_set()
    settings_window.focus_set()

    # Создаем основной фрейм для всех элементов настроек
    settings_frame = tk.Frame(settings_window)
    settings_frame.pack(padx=20, pady=10) # Отступы вокруг всего содержимого

    tk.Label(settings_frame, text="Формат сохранения:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(0, 5))
    tk.Checkbutton(settings_frame, text="Текстовый файл (.txt)", variable=state.settings["save_txt"]).pack(anchor="w", padx=20)
    tk.Label(settings_frame, text="Путь к TXT:").pack(anchor="w", padx=40)
    # Фрейм для поля ввода пути и кнопки выбора файла
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
    # Фрейм для поля ввода пути и кнопки выбора файла
    xlsx_path_frame = tk.Frame(settings_frame)
    xlsx_path_frame.pack(anchor="w", fill="x", padx=40, pady=2)
    tk.Entry(xlsx_path_frame, textvariable=state.settings["excel_path"], width=55).pack(side="left", fill="x", expand=True)
    tk.Button(
        xlsx_path_frame, text="...", command=lambda: state.settings["excel_path"].set(
            filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")])
            or state.settings["excel_path"].get())
    ).pack(side="right", padx=(5, 0))

    # === НОВАЯ НАСТРОЙКА: КОЛИЧЕСТВО ПОСЛЕДНИХ ЗАДАЧ ===
    tk.Label(settings_frame, text="Количество последних задач:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(15, 5))
    # Создаем фрейм для Spinbox и метки
    count_frame = tk.Frame(settings_frame)
    count_frame.pack(anchor="w", padx=40, pady=2)
    tk.Label(count_frame, text="Количество (1-50):").pack(side="left")  # Изменено на 50
    # Используем Spinbox для ограничения ввода чисел в диапазоне 1-50
    count_spinbox = tk.Spinbox(count_frame, from_=1, to=50, width=5)  # Изменено на 50
    count_spinbox.pack(side="left", padx=(5, 0))
    # Устанавливаем текущее значение в Spinbox
    try:
        current_count = state.settings["old_tasks_count"].get()
        count_spinbox.delete(0, "end")
        count_spinbox.insert(0, str(min(max(current_count, 1), 50)))  # Изменено на 50
    except (tk.TclError, ValueError):
        count_spinbox.delete(0, "end")
        count_spinbox.insert(0, "5")

    # === НОВАЯ НАСТРОЙКА: СТИЛЬ ВЫБОРА СЛОЖНОСТИ ===
    tk.Label(settings_frame, text="Стиль выбора сложности:", font=("Arial", 10, "bold")).pack(anchor="w", pady=(15, 5))
    # Создаем фрейм для Radiobuttons
    style_frame = tk.Frame(settings_frame)
    style_frame.pack(anchor="w", padx=40, pady=2)
    # Переменная для отслеживания выбранного стиля (загружаем из settings)
    difficulty_style_var = tk.StringVar(value=state.settings["difficulty_style"].get())
    tk.Radiobutton(style_frame, text="Выпадающий список", variable=difficulty_style_var, value="dropdown").pack(anchor="w")
    tk.Radiobutton(style_frame, text="Кнопки", variable=difficulty_style_var, value="buttons").pack(anchor="w")
    # === /НОВАЯ НАСТРОЙКА ===

    def save_settings():
        if not state.settings["save_txt"].get() and not state.settings["save_excel"].get():
            messagebox.showwarning("Ошибка", "Выберите хотя бы один формат сохранения.")
            return
        if state.settings["save_txt"].get() and not state.settings["txt_path"].get().strip():
            messagebox.showwarning("Ошибка", "Укажите путь для TXT-файла.")
            return
        if state.settings["save_excel"].get() and not state.settings["excel_path"].get().strip():
            messagebox.showwarning("Ошибка", "Укажите путь для Excel-файла.")
            return
        # Сохраняем значение количества задач из Spinbox
        try:
            count_value = int(count_spinbox.get())
            # Убеждаемся, что значение в допустимых пределах
            count_value = min(max(count_value, 1), 50)  # Изменено на 50
            state.settings["old_tasks_count"].set(count_value)
        except ValueError:
            messagebox.showwarning("Ошибка", "Некорректное значение количества задач.")
            return
        # === НОВОЕ: Сохраняем стиль сложности ===
        state.settings["difficulty_style"].set(difficulty_style_var.get())
        # === /НОВОЕ ===
        settings_window.destroy()
        # === НОВОЕ: СОХРАНЕНИЕ НАСТРОЕК ===
        settings.save_settings_to_ini()
        # === /НОВОЕ ===
        # === НОВОЕ: ОБНОВЛЯЕМ ОТОБРАЖЕНИЕ ПОСЛЕДНИХ ЗАДАЧ ===
        update_last_tasks_display()

    # Фрейм для кнопки сохранить, чтобы она была прижата внизу
    button_frame = tk.Frame(settings_frame)
    button_frame.pack(fill="x", pady=(20, 0))
    tk.Button(button_frame, text="Сохранить", command=save_settings, bg="#4CAF50", fg="white").pack(side="right")

    # Обновляем геометрию окна после размещения всех виджетов
    settings_window.update_idletasks() # Обновляем информацию о размерах виджетов
    req_width = settings_frame.winfo_reqwidth()
    req_height = settings_frame.winfo_reqheight()
    # Добавляем отступы (20 слева + 20 справа, 10 сверху + 10 снизу)
    window_width = req_width + 40
    window_height = req_height + 20
    settings_window.geometry(f"{window_width}x{window_height}")

# === КНОПКА: СОХРАНИТЬ ВСЁ (основная логика) ===
def save_all():
    if not state.settings["save_txt"].get() and not state.settings["save_excel"].get():
        messagebox.showwarning("Ошибка", "В настройках не выбран ни один формат сохранения.")
        return

    saved = False
    if state.settings["save_txt"].get():
        if not file_operations.save_records_to_txt(record_widgets):
            return # Ошибка уже показана в file_operations
        saved = True

    if state.settings["save_excel"].get():
        if not file_operations.save_records_to_excel(record_widgets):
            return # Ошибка уже показана в file_operations
        saved = True

    if saved:
        messagebox.showinfo("Успех", "Данные сохранены!")
        # Обновляем отображение последних задач
        update_last_tasks_display()
        
        # === НОВОЕ: УДАЛЕНИЕ ВСЕХ ЗАПИСЕЙ ПОСЛЕ СОХРАНЕНИЯ ===
        # Создаем копию списка, так как мы будем его модифицировать
        widgets_to_delete = record_widgets.copy()
        # Удаляем все записи из интерфейса
        for rec_dict in widgets_to_delete:
            rec_dict['frame'].destroy()
            record_widgets.remove(rec_dict)
        # === НОВОЕ: ДОБАВЛЕНИЕ НОВОЙ ПУСТОЙ ЗАПИСИ ===
        create_record_wrapper(scrollable_frame)

# === ФУНКЦИЯ: ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ПОСЛЕДНИХ ЗАДАЧ ===
def update_last_tasks_display():
    # Очищаем предыдущее содержимое
    for widget in last_tasks_frame.winfo_children():
        widget.destroy()
    # Получаем количество строк для отображения (ограничиваем 50)
    try:
        # Убираем ограничение min() с 30, теперь используем значение напрямую с ограничением 50
        num_lines = min(state.settings["old_tasks_count"].get(), 50)
    except (tk.TclError, ValueError):
        num_lines = settings.DEFAULT_OLD_TASKS_COUNT
    # Читаем последние строки из текстового файла
    txt_path = state.settings["txt_path"].get()
    last_lines = data_processing.read_last_lines(txt_path, num_lines)
    # Создаем текстовое поле для отображения
    if last_lines:
        # Увеличиваем максимальную высоту текстового поля до 50
        text_widget = tk.Text(last_tasks_frame, height=min(num_lines + 1, 50), width=80, font=("Arial", 9))
        text_widget.pack(fill="both", expand=True, padx=5, pady=5)
        # Добавляем заголовок
        text_widget.insert("1.0", f"Последние {len(last_lines)} задач(и):\n")
        text_widget.insert("2.0", "-" * 50 + "\n")
        # Добавляем строки
        for i, line in enumerate(last_lines, start=3):
            text_widget.insert(f"{i}.0", line)
        # Делаем текстовое поле только для чтения
        text_widget.config(state="disabled")
    else:
        tk.Label(last_tasks_frame, text="Нет данных для отображения", fg="gray").pack(pady=10)

# === НИЖНИЙ ФРЕЙМ С КНОПКАМИ ===
bottom_frame = tk.Frame(root)
bottom_frame.pack(pady=5, padx=10, fill="x")

# === КНОПКИ В НИЖНЕМ ФРЕЙМЕ ===
# Передаем функции из других модулей
tk.Button(bottom_frame, text="📂 Открыть текст", command=file_operations.open_text, bg="#2196F3", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="📊 Открыть таблицу", command=file_operations.open_excel, bg="#4CAF50", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="⚙️ Настройки", command=open_settings, bg="#9C27B0", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="➕ Добавить запись", command=lambda: create_record_wrapper(scrollable_frame), bg="#FF9800", fg="white").pack(side="left", padx=2)
tk.Button(bottom_frame, text="💾 Сохранить всё", command=save_all, bg="#009688", fg="white").pack(side="left", padx=2)
# === НОВАЯ КНОПКА СТАТИСТИКИ ===
# Передаем ссылку на главное окно (root) в функцию show_statistics
tk.Button(bottom_frame, text="📊 Статистика", command=lambda: statistic.show_statistics(root), bg="#FF5722", fg="white").pack(side="left", padx=2)
# === /НОВАЯ КНОПКА СТАТИСТИКИ ===

# === ФРЕЙМ ДЛЯ ОТОБРАЖЕНИЯ ПОСЛЕДНИХ ЗАДАЧ ===
last_tasks_frame = tk.LabelFrame(root, text="Последние задачи", padx=5, pady=5)
last_tasks_frame.pack(pady=5, padx=10, fill="both", expand=True)

# === СОЗДАНИЕ ПЕРВОЙ ЗАПИСИ ПО УМОЛЧАНИЮ ===
create_record_wrapper(scrollable_frame)

# === ИНИЦИАЛИЗАЦИЯ ОТОБРАЖЕНИЯ ПОСЛЕДНИХ ЗАДАЧ ===
update_last_tasks_display()

# === ЗАПУСК ПРИЛОЖЕНИЯ ===
root.mainloop()
