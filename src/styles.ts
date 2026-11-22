export const STYLES = `
:host {
  all: initial;
  --xgl-accent: #6b4ef0;
  --xgl-beak: #ff8a1f;
  --xgl-bg: #ffffff;
  --xgl-soft: #f3f2fb;
  --xgl-text: #17152b;
  --xgl-muted: #63627a;
  --xgl-border: #e1dff0;
  --xgl-user: #17152b;
  --xgl-user-text: #ffffff;
  --xgl-shadow: 0 24px 70px -20px rgb(23 21 43 / .38), 0 2px 8px rgb(23 21 43 / .08);
  color-scheme: light;
}
:host([data-theme="dark"]) {
  --xgl-accent: #a691ff;
  --xgl-bg: #14132a;
  --xgl-soft: #1f1d3b;
  --xgl-text: #f4f3ff;
  --xgl-muted: #a9a7c4;
  --xgl-border: #302d55;
  --xgl-user: #f4f3ff;
  --xgl-user-text: #14132a;
  --xgl-shadow: 0 24px 70px -20px rgb(0 0 0 / .8), 0 0 0 1px rgb(255 255 255 / .04);
  color-scheme: dark;
}
* { box-sizing: border-box; }
button, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
:focus-visible { outline: 2px solid var(--xgl-accent); outline-offset: 2px; }
svg { display: block; }

.launcher, .panel {
  position: fixed;
  z-index: var(--xgl-z, 2147483000);
  font: 500 14px/1.5 "Manrope Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--xgl-text);
  -webkit-font-smoothing: antialiased;
}
.launcher {
  right: max(var(--xgl-x, 16px), env(safe-area-inset-right));
  bottom: max(var(--xgl-y, 16px), env(safe-area-inset-bottom));
  display: inline-flex; align-items: center; gap: 9px;
  min-height: 48px; padding: 6px 16px 6px 6px;
  border-radius: 999px;
  background: var(--xgl-user); color: var(--xgl-user-text);
  box-shadow: 0 10px 30px -10px rgb(23 21 43 / .55);
  font-weight: 650; letter-spacing: -.01em;
  transition: transform .35s cubic-bezier(.2,.9,.3,1.3), opacity .2s ease;
}
.launcher:hover { transform: translateY(-2px); }
.launcher:active { transform: scale(.97); }
.launcher .mark { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex: none; }
.launcher:hover .mark svg { animation: nod .7s ease; }
.launcher[data-open="true"], .launcher[hidden] { opacity: 0; pointer-events: none; transform: scale(.8); display: inline-flex; }
.launcher[hidden] { display: none; }
@keyframes nod { 30% { transform: rotate(-9deg) translateY(1px); } 65% { transform: rotate(5deg); } }

.panel {
  right: max(var(--xgl-x, 16px), env(safe-area-inset-right));
  bottom: max(var(--xgl-y, 16px), env(safe-area-inset-bottom));
  width: min(408px, calc(100vw - 24px));
  height: min(640px, calc(100dvh - 32px - var(--xgl-y, 16px)));
  display: flex; flex-direction: column;
  border: 1px solid var(--xgl-border); border-radius: 24px;
  background: var(--xgl-bg);
  box-shadow: var(--xgl-shadow);
  overflow: hidden;
  transform-origin: 100% 100%;
  transition: transform .42s cubic-bezier(.2,.9,.25,1.12), opacity .22s ease, visibility 0s linear 0s;
}
.panel[data-open="false"] { transform: scale(.86) translateY(18px); opacity: 0; visibility: hidden; pointer-events: none; transition: transform .22s ease, opacity .18s ease, visibility 0s linear .22s; }

.head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-bottom: 1px solid var(--xgl-border); }
.head .mark { width: 30px; height: 30px; border-radius: 10px; overflow: hidden; flex: none; }
.head strong { overflow: hidden; text-overflow: ellipsis; min-width: 0; font-weight: 750; letter-spacing: -.02em; font-size: 15px; white-space: nowrap; }
.badge { display: inline-flex; align-items: center; gap: 6px; margin-left: 2px; padding: 3px 9px; border-radius: 999px; background: var(--xgl-soft); color: var(--xgl-muted); font-size: 11px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #22b573; box-shadow: 0 0 0 0 rgb(34 181 115 / .5); animation: live 2.4s ease-out infinite; flex: none; }
@keyframes live { 70%, 100% { box-shadow: 0 0 0 7px rgb(34 181 115 / 0); } }
.head .spacer { flex: 1; min-width: 0; }
.icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; color: var(--xgl-muted); flex: none; }
.icon:hover { background: var(--xgl-soft); color: var(--xgl-text); }

.log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 14px 8px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: var(--xgl-border) transparent; }
.empty { margin: auto 0; display: grid; gap: 14px; padding: 6px 2px 10px; }
.empty p { margin: 0; font-size: 19px; line-height: 1.3; font-weight: 700; letter-spacing: -.025em; text-wrap: balance; }
.empty small { color: var(--xgl-muted); font-size: 12px; font-weight: 600; }
.chips { display: grid; gap: 7px; }
.chip { text-align: left; padding: 10px 13px; border: 1px solid var(--xgl-border); border-radius: 14px; font-size: 13px; font-weight: 550; line-height: 1.35; transition: border-color .15s ease, background .15s ease, transform .15s ease; }
.chip:hover { border-color: var(--xgl-accent); background: var(--xgl-soft); transform: translateX(3px); }

.user { align-self: flex-end; max-width: 86%; padding: 9px 14px; border-radius: 18px 18px 5px 18px; background: var(--xgl-user); color: var(--xgl-user-text); white-space: pre-wrap; overflow-wrap: anywhere; animation: rise .28s cubic-bezier(.2,.8,.3,1) both; }
.ai { max-width: 100%; overflow-wrap: anywhere; animation: rise .28s cubic-bezier(.2,.8,.3,1) both; }
.ai > :first-child { margin-top: 0; } .ai > :last-child { margin-bottom: 0; }
.ai p { margin: 0 0 9px; }
.ai h4 { margin: 12px 0 5px; font-size: 14px; font-weight: 750; }
.ai ul, .ai ol { margin: 0 0 9px; padding-left: 20px; } .ai li { margin: 3px 0; }
.ai a { color: var(--xgl-accent); text-decoration: underline; text-underline-offset: 3px; font-weight: 600; }
.ai code { padding: 1px 5px; border-radius: 5px; background: var(--xgl-soft); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ai pre { margin: 0 0 9px; padding: 10px 12px; border-radius: 12px; background: var(--xgl-soft); overflow-x: auto; } .ai pre code { padding: 0; background: none; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }

.tool { align-self: flex-start; max-width: 100%; border: 1px solid var(--xgl-border); border-radius: 12px; font-size: 12.5px; color: var(--xgl-muted); animation: rise .25s ease both; }
.tool summary { display: flex; align-items: center; gap: 8px; padding: 6px 11px 6px 9px; list-style: none; cursor: pointer; font-weight: 600; border-radius: 12px; }
.tool summary::-webkit-details-marker { display: none; }
.tool .state { width: 16px; height: 16px; flex: none; display: grid; place-items: center; }
.tool[data-state="running"] .state::before { content: ""; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--xgl-border); border-top-color: var(--xgl-accent); animation: spin .7s linear infinite; }
.tool[data-state="done"] .state { color: #22b573; } .tool[data-state="failed"] .state { color: #e5484d; }
.tool pre { margin: 0; padding: 8px 11px 10px; border-top: 1px solid var(--xgl-border); max-height: 160px; overflow: auto; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--xgl-muted); }
@keyframes spin { to { transform: rotate(1turn); } }

.thinking { display: inline-flex; align-items: center; gap: 8px; color: var(--xgl-muted); font-size: 13px; font-weight: 600; }
.thinking i { display: inline-flex; gap: 3px; }
.thinking i b { width: 5px; height: 5px; border-radius: 50%; background: var(--xgl-accent); animation: hop 1s ease-in-out infinite; }
.thinking i b:nth-child(2) { animation-delay: .12s; } .thinking i b:nth-child(3) { animation-delay: .24s; }
@keyframes hop { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }

.notice { padding: 12px 14px; border-radius: 14px; background: var(--xgl-soft); font-size: 13px; display: grid; gap: 9px; animation: rise .25s ease both; }
.notice strong { font-size: 15px; letter-spacing: -.02em; }
.notice[data-kind="error"] { border: 1px solid color-mix(in srgb, #e5484d 40%, transparent); background: color-mix(in srgb, #e5484d 8%, var(--xgl-bg)); }
.notice .row { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 650; text-decoration: none; border: 1px solid var(--xgl-border); color: var(--xgl-text); background: var(--xgl-bg); }
.pill:hover { border-color: var(--xgl-accent); }
.pill[data-primary] { background: var(--xgl-accent); border-color: var(--xgl-accent); color: #fff; }
:host([data-theme="dark"]) .pill[data-primary] { color: #14132a; }

.compose { margin: 6px 12px 0; display: flex; align-items: flex-end; gap: 6px; padding: 6px 6px 6px 14px; border: 1px solid var(--xgl-border); border-radius: 20px; background: var(--xgl-bg); transition: border-color .15s ease, box-shadow .15s ease; }
.compose:focus-within { border-color: var(--xgl-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--xgl-accent) 18%, transparent); }
.compose textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: none; padding: 7px 0; max-height: 120px; font-size: 16px; line-height: 1.4; }
@media (min-width: 561px) { .compose textarea { font-size: 14px; } }
.compose textarea::placeholder { color: var(--xgl-muted); }
.send { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--xgl-beak); color: #1d1206; transition: transform .2s cubic-bezier(.2,.9,.3,1.4), opacity .15s ease; }
.send:hover:not(:disabled) { transform: scale(1.08) rotate(-8deg); }
.send:disabled { opacity: .35; cursor: default; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 16px 11px; font-size: 11px; color: var(--xgl-muted); }
.foot span { min-width: 0; }
.foot a { color: inherit; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; }
.foot a:hover { color: var(--xgl-text); }

.spot { position: fixed; z-index: var(--xgl-z, 2147483000); pointer-events: none; border-radius: 10px; outline: 3px solid var(--xgl-beak); outline-offset: 4px; box-shadow: 0 0 0 9999px rgb(23 21 43 / .12); opacity: 0; transition: opacity .25s ease; }
.spot[data-on="true"] { opacity: 1; animation: spot 1s ease-in-out infinite alternate; }
@keyframes spot { to { outline-offset: 8px; } }

@media (max-width: 560px) {
  .panel { left: 8px; right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); width: auto; height: min(78dvh, 640px); border-radius: 22px; transform-origin: 50% 100%; }
  .launcher .text { display: none; }
  .launcher { padding: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;

/** The xgoose mark. Static markup owned by this library. */
export const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%" aria-hidden="true"><rect width="128" height="128" fill="#7357E8"/><path d="M29 106c1-15 9-25 21-33V49c0-16 11-27 26-27 15 0 25 11 25 26 0 15-10 26-25 27v17c-10 3-19 11-23 20H29v-6Z" fill="#FFF"/><path d="m99 44 20 8-20 10V44Z" fill="#FFAE57"/><rect x="65" y="38" width="37" height="17" rx="8.5" fill="#24203B"/><path d="M72 43h11" stroke="#C9BFFF" stroke-width="3" stroke-linecap="round"/></svg>`;
const stroke = (path: string, size = 18) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
export const ICONS = {
  close: stroke('<path d="M18 6 6 18M6 6l12 12"/>'),
  reset: stroke('<path d="M12 5v14M5 12h14"/>'),
  send: stroke('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2.5" fill="currentColor"/></svg>`,
  check: stroke('<path d="m5 12 5 5L20 7"/>', 14),
  fail: stroke('<path d="M18 6 6 18M6 6l12 12"/>', 14),
};
