import { LiteError } from "./agent.js";
import type { LiteOptions } from "./types.js";

export const HOSTED_PAGE = "https://xgoose.org/lite/connect/";
export type Completion = (body: Record<string, unknown>, signal: AbortSignal) => Promise<Response>;

/** A short-lived token is issued by the site's own session on every model call. */
export function siteCompletion(options: LiteOptions): Completion {
  const issuer = new URL(options.tokenUrl ?? "/api/xgoose/token", location.href);
  const endpoint = new URL(options.endpoint ?? "/api/xgoose/chat", location.href);
  if (issuer.origin !== location.origin) throw new Error("The token endpoint must be on this website.");
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))
    throw new Error("The chat endpoint needs HTTPS or localhost.");
  return async (body, signal) => {
    for (let attempt = 0; ; attempt++) {
      const tokenResponse = await fetch(issuer, {
        method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store", signal,
        headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!tokenResponse.ok) throw new LiteError("token", "Website token service returned HTTP " + tokenResponse.status, tokenResponse.status);
      const { access_token } = await tokenResponse.json();
      if (typeof access_token !== "string" || !access_token.trim()) throw new Error("Token service must return access_token.");
      const response = await fetch(endpoint, { method: "POST", credentials: "omit", redirect: "error", signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + access_token }, body: JSON.stringify(body) });
      if (response.status !== 401 || attempt > 0) return response;
      await response.body?.cancel();
    }
  };
}

/** One user gesture, one first-party approval window, one bounded agent turn. */
export function hostedCompletion(signal: AbortSignal): { complete: Completion; close(): void } {
  if (!/^https?:$/.test(location.protocol)) throw new Error("Open this website over HTTP or HTTPS to use xgoose Hosted.");
  const url = new URL(HOSTED_PAGE);
  url.hash = new URLSearchParams({ site: location.origin }).toString();
  const popup = window.open(url.href, "_blank", "popup,width=500,height=560");
  if (!popup) throw new Error("Allow the xgoose sign-in popup, then try again.");
  let pending: { id: string; resolve(value: Response): void; reject(error: Error): void; body: unknown } | undefined;
  let ready = false;
  let closed: Error | undefined;
  function send() {
    if (ready && pending) popup!.postMessage({ type: "xgl:chat", id: pending.id, body: pending.body }, url.origin);
  }
  function receive(event: MessageEvent) {
    if (event.source !== popup || event.origin !== url.origin) return;
    const msg = event.data;
    if (msg?.type === "xgl:loaded" && !ready) { clearTimeout(handshake); ready = true; send(); }
    if (pending && msg?.type === "xgl:result" && msg.id === pending.id) {
      pending.resolve(Response.json(msg.data, { status: msg.status }));
      pending = undefined;
    }
  }
  function close(reason?: unknown) {
    if (closed) return;
    closed = new Error(typeof reason === "string" ? reason : "xgoose authorization closed or expired. Send again to reconnect.");
    clearTimeout(handshake);
    clearInterval(watch);
    clearTimeout(deadline);
    window.removeEventListener("message", receive);
    signal.removeEventListener("abort", close);
    popup!.close();
    pending?.reject(closed);
    pending = undefined;
  }
  window.addEventListener("message", receive);
  const handshake = window.setTimeout(() => close("The xgoose Hosted authorization page is unavailable. Check that the official connection page is online."), 15_000);
  const watch = window.setInterval(() => { if (popup.closed) close(); }, 400);
  const deadline = window.setTimeout(close, 10 * 60_000);
  signal.addEventListener("abort", close, { once: true });
  return { close, complete: (body) => new Promise((resolve, reject) => {
    if (closed) return reject(closed);
    pending = { id: Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"), body, resolve, reject };
    send();
  }) };
}
