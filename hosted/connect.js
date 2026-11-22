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
  let first, conversation, expectedCalls = [], callsUsed = 0, busy = false;
  function reply(id, status, data) {
    openerWindow.postMessage({type: "xgl:result", id, status, data}, site);
  }
  async function complete(id, offerTools) {
    callsUsed++;
    busy = true;
    try {
      const response = await authenticated("/ai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...conversation, tools: offerTools && callsUsed < 6 ? first.body.tools : undefined, stream: false }),
      });
      if (!response.ok) return reply(id, response.status, {error: {message: "xgoose Hosted returned HTTP " + response.status}});
      const { choices } = await response.json();
      const answer = choices?.[0]?.message;
      if (!answer) throw new Error("Missing completion");
      const toolCalls = (answer.tool_calls ?? []).map((call, i) => ({
        id: call.id || "call_" + (callsUsed - 1) + "_" + i, type: "function", function: call.function,
      }));
      expectedCalls = toolCalls.map(call => call.id);
      conversation.messages.push({role:"assistant", content:answer.content ?? null, ...(toolCalls.length ? {tool_calls:toolCalls} : {})});
      reply(id, 200, {choices});
    } catch { reply(id, 502, {error: {message: "Could not reach xgoose Hosted."}}); }
    finally { busy = false; }
  }
  approve.onclick = async () => {
    approve.disabled = true;
    try {
      const response = await authenticated("/me");
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to xgoose, then select Allow again." : "Could not check your account (HTTP " + response.status + ").");
      conversation = { model:first.body.model, messages:first.body.messages.slice() };
      status.textContent = "Connected. You can return to the website.";
      await complete(first.id, true);
    } catch (error) { approve.disabled = lifetime.signal.aborted; status.textContent = error.message; }
  };
  window.addEventListener("message", event => {
    const msg = event.data;
    if (event.origin !== site || event.source !== openerWindow || msg?.type !== "xgl:chat" || typeof msg.id !== "string") return;
    const messages = msg.body?.messages;
    const deny = () => reply(msg.id, 403, {error: {message:"This request is outside the approved question."}});
    if (!Array.isArray(messages) || lifetime.signal.aborted || busy || callsUsed >= 6) return deny();
    if (!first) {
      const question = messages.findLast(message => message?.role === "user")?.content;
      if (typeof question !== "string" || !question.trim()) return deny();
      first = msg;
      document.querySelector("#question").textContent = question;
      document.querySelector("#model").textContent = "Model: " + (msg.body.model || "xgoose default");
      approve.disabled = false;
      return;
    }
    // The popup owns the approved history, model and tools. Only results for
    // the model's outstanding calls may extend this same conversation.
    if (!conversation || !expectedCalls.length) return deny();
    const results = messages.slice(-expectedCalls.length);
    if (results.length !== expectedCalls.length || results.some((r,i) => r?.role !== "tool" || r.tool_call_id !== expectedCalls[i] || typeof r.content !== "string")) return deny();
    conversation.messages.push(...results.map(r => ({role:"tool", tool_call_id:r.tool_call_id, content:r.content})));
    expectedCalls = [];
    void complete(msg.id, Boolean(msg.body.tools));
  });
  openerWindow.postMessage({type:"xgl:loaded"}, site);
}
try { initialize(); } catch (error) { status.textContent = error.message; }
