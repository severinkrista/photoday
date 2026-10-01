import {getAttachment} from "./repository.js";
const params=new URLSearchParams(location.search);
const folder=params.get("folder");
const name=params.get("name");
const image=document.getElementById("image") as HTMLImageElement;
const error=document.getElementById("error") as HTMLDivElement;
(async()=>{try{if(!folder||!name)throw new Error("Не указано вложение.");const data=await getAttachment({weekday:"",partOfDay:"",taskType:"",task:"",attachmentFolder:folder,attachmentName:name});const url=URL.createObjectURL(new Blob([data]));image.src=url;image.hidden=false;window.addEventListener("beforeunload",()=>URL.revokeObjectURL(url));}catch(e){error.textContent=e instanceof Error?e.message:String(e);error.hidden=false;}})();
