import {getAutoTrackSettings, getAutoTrackState, saveAutoTrackState, saveAutoTrackSettings} from "./autotrack-storage.js";
import {uploadAutotrackJson, ensureFolder} from "./yandex.js";

export interface AutoTrackRecord {
  url: string;
  title: string;
  openedAt: string;
  durationSeconds: number;
}
interface ActiveSession {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  openedAtMs: number;
}
interface AutoTrackState {
  days: Record<string, AutoTrackRecord[]>;
  active: ActiveSession | null;
  lastUploadedAt?: number;
  lastError?: string;
}
const ALARM = "photoday-autotrack-upload";
const MIN_DURATION_SECONDS = 180;
const IDLE_THRESHOLD_SECONDS = 60;
let initialized = false;
let state: AutoTrackState = {days:{},active:null};
let browserFocused = true;
let idleState: "active"|"idle"|"locked" = "active";
let queue = Promise.resolve();

function api(): any { const g=globalThis as any; return g.browser ?? g.chrome ?? null; }
function localDay(ms:number):string {
  const d=new Date(ms);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function safeUrl(raw:string):string {
  try {
    const u=new URL(raw);
    if(u.protocol!=="http:"&&u.protocol!=="https:")return raw;
    for(const key of [...u.searchParams.keys()]) if(/token|secret|password|passwd|auth|session|code|key/i.test(key))u.searchParams.delete(key);
    u.hash="";
    return u.toString();
  } catch { return raw; }
}
function enqueue(work:()=>Promise<void>) {
  queue=queue.then(work).catch(error=>{ console.warn("[photoday-autotrack]",error); });
  return queue;
}
async function persist(){ await saveAutoTrackState(state); }
async function recordCurrent(now=Date.now()) {
  const current=state.active;
  if(!current)return;
  const seconds=Math.max(0,Math.floor((now-current.openedAtMs)/1000));
  const record:AutoTrackRecord={url:current.url,title:current.title,openedAt:new Date(current.openedAtMs).toISOString(),durationSeconds:seconds};
  const day=localDay(current.openedAtMs);
  const records=state.days[day]??(state.days[day]=[]);
  const existing=records.findIndex(x=>x.openedAt===record.openedAt&&x.url===record.url);
  if(existing>=0)records[existing]=record;else records.push(record);
}
async function closeSession(now=Date.now()) {
  if(!state.active)return;
  await recordCurrent(now);
  state.active=null;
  await persist();
}
async function beginSession(tab:any) {
  if(!tab||typeof tab.id!=="number"||!browserFocused||idleState!=="active"||!tab.url||!/^https?:/i.test(tab.url))return;
  state.active={tabId:tab.id,windowId:Number(tab.windowId)||-1,url:safeUrl(String(tab.url)),title:String(tab.title??""),openedAtMs:Date.now()};
  await persist();
}
async function currentTab():Promise<any|null> {
  const a=api(); if(!a?.tabs?.query)return null;
  try {
    const tabs=await Promise.resolve(a.tabs.query({active:true,lastFocusedWindow:true}));
    return Array.isArray(tabs)?tabs[0]??null:null;
  } catch { return null; }
}
async function syncActiveTab() {
  await closeSession();
  if(!browserFocused||idleState!=="active")return;
  const tab=await currentTab();
  await beginSession(tab);
}
async function onActivated(info:any) {
  await closeSession();
  if(!browserFocused||idleState!=="active")return;
  const a=api();
  try {
    const tab=await Promise.resolve(a?.tabs?.get?.(Number(info.tabId)));
    await beginSession(tab);
  } catch { state.active=null; await persist(); }
}
async function onUpdated(tabId:number,change:any,tab:any) {
  const active=state.active;
  if(!active||active.tabId!==tabId)return;
  if(typeof change.url==="string"&&safeUrl(change.url)!==active.url) {
    await closeSession();
    await beginSession({...tab,url:change.url});
    return;
  }
  if(typeof change.title==="string") { active.title=change.title; await persist(); }
  if(typeof tab?.url==="string"&&safeUrl(tab.url)!==active.url) {
    await closeSession();
    await beginSession(tab);
  }
}
async function onRemoved(tabId:number) { if(state.active?.tabId===tabId)await closeSession(); }
async function onWindowFocusChanged(windowId:number) {
  browserFocused=windowId!==-1;
  if(!browserFocused) { await closeSession(); return; }
  await syncActiveTab();
}
async function onIdleStateChanged(value:string) {
  idleState=value==="active"?"active":value==="locked"?"locked":"idle";
  if(idleState!=="active") { await closeSession(); return; }
  await syncActiveTab();
}
function uploadPath(root:string,day:string) {
  const clean=root.trim().replace(/\/+$/,"");
  return clean+"/"+day+"/autotrack/autotrack.json";
}
async function uploadDay(day:string) {
  const records=(state.days[day]??[]).filter(x=>x.durationSeconds>MIN_DURATION_SECONDS);
  if(!records.length)return;
  const settings=await getAutoTrackSettings();
  if(!settings.enabled)return;
  const folder=uploadPath(settings.rootPath,day);
  const slash=folder.lastIndexOf("/");
  const autoFolder=folder.slice(0,slash);
  const dateFolder=autoFolder.slice(0,autoFolder.lastIndexOf("/"));
  await ensureFolder(settings.rootPath.trim().replace(/\/+$/,""));
  await ensureFolder(dateFolder);
  await ensureFolder(autoFolder);
  const payload={date:day,generatedAt:new Date().toISOString(),minimumSessionSeconds:MIN_DURATION_SECONDS,records:records.sort((a,b)=>a.openedAt.localeCompare(b.openedAt))};
  await uploadAutotrackJson(folder,JSON.stringify(payload,null,2));
}
export async function uploadAutotrackNow() {
  await recordCurrent();
  await persist();
  const settings=await getAutoTrackSettings();
  if(!settings.enabled)return;
  const days=Object.keys(state.days).sort();
  for(const day of days) {
    try { await uploadDay(day); }
    catch(e) { state.lastError=e instanceof Error?e.message:String(e); await persist(); throw e; }
  }
  state.lastUploadedAt=Date.now();
  state.lastError="";
  await persist();
}
export async function syncAutoTrackAlarm() {
  const a=api(); if(!a?.alarms)return;
  const settings=await getAutoTrackSettings();
  try { await Promise.resolve(a.alarms.clear(ALARM)); } catch {}
  if(settings.enabled)a.alarms.create(ALARM,{delayInMinutes:settings.uploadEveryMinutes,periodInMinutes:settings.uploadEveryMinutes});
}
export async function handleAutoTrackAlarm(name:string) {
  if(name!==ALARM)return;
  await enqueue(()=>uploadAutotrackNow());
}
export async function initAutoTrack() {
  if(initialized)return;
  initialized=true;
  const a=api(); if(!a)return;
  const saved=await getAutoTrackState();
  state={days:saved.days??{},active:saved.active??null,lastUploadedAt:saved.lastUploadedAt,lastError:saved.lastError};
  try {
    if(a.idle?.setDetectionInterval)a.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
    if(a.idle?.queryState)idleState=await Promise.resolve(a.idle.queryState(IDLE_THRESHOLD_SECONDS));
  } catch {}
  try {
    const focused=await Promise.resolve(a.windows?.getLastFocused?.());
    browserFocused=!!focused&&focused.id!==-1;
  } catch { browserFocused=true; }
  a.tabs?.onActivated?.addListener((info:any)=>void enqueue(()=>onActivated(info)));
  a.tabs?.onUpdated?.addListener((id:number,change:any,tab:any)=>void enqueue(()=>onUpdated(id,change,tab)));
  a.tabs?.onRemoved?.addListener((id:number)=>void enqueue(()=>onRemoved(id)));
  a.windows?.onFocusChanged?.addListener((id:number)=>void enqueue(()=>onWindowFocusChanged(id)));
  a.idle?.onStateChanged?.addListener((value:string)=>void enqueue(()=>onIdleStateChanged(value)));
  a.alarms?.onAlarm?.addListener((alarm:any)=>void handleAutoTrackAlarm(String(alarm?.name??"")));
  a.runtime?.onInstalled?.addListener(()=>{void syncAutoTrackAlarm();});
  a.runtime?.onStartup?.addListener(()=>{void syncAutoTrackAlarm();});
  await syncAutoTrackAlarm();
  // Reuse a persisted session only if the same active tab is still focused.
  const tab=await currentTab();
  if(state.active&&tab&&state.active.tabId===tab.id&&safeUrl(String(tab.url??""))===state.active.url&&browserFocused&&idleState==="active") {
    state.active.title=String(tab.title??state.active.title);
    await persist();
  } else {
    await closeSession();
    await beginSession(tab);
  }
}
export async function getAutoTrackDiagnostics() {
  return {lastUploadedAt:state.lastUploadedAt??null,lastError:state.lastError??"",storedDays:Object.keys(state.days).length,active:!!state.active};
}
