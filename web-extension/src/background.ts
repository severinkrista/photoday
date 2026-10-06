import {REMINDER_NOTIFICATION,extensionApi,handleReminderAlarm,openAddWindow,syncReminderAlarm} from "./reminders.js";

// Service worker расширения: следит за будильником напоминаний и реакцией на уведомление.
const api=extensionApi();

if(api){
  // Будильники не гарантированно переживают перезапуск браузера и обновление расширения.
  api.runtime?.onInstalled?.addListener(()=>{ void syncReminderAlarm(); });
  api.runtime?.onStartup?.addListener(()=>{ void syncReminderAlarm(); });
  api.alarms?.onAlarm?.addListener((alarm:{name?:string})=>{ void handleReminderAlarm(String(alarm?.name??"")); });
  api.notifications?.onButtonClicked?.addListener((id:string,index:number)=>{
    if(id!==REMINDER_NOTIFICATION)return;
    void Promise.resolve(api.notifications.clear(id)).catch(()=>undefined);
    // Кнопка «ОК» открывает форму новой записи, «Отмена» ничего не открывает.
    if(index===0)void openAddWindow();
  });
  api.notifications?.onClicked?.addListener((id:string)=>{
    if(id!==REMINDER_NOTIFICATION)return;
    void Promise.resolve(api.notifications.clear(id)).catch(()=>undefined);
    void openAddWindow();
  });
  void syncReminderAlarm();
}
