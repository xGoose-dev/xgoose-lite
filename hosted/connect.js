// This document is hosted by xgoose. The embedding origin receives completions only.
const openerWindow = window.opener;
const site = new URLSearchParams(location.hash.slice(1)).get("site");
const approve = document.querySelector("#approve");
const status = document.querySelector("#status");
document.querySelector("#cancel").onclick = () => window.close();
const api = "https://api.xgoose.org";
const lifetime = new AbortController();
window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
const expire = () => { lifetime.abort(); approve.disabled = true; status.textContent = "This request ended. Send your question again to reconnect."; };
setTimeout(expire, 600_000);

async function authenticated(path, init = {}) {
  const options = { credentials: "include", redirect: "error", cache: "no-store", signal: lifetime.signal, ...init };
  let response = await fetch(api + path, options);
  if (response.status === 401) {
    const refresh = await fetch(api + "/auth/refresh", { ...options, method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!refresh.ok) return new Response(null, {status: refresh.status});
    response = await fetch(api + path, options);
  }
  return response;
}

function initialize() {
  if (!openerWindow || window !== window.top || !site) throw new Error("Open this window from a website using xgoose lite.");
  const origin = new URL(site);
  if (origin.origin !== site || !["https:", "http:"].includes(origin.protocol)) throw new Error("Invalid requesting website.");
  document.querySelector("#site").textContent = site;
  let remaining = 0, busy = false;
  openerWindow.postMessage({type:"xgl:loaded"}, site);
  approve.disabled = false;
  approve.onclick = async () => {
    approve.disabled = true;
    try {
      const response = await authenticated("/me");
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to xgoose, then select Allow again." : "Could not check your account (HTTP " + response.status + ").");
      remaining = 6;
      status.textContent = "Connected. You can return to the website.";
      openerWindow.postMessage({type: "xgl:approved"}, site);
    } catch (error) { approve.disabled = lifetime.signal.aborted; status.textContent = error.message; }
  };
  window.addEventListener("message", async event => {
    const msg = event.data;
    if (event.origin !== site || event.source !== openerWindow || msg?.type !== "xgl:chat" || typeof msg.id !== "string") return;
    const reply = (status, data) => openerWindow.postMessage({ type: "xgl:result", id: msg.id, status, data }, site);
    if (remaining <= 0 || busy || lifetime.signal.aborted) return reply(403, {error: {message: "No active approval for this call."}});
    remaining--;
    busy = true;
    try {
      const { messages, tools, model } = msg.body;
      const response = await authenticated("/ai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, tools, model, stream: false }),
      });
      if (!response.ok) return reply(response.status, {error: {message: "xgoose Hosted returned HTTP " + response.status}});
      const data = await response.json();
      reply(200, {choices: data.choices});
    } catch { reply(502, {error: {message: "Could not reach xgoose Hosted."}}); }
    finally { busy = false; }
  });
}
try { initialize(); } catch (error) { status.textContent = error.message; }
