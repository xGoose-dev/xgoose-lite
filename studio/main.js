import { defaults } from "../src/defaults";
import { compile } from "./compile";

const form = document.querySelector("#settings");
const fields = form.elements;
const preview = document.querySelector("#preview");
const toolLabels = {
  read_page:"读取页面", find_on_page:"查找文字", list_actions:"列出可操作元素",
  scroll_to:"滚动定位", click:"点击元素", type_text:"填写文本",
};
for (const [value, title] of Object.entries(toolLabels)) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  Object.assign(input, {type:"checkbox", name:"pageTools", value, checked:defaults.pageTools.includes(value)});
  label.append(input, title);
  document.querySelector("#tools").append(label);
}
for (const key of ["name", "accent", "theme", "provider"]) fields[key].value = defaults[key];

function settings() {
  const data = new FormData(form);
  const config = { name:fields.name.value.trim(), provider:fields.provider.value, theme:fields.theme.value,
    accent:fields.accent.value, pageTools:data.getAll("pageTools") };
  for (const key of ["locale","greeting"]) if (fields[key].value.trim()) config[key] = fields[key].value.trim();
  const suggestions = fields.suggestions.value.split("\n").map(line => line.trim()).filter(Boolean);
  if (suggestions.length) config.suggestions = suggestions;
  if (config.provider !== "local") {
    for (const key of ["model","instructions"]) if (fields[key].value.trim()) config[key] = fields[key].value.trim();
    if (config.provider === "site") {
      config.tokenUrl = fields.tokenUrl.value.trim();
      config.endpoint = fields.endpoint.value.trim();
    }
  }
  return config;
}

const tips = {
  local:"直接在浏览器内搜索本页、查看大纲。其余工具可供 AI 模式调用。",
  site:"访客登录本站后，由同源接口签发短期 token。聊天接口接受 Bearer token。",
  hosted:"访客在 xgoose 官方窗口查看提问并授权，模型调用使用访客自己的 Hosted 额度。",
};
let previewReady = false;
function update() {
  const config = settings();
  document.querySelector("#aiFields").hidden = config.provider === "local";
  document.querySelector("#siteFields").hidden = config.provider !== "site";
  document.querySelector("#providerHelp").textContent = tips[config.provider];
  fields.name.setCustomValidity(config.name ? "" : "请输入助手名称。");
  if (previewReady) {
    const {name, theme, accent, pageTools, locale, greeting, suggestions} = config;
    preview.contentWindow.postMessage({type:"preview", options:{name, theme, accent, pageTools, locale, greeting, suggestions}}, "*");
  }
}
window.addEventListener("message", e => {
  if (e.source === preview.contentWindow && e.data === "preview-ready") { previewReady = true; update(); }
});
preview.setAttribute("sandbox", "allow-scripts");
const previewScript = EMBED_SOURCE + `
let panel;
window.addEventListener("message", e => {
  if (e.source !== parent || e.data?.type !== "preview") return;
  if (!panel) panel = XGooseLite.init(e.data.options); else panel.update(e.data.options);
});
parent.postMessage("preview-ready", "*");`;
preview.srcdoc = PREVIEW_HTML.replace("</body>", () => "<script>" + previewScript.replace(/<\/script/gi, "<\\/script") + "</script></body>");
form.addEventListener("input", () => { document.querySelector("#result").textContent = ""; update(); });
form.addEventListener("submit", event => {
  event.preventDefault();
  const config = settings();
  const result = document.querySelector("#result");
  if (config.provider === "site") {
    // Relative paths resolve on the embedding site, independently of the studio origin.
    if (!/^\/(?!\/)/.test(config.tokenUrl) || /[\\\s#]/.test(config.tokenUrl)) {
      result.textContent = "token 接口请填写本站路径，例如 /api/xgoose/token。"; fields.tokenUrl.focus(); return;
    }
    try {
      if (!config.endpoint || /[\\\s#]/.test(config.endpoint)) throw new Error();
      const url = new URL(config.endpoint, "https://example.org");
      if (!/^\/(?!\/)/.test(config.endpoint) && !(config.endpoint.startsWith("https://") || (config.endpoint.startsWith("http://") && ["localhost","127.0.0.1","[::1]"].includes(url.hostname)))) throw new Error();
    } catch { result.textContent = "聊天接口请填写本站路径或完整 HTTPS 地址。"; fields.endpoint.focus(); return; }
  }
  const url = URL.createObjectURL(new Blob([compile(EMBED_SOURCE, config)], {type:"application/javascript"}));
  const link = document.createElement("a");
  link.href = url; link.download = "xgoose-lite.site.js"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  result.textContent = "已生成 xgoose-lite.site.js。把它放入网站即可使用。";
});
update();
