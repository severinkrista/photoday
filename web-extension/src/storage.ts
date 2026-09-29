import type {AppSettings,PendingTask} from "./model.js"; import {DEFAULT_SETTINGS} from "./model.js";
const storage=(globalThis as any).browser?.storage?.local ?? (globalThis as any).chrome?.storage?.local;
async function get<T>(key:string,fallback:T):Promise<T>{if(storage){const r=await storage.get(key);return (r[key] as T|undefined)??fallback;}const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}
async function set<T>(key:string,value:T){if(storage){await storage.set({[key]:value});return;}localStorage.setItem(key,JSON.stringify(value));}
export async function getSettings(){const s=await get<AppSettings>("settings",DEFAULT_SETTINGS);return {...DEFAULT_SETTINGS,...s,taskTypes:s.taskTypes?.length?s.taskTypes:DEFAULT_SETTINGS.taskTypes};}
export async function saveSettings(s:AppSettings){await set("settings",s);}
export async function getToken(){return get<string|null>("token",null);}
export async function saveToken(t:string){await set("token",t);}
export async function getPendingTasks(){return get<PendingTask[]>("pending",[]);}
export async function savePendingTasks(p:PendingTask[]){await set("pending",p);}