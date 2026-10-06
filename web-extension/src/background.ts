import {
  extensionApi,handleNotificationButton,handleNotificationClick,handleNotificationClosed,
  handleReminderAlarm,syncReminderAlarm
} from "./reminders.js";

// Service worker расширения: будильник напоминаний и реакция на уведомление.
// Все слушатели регистрируются синхронно при запуске службы — иначе Chrome не разбудит её событием.
const api=extensionApi();

if(api){
  // Будильники не гарантированно переживают перезапуск браузера и обновление расширения.
  api.runtime?.onInstalled?.addListener(()=>{ void syncReminderAlarm(); });
  api.runtime?.onStartup?.addListener(()=>{ void syncReminderAlarm(); });
  api.alarms?.onAlarm?.addListener((alarm:{name?:string})=>{ void handleReminderAlarm(String(alarm?.name??"")); });
  api.notifications?.onButtonClicked?.addListener((id:string,index:number)=>{ void handleNotificationButton(String(id??""),Number(index)||0); });
  api.notifications?.onClicked?.addListener((id:string)=>{ void handleNotificationClick(String(id??"")); });
  api.notifications?.onClosed?.addListener((id:string,byUser:boolean)=>{ void handleNotificationClosed(String(id??""),Boolean(byUser)); });
  void syncReminderAlarm();
}
