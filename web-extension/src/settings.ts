import type {AppSettings,ReminderEvent,ReminderSettings} from "./model.js";
import {clearLocalData,getReminderEvent,getSettings,saveSettings} from "./storage.js";
import {isHttpUrl} from "./model.js";
import {connectToYandex,testConnection} from "./yandex.js";
import {activeReminderNotifications,extensionApi,notificationPermission,reminderSummary,showReminder,syncReminderAlarm} from "./reminders.js";
import {REMINDER_EVENT_KEY} from "./storage.js";
import {getAutoTrackSettings,saveAutoTrackSettings} from "./autotrack-storage.js";
import type {AutoTrackSettings} from "./autotrack-storage.js";
import {syncAutoTrackAlarm,uploadAutotrackNow} from "./autotrack.js";

let settings:AppSettings;
let autotrackSettings:AutoTrackSettings;
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$(id) as HTMLInputElement;

async function bindClick(id:string,handler:()=>void){const el=$(id);if(el)el.onclick=handler;}

async function init(){
  try{
    settings=await getSettings();
    autotrackSettings=await getAutoTrackSettings();
    render();
    bindClick("save",()=>void save());
    bindClick("connect",()=>void connect());
    bindClick("testConnection",()=>void test());
    bindClick("clearCache",()=>void clearCache());
    bindClick("addType",()=>{syncTypesFromDom();settings.taskTypes.push({code:"Новый",description:""});render();});
    bindClick("testReminder",()=>void testReminder());
    bindClick("autotrackUploadNow",()=>void uploadAutotrack());
    // Сведения о напоминании обновляем при возврате на страницу: нажатие кнопки в уведомлении
    // обрабатывает служебный процесс, поэтому результат появляется здесь с задержкой.
    window.addEventListener("focus",()=>void renderNotificationDiagnostics());
    // Нажатие кнопки в уведомлении обрабатывает служебный процесс: о результате узнаём из хранилища.
    try{extensionApi()?.storage?.onChanged?.addListener((changes:Record<string,unknown>)=>{
      if(changes&&REMINDER_EVENT_KEY in changes)void renderNotificationDiagnostics();
    });}catch(e){/* подписка недоступна — сведения обновятся при возврате на страницу */}
    $("modeTasks").onchange=()=>{syncDisplayValue();syncTypesFromDom();settings.displayMode="tasks";render();};
    $("modeDays").onchange=()=>{syncDisplayValue();syncTypesFromDom();settings.displayMode="days";render();};
    for(const id of ["remindersEnabled","remindersFrom","remindersTo","remindersEvery","remindersUnit"]){
      $(id).addEventListener("change",updateReminderSummary);
      $(id).addEventListener("input",updateReminderSummary);
    }
  }catch(e){
    const status=$("status");
    if(status)status.textContent="Ошибка загрузки настроек: "+(e instanceof Error?e.message:String(e));
  }
}

function syncDisplayValue(){const n=Math.max(1,Number(input("tasks").value)||1);if(settings.displayMode==="tasks")settings.tasksToShow=n;else settings.daysToShow=n;}
function syncTypesFromDom(){if(!settings)return;settings.taskTypes=Array.from(document.querySelectorAll(".type-row")).map(r=>({code:(r.querySelector('[data-role="code"]') as HTMLInputElement).value.trim(),description:(r.querySelector('[data-role="description"]') as HTMLInputElement).value.trim()}));}

function render(){
  input("diskPath").value=settings.diskPath;
  input("autotrackEnabled").checked=autotrackSettings.enabled;
  input("autotrackRootPath").value=autotrackSettings.rootPath;
  input("autotrackEveryMinutes").value=String(autotrackSettings.uploadEveryMinutes);
  input("fileUrl").value=settings.fileUrl??"";
  const n=settings.displayMode==="tasks"?settings.tasksToShow:settings.daysToShow;
  input("tasks").value=String(n);
  input("modeTasks").checked=settings.displayMode==="tasks";
  input("modeDays").checked=settings.displayMode==="days";
  $("displayNumberLabel").textContent=settings.displayMode==="tasks"?"Количество задач":"Количество дней";
  const root=$("types");
  root.innerHTML="";
  settings.taskTypes.forEach((t,i)=>{
    const row=document.createElement("div");
    row.className="type-row";
    const code=document.createElement("input");
    code.value=t.code;
    code.dataset.role="code";
    const desc=document.createElement("input");
    desc.value=t.description;
    desc.dataset.role="description";
    const del=document.createElement("button");
    del.type="button";
    del.textContent="Удалить";
    del.onclick=()=>{if(!confirm(`Удалить тип задачи «${t.code} — ${t.description}»?`))return;syncTypesFromDom();settings.taskTypes.splice(i,1);render();};
    row.append(code,desc,del);
    root.append(row);
  });
  renderReminders();
  void renderNotificationDiagnostics();
}

/** Человекочитаемое описание последнего события напоминания. */
function describeEvent(event:ReminderEvent|null):string{
  if(!event)return "Событий пока не было.";
  const time=new Date(event.at).toLocaleTimeString();
  const what=event.kind==="button"?`нажата кнопка «${event.button}»`
    :event.kind==="body"?"нажато само уведомление"
    :event.kind==="closed"?"уведомление закрыто"
    :"уведомление показано";
  return `${time} — ${what}. ${event.action}${event.error?" Причина: "+event.error+".":""}`;
}

/**
 * Сведения о напоминаниях: разрешение браузера, сколько уведомлений висит и что случилось
 * с последним. Если после нажатия «ОК» записи о кнопке нет — значит браузер не передал
 * нажатие расширению, и причину нужно искать в системных настройках уведомлений.
 */
let diagnosticsTimer:number|undefined;
/** Перечитывает сведения о напоминании через несколько секунд после показа: подсказка о непришедшем нажатии. */
function scheduleDiagnosticsRefresh(event:ReminderEvent|null){
  if(diagnosticsTimer!==undefined)clearTimeout(diagnosticsTimer);
  if(event?.kind!=="shown")return;
  const wait=Math.max(0,5000-(Date.now()-event.at))+300;
  diagnosticsTimer=window.setTimeout(()=>void renderNotificationDiagnostics(),wait);
}

async function renderNotificationDiagnostics(){
  const box=$("notificationDiag");
  if(!box)return;
  const level=await notificationPermission();
  const active=await activeReminderNotifications();
  const event=await getReminderEvent();
  const permission=level==="granted"?"разрешение браузера выдано":level==="denied"?"браузер запретил уведомления":"разрешение браузера не выдано";
  const shown=active===null?"":` Сейчас показано напоминаний: ${active}.`;
  // Если напоминание показано, а события о нажатии нет — значит браузер не передал его расширению.
  // В этом случае форма открывается нажатием на само уведомление, о чём и предупреждаем.
  const stuck=event?.kind==="shown"&&Date.now()-event.at>5000;
  const hint=stuck
    ?" Нажатие кнопки до расширения не дошло: нажмите на само уведомление — форма новой записи откроется. На macOS кнопки бывают видны только при стиле уведомлений «Оповещения»."
    :"";
  box.textContent=`${permission}.${shown} Последнее событие: ${describeEvent(event)}${hint}`;
  scheduleDiagnosticsRefresh(event);
}

function renderReminders(){
  const r=settings.reminders;
  input("remindersEnabled").checked=r.enabled;
  input("remindersFrom").value=r.from;
  input("remindersTo").value=r.to;
  input("remindersEvery").value=String(r.every);
  ($("remindersUnit") as HTMLSelectElement).value=r.unit;
  $("reminderStatus").textContent="";
  updateReminderSummary();
}

/** Настройки напоминаний, прочитанные из полей формы (с проверкой значений). */
function remindersFromForm():ReminderSettings{
  const enabled=input("remindersEnabled").checked;
  const from=input("remindersFrom").value.trim();
  const to=input("remindersTo").value.trim();
  const unit:ReminderSettings["unit"]=($("remindersUnit") as HTMLSelectElement).value==="minutes"?"minutes":"hours";
  const every=Number(input("remindersEvery").value);
  if(enabled&&(!from||!to))throw new Error("Укажите время «С» и «До» для диапазона напоминаний.");
  if(!Number.isFinite(every)||every<1)throw new Error("Частота напоминаний должна быть не меньше 1.");
  const limit=unit==="minutes"?1440:24;
  if(Math.floor(every)>limit)throw new Error(unit==="minutes"?"Для минут частота не может превышать 1440.":"Для часов частота не может превышать 24.");
  return {enabled,from:from||"09:00",to:to||"18:00",every:Math.floor(every),unit};
}

function updateReminderSummary(){
  try{
    $("reminderSummary").textContent=reminderSummary(remindersFromForm());
  }catch(e){
    $("reminderSummary").textContent=e instanceof Error?e.message:String(e);
  }
}

function collectSettings():AppSettings{
  syncDisplayValue();
  syncTypesFromDom();
  const diskPath=input("diskPath").value.trim();
  const fileUrl=input("fileUrl")?.value.trim()??"";
  const tasksToShow=Math.max(1,Number(input("tasks").value)||10);
  const daysToShow=Math.max(1,settings.daysToShow||2);
  const displayMode=input("modeDays").checked?"days":"tasks";
  const taskTypes=settings.taskTypes.map(t=>({code:t.code.trim(),description:t.description.trim()}));
  const reminders=remindersFromForm();
  if(!diskPath)throw new Error("Укажите полный путь к XLSX.");
  if(fileUrl&&!isHttpUrl(fileUrl))throw new Error("Ссылка на файл должна начинаться с http:// или https://.");
  if(!taskTypes.length)throw new Error("Добавьте хотя бы один тип задачи.");
  if(taskTypes.some(t=>!t.code))throw new Error("У каждого типа задачи должен быть указан код.");
  const codes=taskTypes.map(t=>t.code.toLocaleLowerCase());
  if(new Set(codes).size!==codes.length)throw new Error("Коды типов задач не должны повторяться.");
  return {displayMode,tasksToShow:displayMode==="tasks"?tasksToShow:settings.tasksToShow,daysToShow:displayMode==="days"?tasksToShow:daysToShow,diskPath,taskTypes,reminders,fileUrl};
}


function collectAutoTrackSettings():AutoTrackSettings{
  const enabled=input("autotrackEnabled").checked;
  const rootPath=input("autotrackRootPath").value.trim();
  const uploadEveryMinutes=Number(input("autotrackEveryMinutes").value);
  if(!rootPath)throw new Error("Укажите папку «Итоги дня» на Яндекс Диске.");
  if(!Number.isFinite(uploadEveryMinutes)||uploadEveryMinutes<5||uploadEveryMinutes>1440)throw new Error("Интервал автотрекинга должен быть от 5 до 1440 минут.");
  return {enabled,rootPath,uploadEveryMinutes:Math.floor(uploadEveryMinutes)};
}

async function uploadAutotrack(){
  const button=$("autotrackUploadNow") as HTMLButtonElement;
  button.disabled=true;
  $("autotrackStatus").textContent="Передаём накопленные сеансы...";
  try{
    autotrackSettings=collectAutoTrackSettings();
    await saveAutoTrackSettings(autotrackSettings);
    await syncAutoTrackAlarm();
    await uploadAutotrackNow();
    $("autotrackStatus").textContent="Передача завершена. В JSON включаются только сеансы дольше 3 минут.";
  }catch(e){
    $("autotrackStatus").textContent="Не удалось передать автотрекинг: "+(e instanceof Error?e.message:String(e));
  }finally{button.disabled=false;}
}

async function clearCache(){
  if(!confirm("Сбросить локальные данные расширения? Будут удалены сохранённые настройки, токен Яндекс Диска и очередь незагруженных задач. Данные в XLSX на Яндекс Диске не удаляются."))return;
  try{
    await clearLocalData();
    settings=await getSettings();
    autotrackSettings=await getAutoTrackSettings();
    await syncReminderAlarm();
    await syncAutoTrackAlarm();
    render();
    $("connectionStatus").textContent="Локальные данные сброшены. Подключите Яндекс Диск заново и сохраните настройки.";
    $("testResult").textContent="";
    $("status").textContent="Кэш и локальные данные сброшены.";
  }catch(e){
    $("status").textContent="Не удалось сбросить локальные данные: "+(e instanceof Error?e.message:String(e));
  }
}

async function save(){
  try{
    settings=collectSettings();
    autotrackSettings=collectAutoTrackSettings();
    await saveSettings(settings);
    await saveAutoTrackSettings(autotrackSettings);
    await syncReminderAlarm();
    await syncAutoTrackAlarm();
    updateReminderSummary();
    $("status").textContent="Настройки сохранены.";
    $("reminderStatus").textContent="Расписание напоминаний обновлено. "+reminderSummary(settings.reminders);
  }catch(e){
    $("status").textContent="Не удалось сохранить настройки: "+(e instanceof Error?e.message:String(e));
  }
}

async function testReminder(){
  const button=$("testReminder") as HTMLButtonElement;
  button.disabled=true;
  $("reminderStatus").textContent="Отправляем уведомление...";
  try{
    settings={...settings,reminders:remindersFromForm()};
    await saveSettings(settings);
    await syncReminderAlarm();
    const level=await notificationPermission();
    if(level==="denied"){
      $("reminderStatus").textContent="Браузер запретил уведомления: разрешите их в настройках Chrome и в настройках системы.";
      return;
    }
    await showReminder();
    $("reminderStatus").textContent="Уведомление отправлено. «ОК» откроет форму новой записи, «Отмена» просто закроет уведомление.";
    await renderNotificationDiagnostics();
  }catch(e){
    $("reminderStatus").textContent="Не удалось показать уведомление: "+(e instanceof Error?e.message:String(e));
  }finally{
    button.disabled=false;
  }
}

async function connect(){($("connect") as HTMLButtonElement).disabled=true;try{await connectToYandex();$("connectionStatus").textContent="Яндекс Диск подключён. Теперь можно выполнить проверку подключения.";}catch(e){$("connectionStatus").textContent="Не удалось подключиться: "+(e instanceof Error?e.message:String(e));}finally{($("connect") as HTMLButtonElement).disabled=false;}}
async function test(){($("testConnection") as HTMLButtonElement).disabled=true;$("testResult").textContent="Проверка...";try{const current=collectSettings();const r=await testConnection(current);$("testResult").textContent=r.attachmentFolderExists?"Подключение работает. Основной файл доступен. Папка вложений найдена.":"Подключение работает. Основной файл доступен. Папка вложений пока не создана.";}catch(e){$("testResult").textContent="Проверка не пройдена: "+(e instanceof Error?e.message:String(e));}finally{($("testConnection") as HTMLButtonElement).disabled=false;}}

void init();
