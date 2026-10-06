import {cpSync,mkdirSync,rmSync} from "node:fs";
import {build} from "esbuild";

rmSync("dist",{recursive:true,force:true});
mkdirSync("dist",{recursive:true});

for(const entry of ["popup","settings","viewer","background"]){
  await build({entryPoints:["src/"+entry+".ts"],bundle:true,format:"iife",platform:"browser",target:"es2022",outfile:"dist/"+entry+".js"});
}

for(const file of ["manifest.json","popup.html","settings.html","viewer.html","style.css"]) cpSync(file,"dist/"+file);
cpSync("icons","dist/icons",{recursive:true});
