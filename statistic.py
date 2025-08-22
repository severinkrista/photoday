# statistic.py
# Функции для сбора статистики из сохраненных данных

import os
from datetime import datetime, timedelta
from openpyxl import load_workbook
import state  # Для доступа к пути Excel-файла из настроек

# Предполагаемые индексы колонок в Excel (с 1, как в Excel)
DATE_COL_INDEX = 1      # Колонка "Дата"
TASK_TYPE_COL_INDEX = 5 # Колонка "Вид задачи"
DIFFICULTY_COL_INDEX = 7 # Колонка "Сложность"

# Кэширование распарсенных дат для ускорения
_date_cache = {}

def _parse_date_cached(date_value):
    """Парсит дату с кэшированием для ускорения."""
    if date_value in _date_cache:
        return _date_cache[date_value]
    
    record_date = None
    if isinstance(date_value, datetime):
        record_date = date_value.date()
    elif isinstance(date_value, str):
        try:
            # Пытаемся распарсить дату в формате dd.mm.yyyy
            record_date = datetime.strptime(date_value, "%d.%m.%Y").date()
        except ValueError:
            pass
    
    _date_cache[date_value] = record_date
    return record_date

def get_task_statistics():
    """
    Считает статистику по записям из Excel-файла.
    
    Возвращает словарь с ключами:
    - 'current_day': {'count': int, 'total_difficulty': int, 'difficulty_by_type': dict}
    - 'previous_day': {'count': int, 'total_difficulty': int, 'difficulty_by_type': dict}
    - 'error': str or None (если ошибка произошла)
    """
    stats = {
        'current_day': {
            'count': 0,
            'total_difficulty': 0,
            'difficulty_by_type': {}
        },
        'previous_day': {
            'count': 0,
            'total_difficulty': 0,
            'difficulty_by_type': {}
        },
        'error': None
    }

    # Получаем путь к Excel-файлу из настроек
    xlsx_path = state.settings.get("excel_path", None)
    if not xlsx_path:
        stats['error'] = "Путь к Excel-файлу не задан в настройках."
        return stats

    xlsx_path_value = xlsx_path.get() if hasattr(xlsx_path, 'get') else xlsx_path
    if not xlsx_path_value:
        stats['error'] = "Путь к Excel-файлу пуст."
        return stats

    if not os.path.exists(xlsx_path_value):
        stats['error'] = f"Excel-файл не найден: {xlsx_path_value}"
        return stats

    # Очистка кэша перед каждым вызовом
    global _date_cache
    _date_cache = {}

    try:
        # Открываем файл в режиме только для чтения и без вычисления формул
        wb = load_workbook(xlsx_path_value, read_only=True, data_only=True)
        ws = wb.active

        # Определяем сегодняшнюю и вчерашнюю даты
        today = datetime.now().date()
        yesterday = today - timedelta(days=1)

        # Пропускаем заголовок, если он есть
        start_row = 1
        if ws.max_row > 0:
            first_date_cell = ws.cell(row=1, column=DATE_COL_INDEX).value
            if isinstance(first_date_cell, str) and 'дата' in first_date_cell.lower():
                start_row = 2

        # Используем iter_rows для более эффективного чтения
        # Ограничиваем количество читаемых колонок для ускорения
        # max_col=DIFFICULTY_COL_INDEX предполагает, что нужные данные находятся в первых нескольких колонках
        for row in ws.iter_rows(min_row=start_row, values_only=True, max_col=DIFFICULTY_COL_INDEX):
            # Получаем дату из кортежа (индекс DATE_COL_INDEX - 1, так как values_only возвращает кортеж с 0)
            date_cell_value = row[DATE_COL_INDEX - 1] if len(row) >= DATE_COL_INDEX else None
            if not date_cell_value:
                continue

            # Используем кэшированную функцию парсинга даты
            record_date = _parse_date_cached(date_cell_value)

            # Если дата не распознана или не относится к сегодня/вчера, пропускаем
            if record_date is None or (record_date != today and record_date != yesterday):
                continue

            # Получаем вид задачи и сложность из кортежа
            task_type = row[TASK_TYPE_COL_INDEX - 1] if len(row) >= TASK_TYPE_COL_INDEX else None
            if not task_type:
                task_type = "Не указан"

            difficulty_raw = row[DIFFICULTY_COL_INDEX - 1] if len(row) >= DIFFICULTY_COL_INDEX else None
            try:
                difficulty = int(difficulty_raw) if difficulty_raw is not None else 0
            except (ValueError, TypeError):
                difficulty = 0

            # Определяем, к какому дню относится запись
            target_day_key = 'current_day' if record_date == today else 'previous_day'
            
            # Обновляем статистику
            stats[target_day_key]['count'] += 1
            stats[target_day_key]['total_difficulty'] += difficulty
            
            if task_type not in stats[target_day_key]['difficulty_by_type']:
                stats[target_day_key]['difficulty_by_type'][task_type] = 0
            stats[target_day_key]['difficulty_by_type'][task_type] += difficulty

    except Exception as e:
        stats['error'] = f"Ошибка при чтении Excel-файла: {e}"
    finally:
        if 'wb' in locals():
            wb.close()

    return stats

# Пример использования
if __name__ == "__main__":
    pass