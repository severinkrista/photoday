export interface TaskRecord { id?:string; date?:string; time?:string; weekday:string; partOfDay:string; taskType:string; task:string; difficulty?:number; attachmentFolder?:string; attachmentName?:string; }
export interface TaskTypeDefinition { code:string; description:string; }
/** Настройки напоминаний: диапазон времени и частота уведомлений. */
export interface ReminderSettings { enabled:boolean; from:string; to:string; every:number; unit:"minutes"|"hours"; }
export interface AppSettings { displayMode:"tasks"|"days"; tasksToShow:number; daysToShow:number; diskPath:string; taskTypes:TaskTypeDefinition[]; reminders:ReminderSettings; }
export const DEFAULT_TASK_TYPES:TaskTypeDefinition[]=[
{code:"У",description:"управленческие задачи"},{code:"Р",description:"рутина, рядовые рабочие задачи"},{code:"ОК",description:"задачи касающиеся всей компании в целом, не только моим департаментом"},{code:"Л",description:"личные задачи, не касающиеся рабочих вопросов"},{code:"ЗП",description:"задачи, связанные с зарплатой или премией моих сотрудников"},{code:"ГК",description:"задачи, связанные с государственными конктрактами"},{code:"КК",description:"задачи КристаКоманды (тренинги в нашей компании, выездные мероприятия и т.п.)"}];
export const DEFAULT_REMINDERS:ReminderSettings={enabled:true,from:"09:00",to:"18:00",every:1,unit:"hours"};
export const DEFAULT_SETTINGS:AppSettings={displayMode:"tasks",tasksToShow:10,daysToShow:2,diskPath:"disk:/Криста/Программы/photoday/photoday.xlsx",taskTypes:DEFAULT_TASK_TYPES,reminders:DEFAULT_REMINDERS};
/** Размер окна плагина, который пользователь задал перетаскиванием уголка. */
export interface PopupSize { width:number; height:number; }
/** Допустимые границы окна плагина: снизу — чтобы содержимое осталось читаемым, сверху — предел popup в Chrome (800×600). */
export const POPUP_SIZE={minWidth:320,minHeight:460,maxWidth:800,maxHeight:600};
export const DEFAULT_POPUP_SIZE:PopupSize={width:720,height:600};
export interface PendingTask { task:TaskRecord; attachment?:{name:string;type:string;data:ArrayBuffer}; createdAt:number|string; }
