import {
  extensionApi,handleNotificationButton,handleNotificationClick,handleNotificationClosed,
  handleReminderAlarm,syncReminderAlarm
} from "./reminders.js";
import {handleAutoTrackAlarm,initAutoTrack,syncAutoTrackAlarm} from "./autotrack.js";

// Service worker: listeners are registered synchronously so the browser can wake it for events.
const api=extensionApi();

if(api){
  api.runtime?.onInstalled?.addListener(()=>{ void syncReminderAlarm(); void syncAutoTrackAlarm(); });
  api.runtime?.onStartup?.addListener(()=>{ void syncReminderAlarm(); void syncAutoTrackAlarm(); });
  api.alarms?.onAlarm?.addListener((alarm:{name?:string})=>{
    const name=String(alarm?.name??"");
    void handleReminderAlarm(name);
    void handleAutoTrackAlarm(name);
  });
  api.notifications?.onButtonClicked?.addListener((id:string,index:number)=>{ void handleNotificationButton(String(id??""),Number(index)||0); });
  api.notifications?.onClicked?.addListener((id:string)=>{ void handleNotificationClick(String(id??"")); });
  api.notifications?.onClosed?.addListener((id:string,byUser:boolean)=>{ void handleNotificationClosed(String(id??""),Boolean(byUser)); });
  void syncReminderAlarm();
  void syncAutoTrackAlarm();
  void initAutoTrack();
}
