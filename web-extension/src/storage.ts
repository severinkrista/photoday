import type {AppSettings,PendingTask,ReminderSettings} from "./model.js"; import {DEFAULT_SETTINGS,DEFAULT_REMINDERS} from "./model.js";
const storage=(globalThis as any).browser?.storage?.local ?? (globalThis as any).chrome?.storage?.local;
type StoredPendingTask=Omit<PendingTask,"attachment"> & {attachment?:{name:string;type:string;data:string}};
function toBase64(data:ArrayBuffer){let binary="";const bytes=new Uint8Array(data);const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}
function fromBase64(value:string){const binary=atob(value);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out.buffer;}
async function get<T>(key:string,fallback:T):Promise<T>{if(storage){const r=await storage.get(key);return (r[key] as T|undefined)??fallback;}const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}
async function set<T>(key:string,value:T){if(storage){await storage.set({[key]:value});return;}localStorage.setItem(key,JSON.stringify(value));}
export async function getSettings(){
 const s=await get<Partial<AppSettings>>("settings",{});
 const mode:AppSettings["displayMode"]=s.displayMode==="days"?"days":"tasks";
 const tasks=Number(s.tasksToShow); const days=Number(s.daysToShow);
 return {
  displayMode:mode,
  tasksToShow:Number.isFinite(tasks)&&tasks>0?Math.floor(tasks):DEFAULT_SETTINGS.tasksToShow,
  daysToShow:Number.isFinite(days)&&days>0?Math.floor(days):DEFAULT_SETTINGS.daysToShow,
  diskPath:typeof s.diskPath==="string"&&s.diskPath.trim()?s.diskPath:DEFAULT_SETTINGS.diskPath,
  taskTypes:Array.isArray(s.taskTypes)&&s.taskTypes.length?s.taskTypes:DEFAULT_SETTINGS.taskTypes.map(x=>({...x})),
  reminders:normalizeReminders(s.reminders)
 };
}
/** Настройки напоминаний приводятся к корректному виду: битые значения заменяются значениями по умолчанию. */
export function normalizeReminders(value?:Partial<ReminderSettings>|null):ReminderSettings{
 const clock=(v:unknown,fallback:string)=>typeof v==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())?v.trim():fallback;
 const unit:ReminderSettings["unit"]=value?.unit==="minutes"?"minutes":"hours";
 const rawEvery=Number(value?.every);
 const limit=unit==="minutes"?1440:24;
 const every=Number.isFinite(rawEvery)&&rawEvery>=1?Math.min(Math.floor(rawEvery),limit):DEFAULT_REMINDERS.every;
 return {
  enabled:typeof value?.enabled==="boolean"?value.enabled:DEFAULT_REMINDERS.enabled,
  from:clock(value?.from,DEFAULT_REMINDERS.from),
  to:clock(value?.to,DEFAULT_REMINDERS.to),
  every,
  unit
 };
}
const ADD_ENTRY_KEY="photodayAddEntry";
/** Флаг «попап открыт из напоминания» живёт недолго: если окно так и не открылось, режим не должен «залипать». */
const ADD_ENTRY_TTL=2*60_000;
function sessionArea():any{
 const scope=globalThis as any;
 return (scope.browser ?? scope.chrome)?.storage?.session ?? null;
}
/** Помечает, что popup открывается из уведомления — тогда форма новой записи сразу в фокусе. */
export async function markAddEntry():Promise<void>{
 const session=sessionArea();
 if(session?.set){try{await session.set({[ADD_ENTRY_KEY]:Date.now()});return;}catch(e){/* нет session storage — используем local */}}
 await set(ADD_ENTRY_KEY,Date.now());
}
export async function consumeAddEntry():Promise<boolean>{
 const session=sessionArea();
 if(session?.get){
  try{
   const stored=await session.get(ADD_ENTRY_KEY);
   const value=Number(stored?.[ADD_ENTRY_KEY]);
   if(value){await session.remove(ADD_ENTRY_KEY);return Date.now()-value<=ADD_ENTRY_TTL;}
  }catch(e){/* игнорируем и проверяем local */}
 }
 try{
  const fallback=Number(await get<number>(ADD_ENTRY_KEY,0));
  if(fallback){await set(ADD_ENTRY_KEY,0);return Date.now()-fallback<=ADD_ENTRY_TTL;}
 }catch(e){/* флаг недоступен — считаем, что открытие обычное */}
 return false;
}
export async function getReminderState(){return get<{lastNotifiedAt?:number}>("reminderState",{});}
export async function saveReminderState(state:{lastNotifiedAt?:number}){await set("reminderState",state);}
export async function clearLocalData(){if(storage){await storage.clear();return;}localStorage.clear();}
export async function saveSettings(s:AppSettings){await set("settings",s);}
export async function getToken(){return get<string|null>("token",null);}
export async function saveToken(t:string){await set("token",t);}
export async function getPendingTasks():Promise<PendingTask[]>{const stored=await get<StoredPendingTask[]>("pending",[]);return stored.map(p=>{if(!p.attachment)return {task:p.task,createdAt:p.createdAt};const data=typeof p.attachment.data==="string"?fromBase64(p.attachment.data):new ArrayBuffer(0);return {task:p.task,createdAt:p.createdAt,attachment:{name:p.attachment.name,type:p.attachment.type,data}};});}
export async function savePendingTasks(p:PendingTask[]){const stored:StoredPendingTask[]=p.map(x=>{if(!x.attachment)return {task:x.task,createdAt:x.createdAt};return {task:x.task,createdAt:x.createdAt,attachment:{name:x.attachment.name,type:x.attachment.type,data:toBase64(x.attachment.data)}};});await set("pending",stored);}
