# ui_components.py
# Компоненты пользовательского интерфейса

import tkinter as tk
from tkinter import ttk
from datetime import datetime
from data_processing import get_weekday_rus, get_part_of_day # Импортируем нужные функции
import state # Для доступа к настройкам

# === КЛАСС ДЛЯ TOOLTIP ===
class ToolTip:
    def __init__(self, widget, text):
        self.widget = widget
        self.text = text
        self.tooltip_window = None
        self.id = None
        self.x = self.y = 0
        widget.bind("<Enter>", self.on_enter)
        widget.bind("<Leave>", self.on_leave)

    def on_enter(self, event=None):
        self.schedule()

    def on_leave(self, event=None):
        self.unschedule()
        self.hide_tooltip()

    def schedule(self):
        self.unschedule()
        self.id = self.widget.after(500, self.show_tooltip)

    def unschedule(self):
        id = self.id
        self.id = None
        if id:
            self.widget.after_cancel(id)

    def show_tooltip(self, event=None):
        x, y, _, _ = self.widget.bbox("insert")
        x += self.widget.winfo_rootx() + 25
        y += self.widget.winfo_rooty() + 25
        self.tooltip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        label = tk.Label(tw, text=self.text, justify='left',
                         background="#ffffe0", relief='solid', borderwidth=1,
                         font=("tahoma", "8", "normal"))
        label.pack(ipadx=1)

    def hide_tooltip(self):
        tw = self.tooltip_window
        self.tooltip_window = None
        if tw:
            tw.destroy()

# === ФУНКЦИЯ: СОЗДАНИЕ НОВОЙ ЗАПИСИ ===
def create_record(parent, record_widgets, default_date=None, default_time=None):
    frame = tk.LabelFrame(parent, text="Запись", padx=8, pady=8)
    frame.pack(fill="x", pady=3)
    
    now = datetime.now()
    date_val = default_date or now.strftime("%d.%m.%Y")
    time_val = default_time or now.strftime("%H:%M") # Формат без секунд
    weekday_val = get_weekday_rus(date_val)
    part_of_day_val = get_part_of_day(int(time_val.split(":")[0]) if time_val else now.hour)

    date_var = tk.StringVar(value=date_val)
    time_var = tk.StringVar(value=time_val)
    weekday_var = tk.StringVar(value=weekday_val)
    part_of_day_var = tk.StringVar(value=part_of_day_val)

    def update_weekday(*args):
        weekday_var.set(get_weekday_rus(date_var.get()))

    def update_part_of_day(*args):
        try:
            hour = int(time_var.get().split(":")[0])
            part_of_day_var.set(get_part_of_day(hour))
        except:
            pass

    date_var.trace("w", lambda *args: update_weekday())
    time_var.trace("w", lambda *args: update_part_of_day())

    # === СЕТКА ПОЛЕЙ ===
    row = 0
    # Фрейм для даты, дня недели, времени, кнопки -1, части дня
    datetime_frame = tk.Frame(frame)
    datetime_frame.grid(row=row, column=0, columnspan=4, sticky="ew", pady=(0, 5))
    datetime_frame.columnconfigure(0, weight=1)
    datetime_frame.columnconfigure(1, weight=0)
    datetime_frame.columnconfigure(2, weight=1)
    datetime_frame.columnconfigure(3, weight=0)
    datetime_frame.columnconfigure(4, weight=0)
    
    tk.Entry(datetime_frame, textvariable=date_var, width=10).pack(side="left")
    tk.Label(datetime_frame, textvariable=weekday_var, fg="blue", font=("Arial", 8, "bold")).pack(side="left", padx=(2, 10))
    
    # Фрейм для времени и кнопки -1
    time_button_frame = tk.Frame(datetime_frame)
    time_button_frame.pack(side="left")
    tk.Entry(time_button_frame, textvariable=time_var, width=10).pack(side="left")
    def subtract_hour():
        try:
            current_time = time_var.get()
            hour, minute = map(int, current_time.split(":"))
            new_hour = (hour - 1) % 24
            time_var.set(f"{new_hour:02d}:{minute:02d}")
        except ValueError:
            time_var.set("00:00")
    tk.Button(time_button_frame, text="-1", command=subtract_hour, width=3).pack(side="left", padx=(2, 0))
    
    tk.Label(datetime_frame, textvariable=part_of_day_var, fg="blue", font=("Arial", 8, "bold")).pack(side="left", padx=(2, 0))
    row += 1

    # === НОВОЕ: ФРЕЙМ ДЛЯ ВИДА ЗАДАЧИ (КНОПКИ) И СЛОЖНОСТИ ===
    type_diff_frame = tk.Frame(frame)
    type_diff_frame.grid(row=row, column=0, columnspan=4, sticky="w", pady=(0, 5))

    # --- ВИД ЗАДАЧИ (КНОПКИ) ---
    tk.Label(type_diff_frame, text="Вид задачи:").pack(side="left", padx=(0, 2))
    task_type_var = tk.StringVar(value="Р")
    
    task_types_info = [
        ('У', 'У — Управленческая задача'),
        ('Р', 'Р — рутина, текучка'),
        ('ОК', 'ОК — Обще-кристовская задача'),
        ('Л', 'Л — Личные дела'),
        ('ЗП', 'ЗП — Зарплаты сотрудников'),
        ('ГК', 'ГК — Работы по сдаче документов ГК'),
        ('КК', 'КК — Криста Команда')
    ]
    
    task_type_buttons_frame = tk.Frame(type_diff_frame)
    task_type_buttons_frame.pack(side="left")
    
    def set_task_type(val):
        task_type_var.set(val)
        for btn_info in task_type_buttons:
            btn_widget = btn_info['button']
            if btn_widget.cget('text') == val:
                btn_widget.config(bg='#2196F3', fg='white') # Синий для выбранной
            else:
                btn_widget.config(bg='#f0f0f0', fg='black') # Серый по умолчанию

    task_type_buttons = []
    for code, description in task_types_info:
        btn = tk.Button(task_type_buttons_frame, text=code, width=3, height=1, font=("Arial", 8))
        btn.config(command=lambda v=code: set_task_type(v))
        btn.pack(side="left", padx=1)
        tooltip = ToolTip(btn, description)
        task_type_buttons.append({'button': btn, 'tooltip': tooltip})
        
    set_task_type(task_type_var.get()) # Установить начальное выделение

    # --- СЛОЖНОСТЬ (ДИНАМИЧЕСКИ) ---
    tk.Label(type_diff_frame, text="Сложность:").pack(side="left", padx=(10, 2))
    
    difficulty_style = state.settings["difficulty_style"].get()
    difficulty_var = tk.StringVar(value="1")
    difficulty_buttons_frame = None
    difficulty_combo_hidden = None
    
    if difficulty_style == "buttons":
        difficulty_buttons_frame = tk.Frame(type_diff_frame)
        difficulty_buttons_frame.pack(side="left")
        def set_difficulty(val):
            difficulty_var.set(val)
            for btn in difficulty_buttons:
                if btn.cget('text') == val:
                    btn.config(bg='#4CAF50', fg='white') # Зеленый для выбранной
                else:
                    btn.config(bg='#f0f0f0', fg='black') # Серый по умолчанию
        difficulty_buttons = []
        for i in range(6):
            btn = tk.Button(difficulty_buttons_frame, text=str(i), width=2, height=1, font=("Arial", 8))
            btn.config(command=lambda v=str(i): set_difficulty(v))
            btn.pack(side="left", padx=1)
            difficulty_buttons.append(btn)
        set_difficulty(difficulty_var.get()) # Установить начальное выделение
    else:
        difficulty_combo_hidden = ttk.Combobox(type_diff_frame, textvariable=difficulty_var, values=[str(i) for i in range(6)], width=4)
        difficulty_combo_hidden.pack(side="left")
    # === /НОВОЕ ===
    
    # Описание задачи
    row += 1
    tk.Label(frame, text="Описание:").grid(row=row, column=0, sticky="nw", pady=(5, 0))
    description_text = tk.Text(frame, height=2, width=60)
    description_text.bind("<Control-v>", lambda event: description_text.event_generate("<<Paste>>"))
    description_text.grid(row=row, column=1, columnspan=3, sticky="ew", pady=(5, 0))
    frame.columnconfigure(1, weight=1)
    frame.columnconfigure(2, weight=1)
    frame.columnconfigure(3, weight=1)

    # Кнопки Сброс/Удалить
    row += 1
    btn_frame = tk.Frame(frame)
    btn_frame.grid(row=row, column=0, columnspan=4, pady=(5, 0))
    
    def reset_record():
        now = datetime.now()
        date_var.set(now.strftime("%d.%m.%Y"))
        time_var.set(now.strftime("%H:%M"))
        task_type_var.set("Р")
        difficulty_var.set("1")
        description_text.delete("1.0", "end")
        set_task_type("Р")
        if difficulty_style == "buttons":
            set_difficulty("1")

    def delete_record():
        frame.destroy()
        # Предполагается, что record_widgets передается корректно из main.py
        # main.py должен управлять этим списком. 
        # Здесь мы просто удаляем фрейм. Логика удаления из record_widgets должна быть в main.py
        # при итерации по списку или через callback.
        # Простое удаление из record_widgets здесь может быть небезопасно.
        # Лучше: if rec_dict in record_widgets: record_widgets.remove(rec_dict) в main.py
        
    tk.Button(btn_frame, text="Сброс", command=reset_record, bg="#FFA500", fg="white", font=("Arial", 8)).pack(side="left", padx=2)
    tk.Button(btn_frame, text="Удалить", command=delete_record, bg="#FF4444", fg="white", font=("Arial", 8)).pack(side="left", padx=2)
    
    # Словарь для хранения ссылок на виджеты записи
    rec_dict = {
        'frame': frame,
        'date_var': date_var,
        'time_var': time_var,
        'weekday_var': weekday_var,
        'part_of_day_var': part_of_day_var,
        'task_type_var': task_type_var,
        'description_text': description_text,
        'difficulty_var': difficulty_var,
        # Элементы управления видом задачи
        'task_type_buttons_frame': task_type_buttons_frame,
        'task_type_buttons': task_type_buttons, # Список {'button': ..., 'tooltip': ...}
        # Элементы управления сложностью
        'difficulty_style': difficulty_style,
        'difficulty_buttons_frame': difficulty_buttons_frame,
        'difficulty_combo_hidden': difficulty_combo_hidden,
    }
    record_widgets.append(rec_dict) # Добавляем в список из main.py
    
    return rec_dict
