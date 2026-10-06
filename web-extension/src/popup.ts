import type {AppSettings,PendingTask,PopupSize,TaskRecord} from "./model.js";
import {DEFAULT_POPUP_SIZE,DEFAULT_SETTINGS} from "./model.js";
import {POPUP_SIZE_KEY,consumeAddEntry,getPendingTasks,getPopupSize,getSettings,getToken,normalizePopupSize,savePendingTasks,savePopupSize} from "./storage.js";
import {addTask,getAttachment,getTasks} from "./repository.js";
import {attachmentFolder} from "./yandex.js";
import {formatDateTime,localDate,localTime,momentLabel,parseLocalDateTime,partOfDay,weekdayOf} from "./datetime.js";

let settings:AppSettings=DEFAULT_SETTINGS,records:TaskRecord[]=[],pending:PendingTask[]=[],adding=false;
/** Текущий размер окна: меняется уголком, применяется к body и запоминается. */
let popupSize:PopupSize={...DEFAULT_POPUP_SIZE};
/** Момент записи, выбранный вручную; null — берётся текущее время в момент сохранения. */
let scheduledAt:Date|null=null;
const retrying=new Set<number|string>();
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$(id) as HTMLInputElement;

function runtimeApi(){return (globalThis as any).browser?.runtime ?? (globalThis as any).chrome?.runtime;}
/** Корень API (browser/chrome): нужен для tabs, action и других пространств имён. */
function extensionApi(){return (globalThis as any).browser ?? (globalThis as any).chrome;}
function openSettings(){runtimeApi()?.openOptionsPage?.();}
/** Аналитика — отдельная страница расширения: в popup для графиков слишком мало места. */
function openAnalytics(){
  const api=extensionApi();
  const url=api?.runtime?.getURL?.("analytics.html")??"analytics.html";
  if(api?.tabs?.create){void api.tabs.create({url});return;}
  window.open(url,"_blank");
}

function bind(){
  if(!$("refresh")||!$("add")||!$("openSettings")||!$("openAnalytics"))throw new Error("Интерфейс popup не загружен полностью.");
  $("refresh").onclick=()=>void refresh();
  $("openSettings").onclick=()=>openSettings();
  $("openAnalytics").onclick=()=>openAnalytics();
  $("add").onclick=()=>void addCurrentTask();
  $("attachment").addEventListener("change",()=>{$("attachmentName").textContent=input("attachment").files?.[0]?.name??"";});
  for(let i=1;i<=5;i++)$<HTMLButtonElement>("difficulty-"+i).onclick=()=>setDifficulty(i);
  $("scheduleToggle").onclick=()=>toggleSchedule();
  $("scheduleNow").onclick=()=>{scheduledAt=null;syncScheduleInputs();renderSchedule();};
  $("scheduleToday").onclick=()=>{syncScheduleInputs();input("scheduleDate").value=localDate(new Date());scheduleFromInputs();};
  $("scheduleYesterday").onclick=()=>{syncScheduleInputs();const d=new Date();d.setDate(d.getDate()-1);input("scheduleDate").value=localDate(d);scheduleFromInputs();};
  $("scheduleDone").onclick=()=>toggleSchedule(false);
  input("scheduleDate").addEventListener("change",scheduleFromInputs);
  input("scheduleTime").addEventListener("change",scheduleFromInputs);
}

/** Размер ограничиваем границами popup, чтобы уголок нельзя было утащить за пределы экрана. */
function clampPopupSize(width:number,height:number):PopupSize{
  const clean=normalizePopupSize({width,height});
  return clean??{...DEFAULT_POPUP_SIZE};
}
/** Размер из localStorage читается синхронно — окно открывается сразу нужного размера, без мигания. */
function cachedPopupSize():PopupSize|null{
  try{return normalizePopupSize(JSON.parse(localStorage.getItem(POPUP_SIZE_KEY)??"null"));}catch(e){return null;}
}
/** В режиме «окно новой записи» (expanded) страница занимает всё окно, размер из настроек не применяется. */
function applyPopupSize(size:PopupSize|null){
  if(!size||document.body.classList.contains("expanded"))return;
  popupSize=size;
  document.body.style.width=size.width+"px";
  document.body.style.height=size.height+"px";
}
/** Кэш размера в localStorage: следующее открытие получает нужный размер без ожидания хранилища. */
function cachePopupSize(size:PopupSize){
  try{localStorage.setItem(POPUP_SIZE_KEY,JSON.stringify(size));}catch(e){/* приватный режим — размер просто не запомнится мгновенно */}
}
async function persistPopupSize(size:PopupSize){
  popupSize=size;
  applyPopupSize(size);
  cachePopupSize(size);
  try{await savePopupSize(size);}catch(e){/* хранилище недоступно — останется текущий размер окна */}
}
/** Уголок в правом нижнем углу: тянем — окно меняет размер, отпускаем — размер запоминается. */
function initResize(){
  const handle=$<HTMLButtonElement>("resizeHandle");
  if(!handle)return;
  let origin:{x:number;y:number;width:number;height:number}|null=null;
  const sizeFromPointer=(e:PointerEvent)=>clampPopupSize(
    (origin?.width??popupSize.width)+(e.screenX-(origin?.x??0)),
    (origin?.height??popupSize.height)+(e.screenY-(origin?.y??0))
  );
  handle.addEventListener("pointerdown",e=>{
    e.preventDefault();
    origin={x:e.screenX,y:e.screenY,width:popupSize.width,height:popupSize.height};
    try{handle.setPointerCapture?.(e.pointerId);}catch(err){/* без захвата указателя тоже работает */}
  });
  handle.addEventListener("pointermove",e=>{if(origin)applyPopupSize(sizeFromPointer(e));});
  handle.addEventListener("pointerup",e=>{
    if(!origin)return;
    const size=sizeFromPointer(e);
    origin=null;
    void persistPopupSize(size).then(()=>showNotice(`Размер окна сохранён: ${size.width}×${size.height}.`));
  });
  handle.addEventListener("pointercancel",()=>{origin=null;});
  handle.addEventListener("dblclick",()=>{
    origin=null;
    void persistPopupSize({...DEFAULT_POPUP_SIZE}).then(()=>showNotice(`Размер окна сброшен: ${DEFAULT_POPUP_SIZE.width}×${DEFAULT_POPUP_SIZE.height}.`));
  });
}

/** Открытие по кнопке «ОК» в напоминании: окно больше и сразу встаёт в поле описания задачи. */
async function applyEntryMode(){
  const params=new URLSearchParams(location.search);
  // Флаг читаем всегда, чтобы он не «залипал» на следующее обычное открытие.
  const flagged=await consumeAddEntry();
  const fromNotification=params.get("new")==="1"||flagged;
  if(!fromNotification)return;
  // В режиме окна новой записи страница занимает всё окно: снимаем размер, выставленный для popup.
  document.body.style.width="";
  document.body.style.height="";
  document.body.classList.add("expanded");
  document.querySelector(".add-card")?.scrollIntoView?.({block:"start"});
  input("task").focus();
}

async function init(){try{settings=await getSettings();pending=await getPendingTasks();renderSettings();setDifficulty(0);renderSchedule();await refresh();}catch(e){showError(e);}}

function setDifficulty(value:number){for(let i=1;i<=5;i++){const b=$<HTMLButtonElement>("difficulty-"+i);b.classList.toggle("selected",i<=value);b.setAttribute("aria-pressed",String(i<=value));}}
function selectedDifficulty(){for(let i=5;i>=1;i--)if($<HTMLButtonElement>("difficulty-"+i).classList.contains("selected"))return i;return 0;}

function toggleSchedule(open?:boolean){
  const editor=$("scheduleEditor");
  const show=open??editor.hidden;
  editor.hidden=!show;
  $("scheduleToggle").setAttribute("aria-expanded",String(show));
  if(show)syncScheduleInputs();
}
function syncScheduleInputs(){
  const moment=scheduledAt??new Date();
  input("scheduleDate").value=localDate(moment);
  input("scheduleTime").value=localTime(moment).slice(0,5);
}
function scheduleFromInputs(){
  const parsed=parseLocalDateTime(input("scheduleDate").value,input("scheduleTime").value);
  if(!parsed){syncScheduleInputs();return;}
  scheduledAt=parsed;
  renderSchedule();
}
function renderSchedule(){
  $("scheduleValue").textContent=scheduledAt?formatDateTime(scheduledAt):"сейчас";
  $("scheduleToggle").classList.toggle("custom",scheduledAt!==null);
}
function scheduledMoment(){return scheduledAt?new Date(scheduledAt):new Date();}

async function refresh(){
  clearError();
  $("refresh").setAttribute("disabled","");
  try{
    if(!(await getToken())){$("connection").textContent="Яндекс Диск не подключён — подключение выполняется в Настройках";renderRecords();return;}
    $("connection").textContent="Яндекс Диск подключён";
    records=filter(await getTasks(settings));
    pending=await getPendingTasks();
    renderRecords();
  }catch(e){showError(e);}
  finally{$("refresh").removeAttribute("disabled");}
}
function filter(all:TaskRecord[]){
  const s=[...all].sort((a,b)=>((a.date??"")+" "+(a.time??"")).localeCompare((b.date??"")+" "+(b.time??"")));
  if(settings.displayMode==="tasks")return s.slice(-settings.tasksToShow);
  const from=new Date();
  from.setHours(0,0,0,0);
  from.setDate(from.getDate()-settings.daysToShow+1);
  return s.filter(x=>x.date&&localDateObject(x.date)>=from);
}

async function addCurrentTask(){
  const text=($("task") as HTMLTextAreaElement).value.trim();
  if(!text||adding)return;
  adding=true;
  ($("add") as HTMLButtonElement).disabled=true;
  try{
    const moment=scheduledMoment(),date=localDate(moment),file=input("attachment").files?.[0];
    const suffix=file?"_"+crypto.randomUUID().replace(/-/g,"").slice(0,5):"";
    const target=file?file.name.replace(/(\.[^.]+)?$/,suffix+"$1"):undefined;
    const task:TaskRecord={id:crypto.randomUUID(),date,time:localTime(moment),weekday:weekdayOf(moment),partOfDay:partOfDay(moment.getHours()),taskType:($("type") as HTMLSelectElement).value,task:text,difficulty:selectedDifficulty(),attachmentFolder:file?attachmentFolder(settings,date):undefined,attachmentName:target};
    const item:PendingTask={task,attachment:file?{name:file.name,type:file.type,data:await file.arrayBuffer()}:undefined,createdAt:`${Date.now()}-${crypto.randomUUID()}`};
    pending.push(item);
    try{await savePendingTasks(pending);}catch(e){pending=pending.filter(x=>x.createdAt!==item.createdAt);showError(new Error("Не удалось сохранить задачу в очередь: "+(e instanceof Error?e.message:String(e))));renderPending();return;}
    clearForm();
    renderRecords();
    await retry(item);
  }finally{adding=false;($("add") as HTMLButtonElement).disabled=false;}
}

async function retry(item:PendingTask){
  if(retrying.has(item.createdAt))return;
  retrying.add(item.createdAt);
  try{
    if(item.attachment&&item.attachment.data.byteLength===0)throw new Error("Вложение в очереди отсутствует. Добавьте задачу заново.");
    await addTask(settings,item.task,item.attachment);
    pending=pending.filter(x=>x.createdAt!==item.createdAt);
    await savePendingTasks(pending);
    showNotice("Запись сохранена: "+momentLabel(item.task)+".");
    await refresh();
  }catch(e){showError(e);renderPending();}
  finally{retrying.delete(item.createdAt);}
}
async function cancel(at:number|string){pending=pending.filter(x=>x.createdAt!==at);await savePendingTasks(pending);renderPending();}

function clearForm(){($("task") as HTMLTextAreaElement).value="";setDifficulty(0);input("attachment").value="";$("attachmentName").textContent="";}

function renderSettings(){
  $("period").textContent=settings.displayMode==="tasks"?"Последние "+settings.tasksToShow+" задач":"Последние "+settings.daysToShow+" дн.";
  const s=$("type") as HTMLSelectElement;
  s.innerHTML="";
  settings.taskTypes.forEach(t=>{const o=document.createElement("option");o.value=t.code;o.textContent=t.code;s.append(o);});
}

function renderRecords(){
  const root=$("records");
  root.innerHTML="";
  records.forEach(r=>{
    const card=document.createElement("div");
    card.className="task-card";
    const meta=document.createElement("div");
    meta.className="task-meta";
    meta.textContent=momentLabel(r)+" • "+r.taskType+" • "+("★".repeat(r.difficulty??0)||"0");
    const text=document.createElement("div");
    text.className="task-text";
    text.textContent=r.task;
    card.append(meta,text);
    if(r.attachmentName){const b=document.createElement("button");b.className="link-button";b.textContent="📎 "+r.attachmentName;b.onclick=()=>void openAttachment(r);card.append(b);}
    root.append(card);
  });
  renderPending();
}

function renderPending(){
  const root=$("pending");
  root.innerHTML="";
  pending.forEach(p=>{
    const card=document.createElement("div");
    card.className="pending-card";
    const title=document.createElement("strong");
    title.textContent="Не отправлена в таблицу";
    const text=document.createElement("div");
    text.textContent=momentLabel(p.task)+" • "+p.task.taskType+" • "+p.task.task;
    const actions=document.createElement("div");
    actions.className="actions";
    const c=document.createElement("button");
    c.textContent="Отменить";
    c.onclick=()=>void cancel(p.createdAt);
    const retryButton=document.createElement("button");
    retryButton.textContent=retrying.has(p.createdAt)?"Отправка...":"Повторить отправку";
    retryButton.disabled=retrying.has(p.createdAt);
    retryButton.onclick=()=>void retry(p);
    actions.append(c,retryButton);
    card.append(title,text,actions);
    root.append(card);
  });
}

async function openAttachment(t:TaskRecord){
  const url="viewer.html?folder="+encodeURIComponent(t.attachmentFolder??"")+"&name="+encodeURIComponent(t.attachmentName??"");
  window.open(url,"_blank");
}

function showError(e:unknown){$("error").textContent=e instanceof Error?e.message:String(e);$("error").hidden=false;$("notice").hidden=true;}
function clearError(){$("error").hidden=true;}
function showNotice(text:string){$("notice").textContent=text;$("notice").hidden=false;$("error").hidden=true;}

function localDateObject(s:string){const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):new Date(s);}

bind();
initResize();
// Сначала показываем запомненный размер, затем уточняем его из chrome.storage и загружаем записи.
applyPopupSize(cachedPopupSize());
void applyEntryMode().then(async ()=>{
  const stored=await getPopupSize();
  if(stored)cachePopupSize(stored);
  applyPopupSize(stored??cachedPopupSize());
  await init();
});
