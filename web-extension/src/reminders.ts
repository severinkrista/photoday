import type {ReminderSettings} from "./model.js";
import {getReminderState,getSettings,markAddEntry,saveReminderState} from "./storage.js";

export const REMINDER_ALARM="photoday-reminder";
export const REMINDER_NOTIFICATION="photoday-reminder";
/** Окно формы новой записи, которое открывается по кнопке «ОК» в уведомлении. */
export const ADD_WINDOW={width:780,height:920};

type ExtensionApi={
  alarms?:any; notifications?:any; runtime?:any; action?:any; windows?:any; tabs?:any;
};
export function extensionApi():ExtensionApi|null{
  const scope=globalThis as any;
  return (scope.browser ?? scope.chrome ?? null) as ExtensionApi|null;
}

export function periodMinutes(reminders:ReminderSettings):number{
  const every=Math.max(1,Math.floor(reminders.every||1));
  return reminders.unit==="minutes"?every:every*60;
}

export function parseClock(value:unknown):number|null{
  const match=/^(\d{1,2}):(\d{2})$/.exec(String(value??"").trim());
  if(!match)return null;
  const hours=Number(match[1]),minutes=Number(match[2]);
  if(hours>23||minutes>59)return null;
  return hours*60+minutes;
}

/** Попадает ли текущее время в диапазон напоминаний (диапазон может переходить через полночь). */
export function inRange(now:Date,reminders:ReminderSettings):boolean{
  const from=parseClock(reminders.from),to=parseClock(reminders.to);
  if(from===null||to===null)return false;
  const current=now.getHours()*60+now.getMinutes();
  if(from===to)return true;
  return from<to?current>=from&&current<to:current>=from||current<to;
}

export function reminderSummary(reminders:ReminderSettings):string{
  if(!reminders.enabled)return "Напоминания выключены.";
  const every=reminders.unit==="hours"?reminders.every+" ч":reminders.every+" мин";
  const range=reminders.from===reminders.to?"весь день":reminders.from+"–"+reminders.to;
  return "Уведомление каждые "+every+", "+range+".";
}

/** Пересоздаёт будильник напоминаний, если он выключен или его период разошёлся с настройками. */
export async function syncReminderAlarm():Promise<void>{
  const api=extensionApi();
  if(!api?.alarms)return;
  const settings=await getSettings();
  const period=periodMinutes(settings.reminders);
  const existing=await Promise.resolve(api.alarms.get(REMINDER_ALARM)).catch(()=>null);
  if(!settings.reminders.enabled){
    if(existing)await Promise.resolve(api.alarms.clear(REMINDER_ALARM)).catch(()=>undefined);
    return;
  }
  if(existing&&Number(existing.periodInMinutes)===period)return;
  await Promise.resolve(api.alarms.clear(REMINDER_ALARM)).catch(()=>undefined);
  api.alarms.create(REMINDER_ALARM,{delayInMinutes:period,periodInMinutes:period});
}

/** Срабатывание будильника: уведомление показывается только внутри диапазона и не чаще заданной частоты. */
export async function handleReminderAlarm(name:string):Promise<void>{
  if(name!==REMINDER_ALARM)return;
  const settings=await getSettings();
  const reminders=settings.reminders;
  if(!reminders.enabled)return;
  const now=new Date();
  if(!inRange(now,reminders))return;
  const state=await getReminderState();
  const last=Number(state.lastNotifiedAt)||0;
  if(last&&now.getTime()-last<periodMinutes(reminders)*60_000*0.9)return;
  await saveReminderState({lastNotifiedAt:now.getTime()});
  await showReminder();
}

export async function notificationPermission():Promise<string>{
  const api=extensionApi();
  if(!api?.notifications?.getPermissionLevel)return "granted";
  try{
    const level=await Promise.resolve(api.notifications.getPermissionLevel());
    return typeof level==="string"?level:"granted";
  }catch(e){return "granted";}
}

export async function showReminder():Promise<void>{
  const api=extensionApi();
  if(!api?.notifications)throw new Error("Уведомления недоступны в этом браузере.");
  const iconUrl=api.runtime?.getURL?(api.runtime.getURL as (path:string)=>string)("icons/icon128.png"):"icons/icon128.png";
  await new Promise<void>(resolve=>{
    try{
      api.notifications.create(REMINDER_NOTIFICATION,{
        type:"basic",
        iconUrl,
        title:"Фото дня",
        message:"Опишите завершённые задачи, пока не забыли, что было сделано.",
        contextMessage:"«ОК» — открыть форму новой записи.",
        buttons:[{title:"ОК"},{title:"Отмена"}],
        requireInteraction:true,
        priority:2
      },()=>{ void api.runtime?.lastError; resolve(); });
    }catch(e){resolve();}
  });
}

/** Открывает окно плагина для ввода новой записи: сначала popup, иначе отдельное окно. */
export async function openAddWindow():Promise<void>{
  const api=extensionApi();
  if(!api)return;
  // Попап открывается без параметров URL, поэтому режим «новой записи» помечаем заранее.
  await markAddEntry();
  try{
    if(api.action?.openPopup){await Promise.resolve(api.action.openPopup());return;}
  }catch(e){/* Chrome < 127 или popup недоступен — открываем отдельное окно */}
  const url=api.runtime?.getURL?(api.runtime.getURL as (path:string)=>string)("popup.html?new=1"):"popup.html?new=1";
  try{
    if(api.windows?.create){
      await Promise.resolve(api.windows.create({url,type:"popup",width:ADD_WINDOW.width,height:ADD_WINDOW.height,focused:true}));
      return;
    }
  }catch(e){/* окно не открылось — пробуем вкладку */}
  try{await Promise.resolve(api.tabs?.create?.({url}));}catch(e){/* иначе просто ничего не открываем */}
}
