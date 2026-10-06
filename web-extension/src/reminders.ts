import type {ReminderSettings} from "./model.js";
import {getReminderState,getSettings,markAddEntry,saveReminderEvent,saveReminderState} from "./storage.js";

export const REMINDER_ALARM="photoday-reminder";
/**
 * Префикс идентификатора напоминания. Сам идентификатор уникален для каждого показа:
 * так новое напоминание не «залипает» на старом, которое пользователь ещё не закрыл,
 * а обработчик узнаёт своё уведомление по префиксу.
 */
export const REMINDER_NOTIFICATION="photoday-reminder";
export function isReminderNotification(id:unknown):boolean{
  return String(id??"").startsWith(REMINDER_NOTIFICATION);
}
/** Окно формы новой записи, которое открывается по кнопке «ОК» в уведомлении. */
export const ADD_WINDOW={width:780,height:920};
/** Подписи кнопок уведомления: «ОК» открывает форму, «Отмена» просто закрывает уведомление. */
export const NOTIFICATION_BUTTONS=[{title:"ОК"},{title:"Отмена"}];

type ExtensionApi={
  alarms?:any; notifications?:any; runtime?:any; action?:any; windows?:any; tabs?:any; storage?:any;
};
export function extensionApi():ExtensionApi|null{
  const scope=globalThis as any;
  return (scope.browser ?? scope.chrome ?? null) as ExtensionApi|null;
}

function errorText(error:unknown):string{
  if(error instanceof Error)return error.message;
  const text=String(error??"");
  return text&&text!=="undefined"?text:"неизвестная ошибка";
}
/** Диагностика остаётся в консоли службы: её видно в chrome://extensions → «Служебный процесс». */
function trace(message:string,...details:unknown[]){
  try{console.info("[photoday] "+message,...details);}catch(e){/* консоль недоступна — не мешает работе */}
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

/**
 * Операционная система, если браузер её сообщает. Нужна для одной особенности macOS:
 * там `requireInteraction` на «basic»-уведомлении приводит к мгновенному скрытию баннера,
 * и нажать кнопки пользователь не успевает.
 */
export async function platformOs():Promise<string>{
  const api=extensionApi();
  if(!api?.runtime?.getPlatformInfo)return "";
  try{
    const info=await Promise.resolve(api.runtime.getPlatformInfo());
    return String((info as {os?:string})?.os??"");
  }catch(e){return "";}
}

export async function notificationPermission():Promise<string>{
  const api=extensionApi();
  if(!api?.notifications?.getPermissionLevel)return "granted";
  try{
    const level=await Promise.resolve(api.notifications.getPermissionLevel());
    return typeof level==="string"?level:"granted";
  }catch(e){return "granted";}
}

/** Сколько напоминаний сейчас висит в центре уведомлений (если браузер умеет их перечислять). */
export async function activeReminderNotifications():Promise<number|null>{
  const api=extensionApi();
  if(!api?.notifications?.getAll)return null;
  try{
    const all=await Promise.resolve(api.notifications.getAll());
    return Object.keys(all??{}).filter(isReminderNotification).length;
  }catch(e){return null;}
}

/**
 * Показывает напоминание с кнопками «ОК» и «Отмена» и возвращает его идентификатор.
 * Идентификатор уникален, поэтому повторные напоминания не подменяют уже показанное.
 */
export async function showReminder():Promise<string>{
  const api=extensionApi();
  if(!api?.notifications)throw new Error("Уведомления недоступны в этом браузере.");
  const id=`${REMINDER_NOTIFICATION}-${Date.now()}`;
  // На macOS уведомление с requireInteraction скрывается само: кнопки нажать не успеваешь.
  const holdOnScreen=(await platformOs())!=="mac";
  const iconUrl=api.runtime?.getURL?(api.runtime.getURL as (path:string)=>string)("icons/icon128.png"):"icons/icon128.png";
  await new Promise<void>(resolve=>{
    try{
      api.notifications.create(id,{
        type:"basic",
        iconUrl,
        title:"Фото дня",
        message:"Опишите завершённые задачи, пока не забыли, что было сделано.",
        contextMessage:"«ОК» — форма новой записи; можно просто нажать на это уведомление.",
        buttons:NOTIFICATION_BUTTONS,
        requireInteraction:holdOnScreen,
        priority:2
      },()=>{ void api.runtime?.lastError; resolve(); });
    }catch(e){
      trace("не удалось показать уведомление",errorText(e));
      resolve();
    }
  });
  trace("показано напоминание",id);
  await saveReminderEvent({kind:"shown",at:Date.now(),notificationId:id,action:"Уведомление показано, ждём нажатия."});
  return id;
}

export interface OpenResult {
  opened:"popup"|"window"|"tab"|"none";
  error?:string;
}
function openedText(result:OpenResult):string{
  switch(result.opened){
    case "popup":return "Открылось окно плагина (popup).";
    case "window":return "Открылось отдельное окно формы новой записи.";
    case "tab":return "Форма новой записи открылась в новой вкладке.";
    default:return "Не удалось открыть окно: "+(result.error??"причина неизвестна");
  }
}

/**
 * Открывает форму новой записи. Способы пробуются по порядку:
 * popup на панели (Chrome 127+), отдельное окно, вкладка. Ошибки не скрываются:
 * они попадают в журнал события и в консоль службы, чтобы сбой было видно.
 */
export async function openAddWindow():Promise<OpenResult>{
  const api=extensionApi();
  if(!api)return {opened:"none",error:"Нет доступа к API расширения."};
  // Попап открывается без параметров URL, поэтому режим «новой записи» помечаем заранее.
  await markAddEntry();
  const errors:string[]=[];

  if(api.action?.openPopup){
    try{
      await Promise.resolve(api.action.openPopup());
      trace("форма открыта через action.openPopup");
      return {opened:"popup"};
    }catch(e){
      errors.push("openPopup: "+errorText(e));
      trace("action.openPopup не сработал",errorText(e));
    }
  }

  const url=api.runtime?.getURL?(api.runtime.getURL as (path:string)=>string)("popup.html?new=1"):"popup.html?new=1";
  if(api.windows?.create){
    try{
      await Promise.resolve(api.windows.create({url,type:"popup",width:ADD_WINDOW.width,height:ADD_WINDOW.height,focused:true}));
      trace("форма открыта отдельным окном");
      return {opened:"window"};
    }catch(e){
      errors.push("windows.create: "+errorText(e));
      trace("windows.create не сработал",errorText(e));
    }
  }
  if(api.tabs?.create){
    try{
      await Promise.resolve(api.tabs.create({url}));
      trace("форма открыта вкладкой");
      return {opened:"tab"};
    }catch(e){
      errors.push("tabs.create: "+errorText(e));
      trace("tabs.create не сработал",errorText(e));
    }
  }
  return {opened:"none",error:errors.join("; ")||"Ни один способ открытия окна недоступен."};
}

/** Закрывает уведомление напоминания (если браузер уже его закрыл — это не ошибка). */
export async function clearNotification(id:string):Promise<void>{
  const api=extensionApi();
  if(!api?.notifications?.clear)return;
  try{await Promise.resolve(api.notifications.clear(id));}catch(e){/* уведомление уже закрыто */}
}

/** Нажатие кнопки в уведомлении: «ОК» открывает форму, «Отмена» закрывает уведомление без окна. */
export async function handleNotificationButton(id:string,index:number):Promise<void>{
  if(!isReminderNotification(id))return;
  const title=NOTIFICATION_BUTTONS[index]?.title??("кнопка "+(index+1));
  trace("нажата кнопка уведомления",id,title);
  await clearNotification(id);
  if(index!==0){
    await saveReminderEvent({kind:"button",button:title,index,at:Date.now(),notificationId:id,action:"«Отмена» — уведомление закрыто, окно не открывалось."});
    return;
  }
  const result=await openAddWindow();
  await saveReminderEvent({kind:"button",button:title,index,at:Date.now(),notificationId:id,opened:result.opened,error:result.error,action:openedText(result)});
}

/** Клик по самому уведомлению (не по кнопке) тоже открывает форму новой записи. */
export async function handleNotificationClick(id:string):Promise<void>{
  if(!isReminderNotification(id))return;
  trace("нажато уведомление",id);
  await clearNotification(id);
  const result=await openAddWindow();
  await saveReminderEvent({kind:"body",at:Date.now(),notificationId:id,opened:result.opened,error:result.error,action:openedText(result)});
}

/** Уведомление закрыто пользователем или системой: фиксируем для диагностики. */
export async function handleNotificationClosed(id:string,byUser:boolean):Promise<void>{
  if(!isReminderNotification(id))return;
  await saveReminderEvent({kind:"closed",at:Date.now(),notificationId:id,action:byUser?"Уведомление закрыто пользователем.":"Уведомление закрыто системой."});
}
