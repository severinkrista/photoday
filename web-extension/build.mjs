import {cpSync,mkdirSync} from "node:fs";
mkdirSync("dist",{recursive:true});
for(const file of ["manifest.json","popup.html","settings.html","style.css"]) cpSync(file,"dist/"+file);
