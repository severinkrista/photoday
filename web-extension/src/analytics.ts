import {
  ArcElement,BarController,BarElement,CategoryScale,Chart,DoughnutController,Filler,
  Legend,LineController,LineElement,LinearScale,PieController,PointElement,Title,Tooltip
} from "chart.js";
import type {AppSettings,TaskRecord} from "./model.js";
import {DEFAULT_SETTINGS,workbookUrl} from "./model.js";
import {getPendingTasks,getSettings,getToken} from "./storage.js";
import {getTasks} from "./repository.js";
import {WEEKDAYS,displayDate} from "./datetime.js";
import {
  CHART_TITLES,GROUP_BY_TITLES,METRIC_TITLES,PART_OF_DAY_ORDER,
  addDays,calculate,calendarWeeks,dateFromIso,difficultyHistogram,isoFromDate,
  partOfDayProfile,parseIsoDate,summarize,toCsv,typeDistribution,weekdayProfile
} from "./analytics-engine.js";
import type {
  AnalyticsChart,AnalyticsFilter,AnalyticsGroupBy,AnalyticsMetric,AnalyticsQuery,AnalyticsSummary
} from "./analytics-engine.js";

// Регистрируем только нужные части Chart.js — бандл остаётся компактным,
// и библиотека не тянет за собой ничего, кроме @kurkle/color.
Chart.register(ArcElement,BarController,BarElement,CategoryScale,DoughnutController,Filler,Legend,LineController,LineElement,LinearScale,PieController,PointElement,Title,Tooltip);

const PALETTE=["#315efb","#00a37a","#f2a33c","#e0526b","#8e5bf6","#2aa9c9","#b0a400","#6b7280","#d97757","#4f9d69"];
const HEAT_LEVELS=4;

let settings:AppSettings=DEFAULT_SETTINGS;
let xlsxRecords:TaskRecord[]=[];
let pendingRecords:TaskRecord[]=[];
const charts=new Map<string,Chart>();

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$(id) as HTMLInputElement;
const select=(id:string)=>$(id) as HTMLSelectElement;

function runtimeApi(){return (globalThis as any).browser ?? (globalThis as any).chrome;}

/* ---------------------------------- элементы ---------------------------------- */

function fillSelect(id:string,entries:{value:string;text:string}[],fallback?:string){
  const element=select(id);
  const previous=element.value;
  element.innerHTML="";
  entries.forEach(entry=>{
    const option=document.createElement("option");
    option.value=entry.value;
    option.textContent=entry.text;
    element.append(option);
  });
  const wanted=[previous,fallback].find(value=>value&&entries.some(entry=>entry.value===value));
  if(wanted)element.value=wanted;
}

function selectedChips(id:string):string[]{
  return [...$(id).querySelectorAll("button.chip.active")].map(button=>button.textContent??"");
}

function setChips(id:string,labels:string[]){
  const container=$(id);
  const chosen=selectedChips(id);
  container.innerHTML="";
  if(!labels.length){
    container.textContent="Нет данных";
    return;
  }
  labels.forEach(label=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="chip"+(chosen.includes(label)?" active":"");
    button.textContent=label;
    button.onclick=()=>{
      button.classList.toggle("active");
      renderAll();
    };
    container.append(button);
  });
}

function highlightChip(id:string,value:string){
  [...$(id).querySelectorAll("button.chip")].forEach(button=>button.classList.toggle("active",button.textContent===value));
}

/* ----------------------------------- данные ----------------------------------- */

async function load(){
  clearError();
  setNote("");
  setStatus("Загружаем таблицу с Яндекс Диска...");
  try{
    if(!(await getToken())){
      setStatus("");
      showError("Яндекс Диск не подключён. Откройте «Настройки» и подключите аккаунт — затем вернитесь в аналитику.");
      return;
    }
    xlsxRecords=await getTasks(settings);
    pendingRecords=(await getPendingTasks()).map(item=>item.task);
    buildOptions();
    setStatus(`Файл: ${settings.diskPath} • записей в таблице: ${xlsxRecords.length}`);
    renderAll();
  }catch(e){
    setStatus("");
    showError(e);
  }
}

function buildOptions(){
  const types=[...new Set(xlsxRecords.map(record=>record.taskType||"Не указан"))].sort((a,b)=>a.localeCompare(b));
  const order=(value:string)=>PART_OF_DAY_ORDER.indexOf(value)<0?PART_OF_DAY_ORDER.length:PART_OF_DAY_ORDER.indexOf(value);
  const parts=[...new Set(xlsxRecords.map(record=>record.partOfDay||"Не указано"))].sort((a,b)=>order(a)-order(b));
  setChips("typeChips",types);
  setChips("partChips",parts);
  setChips("weekdayChips",[...WEEKDAYS]);

  const difficulties=[{value:"",text:"Любая"},...Array.from({length:6},(_,index)=>({value:String(index),text:String(index)}))];
  fillSelect("minDifficulty",difficulties,"");
  fillSelect("maxDifficulty",difficulties,"");

  fillSelect("groupBy",(Object.keys(GROUP_BY_TITLES) as AnalyticsGroupBy[]).map(key=>({value:key,text:GROUP_BY_TITLES[key]})),"date");
  fillSelect("metric",(Object.keys(METRIC_TITLES) as AnalyticsMetric[]).map(key=>({value:key,text:METRIC_TITLES[key]})),"count");
  fillSelect("chartType",(Object.keys(CHART_TITLES) as AnalyticsChart[]).map(key=>({value:key,text:CHART_TITLES[key]})),"bar");

  if(!input("from").value||!input("to").value){
    const dates=allDates();
    if(dates.length){
      input("from").value=input("from").value||dates[0];
      input("to").value=input("to").value||dates[dates.length-1];
    }
  }
}

function allDates():string[]{
  return xlsxRecords
    .map(record=>parseIsoDate(record.date))
    .filter((value):value is string=>Boolean(value))
    .sort();
}

/* ---------------------------------- выборка ---------------------------------- */

function currentFilter():AnalyticsFilter{
  const min=select("minDifficulty").value;
  const max=select("maxDifficulty").value;
  return {
    from:input("from").value||undefined,
    to:input("to").value||undefined,
    taskTypes:selectedChips("typeChips"),
    partOfDay:selectedChips("partChips"),
    weekdays:selectedChips("weekdayChips"),
    minDifficulty:min===""?undefined:Number(min),
    maxDifficulty:max===""?undefined:Number(max),
    search:input("search").value,
    onlyWithAttachment:input("onlyWithAttachment").checked
  };
}

function currentQuery():AnalyticsQuery{
  return {
    ...currentFilter(),
    groupBy:select("groupBy").value as AnalyticsGroupBy,
    metric:select("metric").value as AnalyticsMetric,
    chartType:select("chartType").value as AnalyticsChart,
    limit:Math.max(1,Math.min(100,Number(input("limit").value)||20))
  };
}

function activeRecords():TaskRecord[]{
  return input("includePending").checked?[...xlsxRecords,...pendingRecords]:xlsxRecords;
}

/* ----------------------------------- KPI ----------------------------------- */

function kpiCard(title:string,value:string,hint?:string):HTMLElement{
  const card=document.createElement("div");
  card.className="kpi-card";
  const label=document.createElement("div");
  label.className="kpi-title";
  label.textContent=title;
  const number=document.createElement("div");
  number.className="kpi-value";
  number.textContent=value;
  card.append(label,number);
  if(hint){
    const note=document.createElement("div");
    note.className="kpi-hint";
    note.textContent=hint;
    card.append(note);
  }
  return card;
}

function formatNumber(value:number):string{
  return Number.isInteger(value)?String(value):value.toFixed(2);
}

function renderKpi(summary:AnalyticsSummary,totalRecords:number){
  const row=$("kpiRow");
  row.innerHTML="";
  row.append(
    kpiCard("Задач",formatNumber(summary.totalTasks),"в выборке"),
    kpiCard("Сумма сложности",formatNumber(summary.totalDifficulty),"баллов"),
    kpiCard("Средняя сложность",summary.averageDifficulty.toFixed(2),"за задачу"),
    kpiCard("Активных дней",String(summary.activeDays),"с записями"),
    kpiCard("Серия подряд",summary.streak?summary.streak+" дн.":"—","дней без пропусков"),
    kpiCard("Лучший день",summary.bestDay?formatNumber(summary.bestDay.value):"—",summary.bestDay?displayDate(summary.bestDay.label):undefined),
    kpiCard("Топ вид задачи",summary.topTaskType?summary.topTaskType.label:"—",summary.topTaskType?`${formatNumber(summary.topTaskType.value)} • задач: ${summary.topTaskType.count}`:undefined),
    kpiCard(
      "Период данных",
      summary.firstDate&&summary.lastDate?`${displayDate(summary.firstDate)} – ${displayDate(summary.lastDate)}`:"—",
      `записей: ${summary.totalTasks} из ${totalRecords}`
    )
  );
}

/* -------------------------------- графики -------------------------------- */

function condense(labels:string[],values:number[],counts:number[],max:number){
  if(labels.length<=max)return {labels,values,counts};
  return {
    labels:[...labels.slice(0,max-1),`Прочее (${labels.length-max+1})`],
    values:[...values.slice(0,max-1),values.slice(max-1).reduce((sum,value)=>sum+value,0)],
    counts:[...counts.slice(0,max-1),counts.slice(max-1).reduce((sum,count)=>sum+count,0)]
  };
}

function draw(id:string,config:any){
  const canvas=document.getElementById(id) as HTMLCanvasElement|null;
  if(!canvas)return;
  charts.get(id)?.destroy();
  charts.set(id,new Chart(canvas,config));
}

function tooltipOptions(title:string,afterLabel?:(context:any)=>string){
  return {
    padding:10,
    callbacks:{
      label:(context:any)=>{
        const raw=context.parsed?.y??context.parsed?.x??context.parsed??0;
        return `${title}: ${formatNumber(Number(raw))}`;
      },
      ...(afterLabel?{afterLabel}:{})
    }
  };
}

function renderMain(
  buckets:{label:string;value:number;count:number}[],
  query:AnalyticsQuery,
  grouped:{labels:string[];values:number[];counts:number[]}
){
  const canvas=document.getElementById("mainChart") as HTMLCanvasElement|null;
  const empty=$("mainEmpty");
  if(!canvas)return;
  if(!buckets.length){
    charts.get("mainChart")?.destroy();
    charts.delete("mainChart");
    canvas.hidden=true;
    empty.hidden=false;
    return;
  }
  canvas.hidden=false;
  empty.hidden=true;

  const metricTitle=METRIC_TITLES[query.metric];
  const isRound=query.chartType==="doughnut"||query.chartType==="pie";
  const labels=grouped.labels.map(label=>query.groupBy==="date"?displayDate(label):label);
  const colors=grouped.labels.map((_,index)=>PALETTE[index%PALETTE.length]);
  const total=grouped.values.reduce((sum,value)=>sum+value,0);

  if(isRound){
    draw("mainChart",{
      type:query.chartType,
      data:{
        labels,
        datasets:[{label:metricTitle,data:grouped.values,backgroundColor:colors,borderColor:"#fff",borderWidth:1}]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:{duration:250},
        plugins:{
          legend:{display:true,position:"right",labels:{boxWidth:12,usePointStyle:true}},
          tooltip:{
            padding:10,
            callbacks:{
              label:(context:any)=>{
                const share=total?Math.round((Number(context.parsed)/total)*100):0;
                return `${context.label}: ${formatNumber(Number(context.parsed))} (${share}%)`;
              }
            }
          }
        },
        onClick:(_event:any,elements:any[])=>{
          const index=elements[0]?.index;
          if(index===undefined||query.groupBy!=="taskType")return;
          highlightChip("typeChips",grouped.labels[index]);
          renderAll();
        }
      }
    });
    return;
  }

  const horizontal=query.chartType==="hbar";
  draw("mainChart",{
    type:query.chartType==="line"?"line":"bar",
    data:{
      labels,
      datasets:[{
        label:metricTitle,
        data:grouped.values,
        backgroundColor:query.chartType==="line"?"rgba(49,94,251,.18)":colors,
        borderColor:PALETTE[0],
        borderWidth:query.chartType==="line"?2:0,
        borderRadius:query.chartType==="line"?0:6,
        fill:query.chartType==="line",
        tension:0.25,
        pointRadius:query.chartType==="line"?2:0,
        pointBackgroundColor:PALETTE[0]
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:250},
      indexAxis:horizontal?"y":"x",
      scales:{
        x:{grid:{display:!horizontal},ticks:{autoSkip:true,maxRotation:horizontal?0:60}},
        y:{beginAtZero:true,grid:{display:horizontal},ticks:{precision:0}}
      },
      plugins:{
        legend:{display:false},
        tooltip:tooltipOptions(metricTitle,(context:any)=>`Записей: ${grouped.counts[context.dataIndex]}`)
      }
    }
  });
}

function renderTypeChart(records:TaskRecord[],metric:AnalyticsMetric){
  const distribution=typeDistribution(records,metric,8);
  if(!distribution.labels.length){
    charts.get("typeChart")?.destroy();
    charts.delete("typeChart");
    return;
  }
  const total=distribution.values.reduce((sum,value)=>sum+value,0);
  draw("typeChart",{
    type:"doughnut",
    data:{
      labels:distribution.labels,
      datasets:[{
        label:METRIC_TITLES[metric],
        data:distribution.values,
        backgroundColor:distribution.labels.map((_,index)=>PALETTE[index%PALETTE.length]),
        borderColor:"#fff",
        borderWidth:1
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:250},
      cutout:"55%",
      plugins:{
        legend:{display:true,position:"right",labels:{boxWidth:12,usePointStyle:true}},
        tooltip:{
          padding:10,
          callbacks:{
            label:(context:any)=>{
              const share=total?Math.round((Number(context.parsed)/total)*100):0;
              return `${context.label}: ${formatNumber(Number(context.parsed))} (${share}%), задач: ${distribution.counts[context.dataIndex]}`;
            }
          }
        }
      },
      onClick:(_event:any,elements:any[])=>{
        const index=elements[0]?.index;
        if(index===undefined)return;
        highlightChip("typeChips",distribution.labels[index]);
        renderAll();
      }
    }
  });
}

function renderDifficultyChart(records:TaskRecord[]){
  const histogram=difficultyHistogram(records);
  draw("difficultyChart",{
    type:"bar",
    data:{labels:histogram.labels,datasets:[{label:"Задач",data:histogram.counts,backgroundColor:PALETTE[1],borderRadius:6}]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:250},
      scales:{
        x:{title:{display:true,text:"Сложность, баллов",color:"#69707d"}},
        y:{beginAtZero:true,ticks:{precision:0}}
      },
      plugins:{
        legend:{display:false},
        tooltip:{padding:10,callbacks:{label:(context:any)=>`Задач: ${context.parsed.y}`}}
      }
    }
  });
}

function renderWeekdayChart(records:TaskRecord[],metric:AnalyticsMetric){
  const profile=weekdayProfile(records,metric);
  draw("weekdayChart",{
    type:"bar",
    data:{labels:profile.labels,datasets:[{label:METRIC_TITLES[metric],data:profile.values,backgroundColor:PALETTE[2],borderRadius:6}]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:250},
      scales:{y:{beginAtZero:true}},
      plugins:{legend:{display:false},tooltip:tooltipOptions(METRIC_TITLES[metric])}
    }
  });
}

function renderPartChart(records:TaskRecord[],metric:AnalyticsMetric){
  const profile=partOfDayProfile(records,metric);
  draw("partChart",{
    type:"bar",
    data:{labels:profile.labels,datasets:[{label:METRIC_TITLES[metric],data:profile.values,backgroundColor:PALETTE[4],borderRadius:6}]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:250},
      indexAxis:"y",
      scales:{x:{beginAtZero:true,ticks:{precision:0}}},
      plugins:{legend:{display:false},tooltip:tooltipOptions(METRIC_TITLES[metric])}
    }
  });
}

/* ------------------------------- тепловая карта ------------------------------- */

function heatLevel(value:number,max:number):number{
  if(value<=0)return 0;
  if(max<=0)return 1;
  return Math.max(1,Math.min(HEAT_LEVELS,Math.ceil((value/max)*HEAT_LEVELS)));
}

function renderHeatmap(records:TaskRecord[],from:string,to:string,metric:AnalyticsMetric){
  const container=$("heatmap");
  const scale=$("heatmapScale");
  container.innerHTML="";
  scale.innerHTML="";

  const {weeks,max,months}=calendarWeeks(records,from,to,metric);
  const monthRow=document.createElement("div");
  monthRow.className="heatmap-months";
  // Число колонок задаётся переменной, а размер клетки и отступ берутся из общих переменных .heatmap:
  // строка подписей и сетка клеток считаются по одной и той же формуле.
  monthRow.style.setProperty("--heat-weeks",String(Math.max(1,weeks.length)));
  months.forEach((month,index)=>{
    const cell=document.createElement("span");
    cell.textContent=month.label;
    const span=Math.max(1,(months[index+1]?.index??weeks.length)-month.index);
    cell.style.gridColumn=`${month.index+1} / span ${span}`;
    monthRow.append(cell);
  });
  const labelColumn=document.createElement("div");
  labelColumn.className="heatmap-day-labels";
  ["Пн","","Ср","","Пт","","Вс"].forEach(label=>{
    const cell=document.createElement("span");
    cell.textContent=label;
    labelColumn.append(cell);
  });
  const grid=document.createElement("div");
  grid.className="heatmap-grid";
  weeks.forEach(week=>{
    week.days.forEach(cell=>{
      const square=document.createElement("button");
      square.type="button";
      square.className="heat-cell"+(cell?"":" outside");
      if(cell){
        const level=heatLevel(cell.value,max);
        if(level>0)square.classList.add("heat-"+level);
        square.dataset.date=cell.iso;
        square.dataset.count=String(cell.count);
        square.setAttribute("aria-label",`${displayDate(cell.iso)}: задач ${cell.count}`);
        square.title=`${displayDate(cell.iso)}: задач ${cell.count}, значение ${formatNumber(cell.value)}. Нажмите, чтобы оставить только этот день.`;
        square.onclick=()=>{
          input("from").value=cell.iso;
          input("to").value=cell.iso;
          renderAll();
        };
      }
      grid.append(square);
    });
  });
  const body=document.createElement("div");
  body.className="heatmap-body";
  body.append(labelColumn,grid);
  container.append(monthRow,body);

  for(let level=0;level<=HEAT_LEVELS;level++){
    const square=document.createElement("span");
    square.className="heat-cell heat-"+level;
    scale.append(square);
  }
}

/* --------------------------------- таблица --------------------------------- */

function renderTable(buckets:{label:string;value:number;count:number;tasks:TaskRecord[]}[],query:AnalyticsQuery,totalRecords:number){
  const wrap=$("tableWrap");
  wrap.innerHTML="";
  const table=document.createElement("table");
  table.className="analytics-table";
  const head=document.createElement("thead");
  const headRow=document.createElement("tr");
  [GROUP_BY_TITLES[query.groupBy],METRIC_TITLES[query.metric],"Задач","Доля задач"].forEach(title=>{
    const cell=document.createElement("th");
    cell.textContent=title;
    headRow.append(cell);
  });
  head.append(headRow);

  const body=document.createElement("tbody");
  const total=totalRecords||1;
  buckets.slice(0,60).forEach(bucket=>{
    const row=document.createElement("tr");
    const label=document.createElement("td");
    label.textContent=query.groupBy==="date"?displayDate(bucket.label):bucket.label;
    if(bucket.tasks[0]?.task)label.title=bucket.tasks[0].task;
    const value=document.createElement("td");
    value.textContent=formatNumber(bucket.value);
    const count=document.createElement("td");
    count.textContent=String(bucket.count);
    const share=document.createElement("td");
    share.textContent=Math.round((bucket.count/total)*100)+"%";
    row.append(label,value,count,share);
    body.append(row);
  });
  table.append(head,body);
  wrap.append(table);
  if(!buckets.length){
    const empty=document.createElement("div");
    empty.className="empty";
    empty.textContent="За выбранный период записей нет.";
    wrap.append(empty);
  }else if(buckets.length>60){
    const note=document.createElement("div");
    note.className="muted";
    note.textContent=`Показаны первые 60 строк из ${buckets.length}. Полный список выгружается кнопкой «Скачать CSV».`;
    wrap.append(note);
  }
}

/* --------------------------------- рендер целиком --------------------------------- */

function renderAll(){
  const query=currentQuery();
  const records=activeRecords();
  const result=calculate(records,query);
  const filtered=result.filtered;
  const summary=summarize(filtered,query.metric);

  renderKpi(summary,records.length);
  const isRound=select("chartType").value==="doughnut"||select("chartType").value==="pie";
  const limit=isRound?12:select("chartType").value==="line"?90:60;
  const grouped=condense(result.buckets.map(bucket=>bucket.label),result.buckets.map(bucket=>bucket.value),result.buckets.map(bucket=>bucket.count),limit);
  renderMain(result.buckets,query,grouped);
  renderTypeChart(filtered,query.metric);
  renderDifficultyChart(filtered);
  renderWeekdayChart(filtered,query.metric);
  renderPartChart(filtered,query.metric);
  if(query.from&&query.to)renderHeatmap(filtered,query.from,query.to,select("heatmapMetric").value as AnalyticsMetric);
  renderTable(result.buckets,query,filtered.length);

  $("limitLabel").hidden=query.groupBy!=="task";
  $("filterSummary").textContent=`Отобрано записей: ${filtered.length} из ${records.length}. `+
    (summary.firstDate?`Период: ${displayDate(summary.firstDate)} – ${displayDate(summary.lastDate??summary.firstDate)}.`:"");

  const unusedPending=!input("includePending").checked?pendingRecords.length:0;
  setNote(unusedPending?`Не отправлено в таблицу: ${unusedPending}. Включите «Учитывать неотправленные записи», чтобы они попали в аналитику.`:"");
}

/* --------------------------------- экспорт CSV --------------------------------- */

function downloadCsv(){
  const records=calculate(activeRecords(),currentQuery()).filtered;
  const blob=new Blob([toCsv(records)],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=`photoday-analytics-${isoFromDate(new Date())}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------------------------------- сообщения ---------------------------------- */

function setStatus(text:string){$("status").textContent=text;}
function setNote(text:string){
  const note=$("note");
  note.textContent=text;
  note.hidden=!text;
}
function showError(e:unknown){
  const error=$("error");
  error.textContent=e instanceof Error?e.message:String(e);
  error.hidden=false;
}
function clearError(){$("error").hidden=true;}

/* ------------------------------------ старт ------------------------------------ */

function resetFilters(){
  input("from").value="";
  input("to").value="";
  input("search").value="";
  input("onlyWithAttachment").checked=false;
  input("includePending").checked=false;
  select("minDifficulty").value="";
  select("maxDifficulty").value="";
  ["typeChips","partChips","weekdayChips"].forEach(id=>{
    [...$(id).querySelectorAll("button.chip")].forEach(button=>button.classList.remove("active"));
  });
  buildOptions();
  renderAll();
}

async function init(){
  settings=await getSettings();
  $("openSettings").onclick=()=>runtimeApi()?.runtime?.openOptionsPage?.();
  $("openFile").onclick=()=>{
    const api=runtimeApi(),url=workbookUrl(settings);
    if(api?.tabs?.create){void api.tabs.create({url});return;}
    window.open(url,"_blank");
  };
  $("refresh").onclick=()=>void load();
  $("exportCsv").onclick=()=>downloadCsv();
  $("resetFilters").onclick=()=>resetFilters();
  [...document.querySelectorAll(".quick-range button")].forEach(button=>{
    button.addEventListener("click",()=>{
      const days=Number((button as HTMLElement).dataset.days??0);
      const dates=allDates();
      const last=dates[dates.length-1]??isoFromDate(new Date());
      input("to").value=last;
      input("from").value=days?isoFromDate(addDays(dateFromIso(last),-(days-1))):(dates[0]??last);
      renderAll();
    });
  });
  ["from","to","minDifficulty","maxDifficulty","groupBy","metric","chartType","limit","includePending","onlyWithAttachment","heatmapMetric"]
    .forEach(id=>$(id).addEventListener("change",()=>renderAll()));
  ["search","limit"].forEach(id=>$(id).addEventListener("input",()=>renderAll()));
  await load();
}

void init();
