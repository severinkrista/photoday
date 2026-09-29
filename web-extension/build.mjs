import {cpSync,mkdirSync,rmSync} from "node:fs";
rmSync("dist",{recursive:true,force:true}); mkdirSync("dist",{recursive:true});
for(const file of ["manifest.json","popup.html","settings.html","style.css"]) cpSync(file,"dist/"+file);
cpSync("dist/src","dist",{recursive:true});
