import type {TaskRecord} from "./model.js";
import {WEEKDAYS} from "./datetime.js";

/**
 * Аналитика повторяет контракт Android-версии (AnalyticsEngine.kt):
 * те же группировки и показатели, поэтому результаты на обеих платформах совпадают.
 * Дополнительно расширение умеет фильтровать по части дня, дню недели и тексту задачи.
 */
export type AnalyticsGroupBy="date"|"week"|"month"|"weekday"|"partOfDay"|"taskType"|"difficulty"|"task";
export type AnalyticsMetric="count"|"sumDifficulty"|"avgDifficulty"|"minDifficulty"|"maxDifficulty";
export type AnalyticsChart="bar"|"line"|"doughnut"|"pie"|"hbar";

export const GROUP_BY_TITLES:Record<AnalyticsGroupBy,string>={
  date:"День",week:"Неделя",month:"Месяц",weekday:"День недели",
  partOfDay:"Часть дня",taskType:"Вид задачи",difficulty:"Сложность",task:"Задача"
};
export const METRIC_TITLES:Record<AnalyticsMetric,string>={
  count:"Количество задач",sumDifficulty:"Сумма сложности",avgDifficulty:"Средняя сложность",
  minDifficulty:"Минимальная сложность",maxDifficulty:"Максимальная сложность"
};
export const CHART_TITLES:Record<AnalyticsChart,string>={
  bar:"Столбцы",line:"Линия",doughnut:"Кольцевая диаграмма",pie:"Круговая диаграмма",hbar:"Горизонтальные столбцы"
};
export const PART_OF_DAY_ORDER=[
  "До начала рабочего дня","Утро","Обед","Вечер","После конца рабочего дня"
];

export interface AnalyticsFilter {
  from?:string;
  to?:string;
  taskTypes?:string[];
  partOfDay?:string[];
  weekdays?:string[];
  minDifficulty?:number;
  maxDifficulty?:number;
  search?:string;
  onlyWithAttachment?:boolean;
}

export interface AnalyticsQuery extends AnalyticsFilter {
  groupBy:AnalyticsGroupBy;
  metric:AnalyticsMetric;
  /** Тип графика влияет только на отрисовку, но хранится в запросе — как AnalyticsChart в Android-версии. */
  chartType?:AnalyticsChart;
  limit?:number;
}

export interface AnalyticsBucket {
  label:string;
  value:number;
  count:number;
  tasks:TaskRecord[];
}

export interface AnalyticsSummary {
  totalTasks:number;
  totalDifficulty:number;
  averageDifficulty:number;
  maxDifficulty:number;
  activeDays:number;
  streak:number;
  bestDay?:{label:string;value:number;count:number};
  topTaskType?:{label:string;value:number;count:number};
  firstDate?:string;
  lastDate?:string;
}

export interface AnalyticsResult {
  filtered:TaskRecord[];
  summary:AnalyticsSummary;
  buckets:AnalyticsBucket[];
}

export interface HeatCell { iso:string; day:number; value:number; count:number }
export interface HeatWeek { label:string; days:(HeatCell|null)[] }

/* ------------------------------- работа с датами ------------------------------- */

export function parseIsoDate(value?:string):string|undefined{
  if(!value)return undefined;
  const iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if(ru)return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return undefined;
}

export function dateFromIso(iso:string):Date{
  const [year,month,day]=iso.split("-").map(Number);
  return new Date(year,month-1,day);
}

export function isoFromDate(date:Date):string{
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}

export function addDays(date:Date,days:number):Date{
  const copy=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  copy.setDate(copy.getDate()+days);
  return copy;
}

/** Номер недели по ISO (как WeekFields.ISO в Android-версии). */
export function isoWeek(date:Date):{year:number;week:number}{
  const utc=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const dayNumber=utc.getUTCDay()||7;
  utc.setUTCDate(utc.getUTCDate()+4-dayNumber);
  const yearStart=new Date(Date.UTC(utc.getUTCFullYear(),0,1));
  const week=Math.ceil(((utc.getTime()-yearStart.getTime())/86_400_000+1)/7);
  return {year:utc.getUTCFullYear(),week};
}

export function weekdayOfIso(iso:string):string{
  return WEEKDAYS[(dateFromIso(iso).getDay()+6)%7];
}

function isoWeekLabel(iso:string):string{
  const {year,week}=isoWeek(dateFromIso(iso));
  return `${year}-W${String(week).padStart(2,"0")}`;
}

/* ---------------------------------- выборка ---------------------------------- */

/** Записи без даты в аналитику не попадают — как и в Android-версии. */
export function filterTasks(records:TaskRecord[],filter:AnalyticsFilter):TaskRecord[]{
  const search=(filter.search??"").trim().toLocaleLowerCase();
  return records.filter(task=>{
    const iso=parseIsoDate(task.date);
    if(!iso)return false;
    if(filter.from&&iso<filter.from)return false;
    if(filter.to&&iso>filter.to)return false;
    if(filter.taskTypes?.length&&!filter.taskTypes.includes(task.taskType))return false;
    if(filter.partOfDay?.length&&!filter.partOfDay.includes(task.partOfDay||"Не указано"))return false;
    if(filter.weekdays?.length&&!filter.weekdays.includes(weekdayOfIso(iso)))return false;
    const difficulty=task.difficulty??0;
    if(filter.minDifficulty!==undefined&&difficulty<filter.minDifficulty)return false;
    if(filter.maxDifficulty!==undefined&&difficulty>filter.maxDifficulty)return false;
    if(filter.onlyWithAttachment&&!task.attachmentName)return false;
    if(search&&!task.task.toLocaleLowerCase().includes(search))return false;
    return true;
  });
}

export function metricValue(tasks:TaskRecord[],metric:AnalyticsMetric):number{
  const values=tasks.map(task=>task.difficulty??0);
  switch(metric){
    case "count":return tasks.length;
    case "sumDifficulty":return values.reduce((sum,value)=>sum+value,0);
    case "avgDifficulty":return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
    case "minDifficulty":return values.length?Math.min(...values):0;
    case "maxDifficulty":return values.length?Math.max(...values):0;
  }
}

export function groupKeyOf(task:TaskRecord,groupBy:AnalyticsGroupBy):string{
  const iso=parseIsoDate(task.date);
  switch(groupBy){
    case "date":return iso??"Без даты";
    case "week":return iso?isoWeekLabel(iso):"Без даты";
    case "month":return iso?iso.slice(0,7):"Без даты";
    case "weekday":return iso?weekdayOfIso(iso):"Без даты";
    case "partOfDay":return task.partOfDay||"Не указано";
    case "taskType":return task.taskType||"Не указан";
    case "difficulty":return String(task.difficulty??0);
    case "task":return task.task;
  }
}

function isTimeGroup(groupBy:AnalyticsGroupBy):boolean{
  return groupBy==="date"||groupBy==="week"||groupBy==="month";
}

/** Записи без даты не участвуют ни в одной сводке — контракт совпадает с Android-версией. */
function dated(records:TaskRecord[]):TaskRecord[]{
  return records.filter(task=>Boolean(parseIsoDate(task.date)));
}

export function summarize(records:TaskRecord[],metric:AnalyticsMetric="count"):AnalyticsSummary{
  const tasks=dated(records);
  const dates=[...new Set(tasks.map(task=>parseIsoDate(task.date)).filter((iso):iso is string=>Boolean(iso)))].sort();
  let streak=0;
  let run=0;
  let previous:Date|undefined;
  for(const iso of dates){
    const current=dateFromIso(iso);
    run=previous&&Math.round((current.getTime()-previous.getTime())/86_400_000)===1?run+1:1;
    streak=Math.max(streak,run);
    previous=current;
  }
  const byDay=new Map<string,TaskRecord[]>();
  tasks.forEach(task=>{
    const iso=parseIsoDate(task.date);
    if(!iso)return;
    const list=byDay.get(iso);
    if(list)list.push(task);else byDay.set(iso,[task]);
  });
  let bestDay:AnalyticsSummary["bestDay"];
  byDay.forEach((dayTasks,iso)=>{
    const value=metricValue(dayTasks,metric);
    if(!bestDay||value>bestDay.value)bestDay={label:iso,value,count:dayTasks.length};
  });
  const byType=new Map<string,TaskRecord[]>();
  tasks.forEach(task=>{
    const key=task.taskType||"Не указан";
    const list=byType.get(key);
    if(list)list.push(task);else byType.set(key,[task]);
  });
  let topTaskType:AnalyticsSummary["topTaskType"];
  byType.forEach((typeTasks,key)=>{
    const value=metricValue(typeTasks,metric);
    if(!topTaskType||value>topTaskType.value)topTaskType={label:key,value,count:typeTasks.length};
  });
  const totalDifficulty=tasks.reduce((sum,task)=>sum+(task.difficulty??0),0);
  return {
    totalTasks:tasks.length,
    totalDifficulty,
    averageDifficulty:tasks.length?totalDifficulty/tasks.length:0,
    maxDifficulty:tasks.reduce((max,task)=>Math.max(max,task.difficulty??0),0),
    activeDays:dates.length,
    streak,
    bestDay,
    topTaskType,
    firstDate:dates[0],
    lastDate:dates[dates.length-1]
  };
}

export function calculate(records:TaskRecord[],query:AnalyticsQuery):AnalyticsResult{
  const filtered=filterTasks(records,query);
  const summary=summarize(filtered,query.metric);
  const limit=Math.max(1,Math.min(100,query.limit??20));

  if(query.groupBy==="task"){
    const buckets=[...filtered]
      .sort((a,b)=>{
        const delta=(b.difficulty??0)-(a.difficulty??0);
        if(delta!==0)return delta;
        return `${b.date??""} ${b.time??""}`.localeCompare(`${a.date??""} ${a.time??""}`);
      })
      .slice(0,limit)
      .map(task=>({
        label:task.task,
        value:query.metric==="count"?1:(task.difficulty??0),
        count:1,
        tasks:[task]
      }));
    return {filtered,summary,buckets};
  }

  const grouped=new Map<string,TaskRecord[]>();
  filtered.forEach(task=>{
    const key=groupKeyOf(task,query.groupBy);
    const list=grouped.get(key);
    if(list)list.push(task);else grouped.set(key,[task]);
  });

  const buckets=[...grouped.entries()].map(([label,tasks])=>({
    label,value:metricValue(tasks,query.metric),count:tasks.length,tasks
  }));

  buckets.sort((a,b)=>{
    if(isTimeGroup(query.groupBy)){
      const left=a.tasks[0]?.date??"";
      const right=b.tasks[0]?.date??"";
      return left.localeCompare(right);
    }
    if(query.groupBy==="difficulty")return Number(a.label)-Number(b.label);
    if(query.groupBy==="weekday")return WEEKDAYS.indexOf(a.label)-WEEKDAYS.indexOf(b.label);
    if(query.groupBy==="partOfDay"){
      const order=(value:string)=>PART_OF_DAY_ORDER.indexOf(value)<0?PART_OF_DAY_ORDER.length:PART_OF_DAY_ORDER.indexOf(value);
      return order(a.label)-order(b.label);
    }
    const delta=b.value-a.value;
    return delta!==0?delta:a.label.localeCompare(b.label);
  });

  return {filtered,summary,buckets};
}

/* ------------------------------ готовые срезы ------------------------------ */

export function difficultyHistogram(records:TaskRecord[]):{labels:string[];counts:number[]}{
  const counts=[0,0,0,0,0,0];
  dated(records).forEach(task=>{
    const difficulty=Math.max(0,Math.min(5,task.difficulty??0));
    counts[difficulty]+=1;
  });
  return {labels:counts.map((_,index)=>String(index)),counts};
}

export function weekdayProfile(records:TaskRecord[],metric:AnalyticsMetric="count"):{labels:string[];values:number[]}{
  const buckets=new Map<string,TaskRecord[]>(WEEKDAYS.map(day=>[day,[]]));
  dated(records).forEach(task=>{
    const iso=parseIsoDate(task.date);
    if(!iso)return;
    buckets.get(weekdayOfIso(iso))?.push(task);
  });
  return {
    labels:[...WEEKDAYS],
    values:WEEKDAYS.map(day=>metricValue(buckets.get(day)??[],metric))
  };
}

export function partOfDayProfile(records:TaskRecord[],metric:AnalyticsMetric="count"):{labels:string[];values:number[]}{
  const buckets=new Map<string,TaskRecord[]>(PART_OF_DAY_ORDER.map(part=>[part,[]]));
  dated(records).forEach(task=>{
    const key=task.partOfDay||"Не указано";
    const list=buckets.get(key);
    if(list)list.push(task);else buckets.set(key,[task]);
  });
  return {
    labels:[...buckets.keys()],
    values:[...buckets.values()].map(tasks=>metricValue(tasks,metric))
  };
}

export function typeDistribution(records:TaskRecord[],metric:AnalyticsMetric="count",limit=10):{
  labels:string[];values:number[];counts:number[];
}{
  const grouped=new Map<string,TaskRecord[]>();
  dated(records).forEach(task=>{
    const key=task.taskType||"Не указан";
    const list=grouped.get(key);
    if(list)list.push(task);else grouped.set(key,[task]);
  });
  const sorted=[...grouped.entries()]
    .map(([label,tasks])=>({label,value:metricValue(tasks,metric),count:tasks.length}))
    .sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
  const head=sorted.slice(0,limit);
  const tail=sorted.slice(limit);
  if(tail.length){
    head.push({
      label:"Прочее ("+tail.length+")",
      value:tail.reduce((sum,item)=>sum+item.value,0),
      count:tail.reduce((sum,item)=>sum+item.count,0)
    });
  }
  return {labels:head.map(item=>item.label),values:head.map(item=>item.value),counts:head.map(item=>item.count)};
}

/** Календарная сетка по неделям (недели начинаются с понедельника) для тепловой карты. */
export function calendarWeeks(records:TaskRecord[],from:string,to:string,metric:AnalyticsMetric="count"):{
  weeks:HeatWeek[];max:number;months:{label:string;index:number}[];
}{
  const monthNames=["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
  const byDay=new Map<string,TaskRecord[]>();
  dated(records).forEach(task=>{
    const iso=parseIsoDate(task.date);
    if(!iso)return;
    const list=byDay.get(iso);
    if(list)list.push(task);else byDay.set(iso,[task]);
  });

  const start=dateFromIso(from);
  const end=dateFromIso(to);
  const startOffset=(start.getDay()+6)%7;
  const cursor=addDays(start,-startOffset);
  const weeks:HeatWeek[]=[];
  const months:{label:string;index:number}[]=[];
  let max=0;
  let lastMonth=-1;

  while(cursor<=end||weeks.length===0||((cursor.getDay()+6)%7)!==0){
    const days:(HeatCell|null)[]=[];
    for(let index=0;index<7;index++){
      const day=addDays(cursor,index);
      const iso=isoFromDate(day);
      if(day<start||day>end||iso<from||iso>to){
        days.push(null);
        continue;
      }
      const tasks=byDay.get(iso)??[];
      const value=metricValue(tasks,metric);
      if(value>max)max=value;
      days.push({iso,day:day.getDate(),value,count:tasks.length});
    }
    const firstVisible=days.find(cell=>cell);
    if(firstVisible){
      const month=dateFromIso(firstVisible.iso).getMonth();
      if(month!==lastMonth){
        lastMonth=month;
        months.push({label:monthNames[month],index:weeks.length});
      }
    }
    weeks.push({label:isoFromDate(cursor),days});
    cursor.setDate(cursor.getDate()+7);
    if(weeks.length>400)break;
  }
  return {weeks,max,months};
}

/* ---------------------------------- экспорт ---------------------------------- */

function csvCell(value:string):string{
  const text=String(value??"");
  return /[";\r\n]/.test(text)?"\""+text.replace(/"/g,"\"\"")+"\"":text;
}

/** CSV с разделителем «;» и BOM — открывается в Excel без настроек импорта. */
export function toCsv(records:TaskRecord[]):string{
  const header=["ID","Дата","Время","День недели","Часть дня","Вид задачи","Задача","Сложность","Файл вложения"];
  const rows=records.map(task=>[
    task.id??"",
    task.date??"",
    task.time??"",
    task.weekday??"",
    task.partOfDay??"",
    task.taskType??"",
    task.task??"",
    String(task.difficulty??0),
    task.attachmentName??""
  ]);
  return "\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
}
