import { build } from "esbuild";
import { cp, readFile, writeFile } from "node:fs/promises";

const common = { entryPoints:["src/index.ts"], bundle:true, minify:true, target:"es2022", legalComments:"none",
  banner:{ js:"/*! xgoose lite | MIT | Copyright (c) 2026 xGoose contributors */" } };
await Promise.all([
  build({...common, format:"iife", globalName:"XGooseLite", outfile:"dist/xgoose-lite.js"}),
  build({...common, format:"esm", outfile:"dist/xgoose-lite.mjs"}),
  cp("hosted","dist/lite/connect",{recursive:true}),
]);
const runtime = await readFile("dist/xgoose-lite.js","utf8");
const preview = await readFile("studio/preview.html","utf8");
const { outputFiles } = await build({
  entryPoints:["studio/main.js"], bundle:true, minify:true, write:false, target:"es2022",
  define:{ EMBED_SOURCE:JSON.stringify(runtime), PREVIEW_HTML:JSON.stringify(preview) },
});
const styles = await readFile("studio/style.css","utf8");
const logo = await readFile("studio/goose.svg","utf8");
let html = await readFile("studio/index.html","utf8");
html = html.replace("<!-- css -->", () => "<style>" + styles + "</style>");
function inlineScript(js) { return "<script>" + js.replace(/<\/script/gi,"<\\/script") + "</script>"; }
html = html.replace("<!-- goose -->", () => logo).replace("<!-- studio -->", () => inlineScript(outputFiles[0].text));
await writeFile("dist/index.html",html);

const { compile } = await import("../studio/compile.js");
await writeFile("dist/xgoose-lite.site.js", compile(runtime, {}));
