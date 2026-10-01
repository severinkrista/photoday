import {cpSync,mkdirSync,rmSync} from "node:fs";
import {build} from "esbuild";

rmSync("dist",{recursive:true,force:true});
mkdirSync("dist",{recursive:true});

await build({entryPoints:["src/popup.ts"],bundle:true,format:"iife",platform:"browser",target:"es2022",outfile:"dist/popup.js"});
await build({entryPoints:["src/settings.ts"],bundle:true,format:"iife",platform:"browser",target:"es2022",outfile:"dist/settings.js"});
await build({entryPoints:["src/viewer.ts"],bundle:true,format:"iife",platform:"browser",target:"es2022",outfile:"dist/viewer.js"});

for(const file of ["manifest.json","popup.html","settings.html","viewer.html","style.css"]) cpSync(file,"dist/"+file);
