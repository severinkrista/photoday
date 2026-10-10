import type {AutoTrackRecord} from "./autotrack.js";

export interface AutoTrackSettings {
  enabled: boolean;
  uploadEveryMinutes: number;
  rootPath: string;
}
export interface StoredAutoTrackState {
  days: Record<string, AutoTrackRecord[]>;
  active: {tabId:number;windowId:number;url:string;title:string;openedAtMs:number}|null;
  lastUploadedAt?: number;
  lastError?: string;
}
const SETTINGS_KEY="autotrackSettings";
const STATE_KEY="autotrackJson";
const DEFAULT_SETTINGS:AutoTrackSettings={enabled:true,uploadEveryMinutes:60,rootPath:"disk:/Итоги дня"};
function storage():any {
  const g=globalThis as any;
  return (g.browser??g.chrome)?.storage?.local??null;
}
async function get<T>(key:string,fallback:T):Promise<T>{
  const s=storage();
  if(s?.get){const value=await Promise.resolve(s.get(key));return (value?.[key] as T|undefined)??fallback;}
  try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}
}
async function set<T>(key:string,value:T):Promise<void>{
  const s=storage();
  if(s?.set){await Promise.resolve(s.set({[key]:value}));return;}
  localStorage.setItem(key,JSON.stringify(value));
}
export async function getAutoTrackSettings():Promise<AutoTrackSettings>{
  const value=await get<Partial<AutoTrackSettings>>(SETTINGS_KEY,{});
  const interval=Number(value.uploadEveryMinutes);
  return {
    enabled:typeof value.enabled==="boolean"?value.enabled:DEFAULT_SETTINGS.enabled,
    uploadEveryMinutes:Number.isFinite(interval)&&interval>=5?Math.min(1440,Math.floor(interval)):DEFAULT_SETTINGS.uploadEveryMinutes,
    rootPath:typeof value.rootPath==="string"&&value.rootPath.trim()?value.rootPath.trim():DEFAULT_SETTINGS.rootPath
  };
}
export async function saveAutoTrackSettings(value:AutoTrackSettings){
  const interval=Number(value.uploadEveryMinutes);
  if(!Number.isFinite(interval)||interval<5||interval>1440)throw new Error("Интервал автотрекинга должен быть от 5 до 1440 минут.");
  if(!value.rootPath.trim())throw new Error("Укажите папку «Итоги дня» на Яндекс Диске.");
  await set(SETTINGS_KEY,{enabled:!!value.enabled,uploadEveryMinutes:Math.floor(interval),rootPath:value.rootPath.trim()});
}
export async function getAutoTrackState():Promise<StoredAutoTrackState>{
  return get<StoredAutoTrackState>(STATE_KEY,{days:{},active:null});
}
export async function saveAutoTrackState(value:StoredAutoTrackState){
  await set(STATE_KEY,value);
}
