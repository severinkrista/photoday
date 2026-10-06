import type {TaskRecord} from "./model.js";

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** День недели по локальной дате: 0 — понедельник. */
export function weekdayOf(date: Date): string {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

/** Часть дня — тот же контракт, что и в Android-приложении. */
export function partOfDay(hour: number): string {
  if (hour < 8) return "До начала рабочего дня";
  if (hour < 12) return "Утро";
  if (hour < 15) return "Обед";
  if (hour < 18) return "Вечер";
  return "После конца рабочего дня";
}

export function localDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function localTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(x => String(x).padStart(2, "0")).join(":");
}

/** Значения полей «дата» и «время» → момент записи. Некорректные значения дают null. */
export function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  const d = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = timeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute, second] = [Number(t[1]), Number(t[2]), t[3] ? Number(t[3]) : 0];
  if (hour > 23 || minute > 59 || second > 59) return null;
  const value = new Date(year, month - 1, day, hour, minute, second, 0);
  // Отсекаем «нормализацию» несуществующих дат вроде 31 февраля.
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return null;
  return value;
}

/** «05.10.2026 14:30» */
export function formatDateTime(date: Date): string {
  return [
    [String(date.getDate()).padStart(2, "0"), String(date.getMonth() + 1).padStart(2, "0"), date.getFullYear()].join("."),
    localTime(date).slice(0, 5)
  ].join(" ");
}

/** Дата из XLSX (ГГГГ-ММ-ДД или ДД.ММ.ГГГГ) в вид ДД.ММ.ГГГГ. */
export function displayDate(value?: string): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return value;
  return [iso[3], iso[2], iso[1]].join(".");
}

/** Дата и время записи одной строкой для карточек списка. */
export function momentLabel(record: TaskRecord): string {
  return [displayDate(record.date), (record.time ?? "").slice(0, 5)].filter(Boolean).join(" ");
}
