import { LiteError, runTurn } from "./agent.js";
import { ElementRegistry, createPageTools } from "./pageTools.js";
import { stringsFor, type Strings } from "./strings.js";
import { Panel } from "./ui.js";
import type { ChatMessage, LiteController, LiteOptions, LiteTool, ToolContext } from "./types.js";

import { localAnswer } from "./local.js";
import { defaults } from "./defaults.js";
import { hostedCompletion, siteCompletion } from "./connection.js";
export type { LiteAction, LiteController, LiteEvent, LiteOptions, LiteSkill, LiteTool, ToolContext } from "./types.js";
export { defaults };
export const version = "0.1.0";

let active: LiteController | null = null;

function systemPrompt(options: LiteOptions, tools: LiteTool[]): string {
  const skills = (options.skills ?? []).map((skill) => `- ${skill.name}: ${skill.description ?? skill.tools.map((tool) => tool.name).join(", ")}`);
  return [
    `You are ${options.name ?? "xgoose lite"}, an assistant that lives inside the web page the visitor is looking at.`,
    `Current page: "${document.title}" at ${location.href}. Page language: ${document.documentElement.lang || "unknown"}.`,
    "Ground answers about the page in the available page tools.",
    "Act on the page (click, type_text, scroll_to) only when the visitor asks for it, then say what you did in one sentence.",
    "Element refs such as e12 are for tool calls only; never show them. Use markdown links for pages you mention.",
    skills.length ? `Website skills on this site:\n${skills.join("\n")}` : "",
    `Available tools: ${tools.map((tool) => tool.name).join(", ")}.`,
    options.instructions ?? "",
  ].filter(Boolean).join("\n");
}

/** An interrupted run can leave tool calls unanswered; providers reject that history. */
function repair(messages: ChatMessage[]) {
  for (let i = 0; i < messages.length; i++) {
    const calls = messages[i].role === "assistant" ? messages[i].tool_calls ?? [] : [];
    let at = i + 1;
    for (const call of calls) {
      if (messages[at]?.role === "tool" && messages[at].tool_call_id === call.id) { at++; continue; }
      messages.splice(at++, 0, { role: "tool", tool_call_id: call.id, content: '{"error":"interrupted"}' });
    }
  }
}

/** Mount a fresh assistant. Conversation and credentials live only in memory. */
export function init(initial: LiteOptions = {}): LiteController {
  active?.destroy();
  let options: LiteOptions = { ...defaults, ...initial };
  let strings: Strings = stringsFor(options.locale);
  const registry = new ElementRegistry();
  const messages: ChatMessage[] = [];
  let run: AbortController | null = null;
  let lastQuestion = "";

  const emit = (event: Parameters<NonNullable<LiteOptions["onEvent"]>>[0]) => { try { options.onEvent?.(event); } catch { /* Host analytics must not break the conversation. */ } };
  const onLocalLink = (url: URL, event: MouseEvent) => {
    if (!options.navigate || event.metaKey || event.ctrlKey || event.shiftKey || url.pathname === location.pathname && url.hash) return;
    event.preventDefault();
    options.navigate(url.pathname + url.search + url.hash);
  };
  const tools = (): LiteTool[] => [...createPageTools(registry, options.navigate).filter(tool => options.pageTools?.includes(tool.name)), ...(options.skills ?? []).flatMap((skill) => skill.tools)];
  const labelFor = (tool: LiteTool | undefined, args: unknown) => {
    const label = typeof tool?.label === "function" ? tool.label(args) : tool?.label;
    return label || strings.usedTool;
  };
  const resolvedTheme = (): "light" | "dark" => {
    if (options.theme === "light" || options.theme === "dark") return options.theme;
    const root = document.documentElement;
    if (root.classList.contains("dark") || root.dataset.theme === "dark") return "dark";
    if (root.classList.contains("light") || root.dataset.theme === "light") return "light";
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  async function refreshQuota() {
    if (!options.statusUrl) return;
    try {
      const response = await fetch(options.statusUrl, { credentials: "omit" });
      if (!response.ok) return;
      const status = await response.json();
      panel.setQuota(typeof status.remaining === "number" ? status.remaining : null);
    } catch { /* The meter is informational; sending still reports real limits. */ }
  }

  function showError(error: unknown) {
    const code = error instanceof LiteError ? error.code : "failed";
    emit({ type: "error", code });
    if (code === "demo_limit_reached" || code === "demo_budget_reached") {
      panel.setQuota(0);
      return panel.addNotice("limit", strings.limitTitle, strings.limitBody, panel.limitActions());
    }
    const status = error instanceof LiteError ? error.status : 0;
    const body = code === "token" && (status === 401 || status === 403) ? strings.loginRequired
      : error instanceof Error && error.message ? error.message : status ? "HTTP " + status : strings.failed;
    panel.addNotice("error", null, body, status === 413 ? [] : [{ label: strings.retry, onClick: () => { if (lastQuestion) void ask(lastQuestion, true); } }]);
  }

  async function ask(text: string, retry = false) {
    const question = text.trim();
    if (!question || run) return;
    panel.clearRetry();
    panel.setOpen(true);
    lastQuestion = question;
    if (!retry) {
      if (options.provider === "local") messages.length = 0;
      panel.addUser(question);
      messages.push({ role: "user", content: question });
      emit({ type: "message", text: question });
    }
    repair(messages);
    run = new AbortController();
    const signal = run.signal;
    panel.setBusy(true);
    let bubble = panel.addAssistant();
    const cards = new Map<string, ReturnType<Panel["addTool"]>>();
    const context: ToolContext = { signal, ref: registry.ref, highlight: (element) => panel.highlight(element) };
    let hosted: ReturnType<typeof hostedCompletion> | undefined;
    try {
      const available = tools();
      if (options.provider === "local") {
        const answer = await localAnswer(question, available, context, strings);
        signal.throwIfAborted();
        messages.push({ role: "assistant", content: answer });
        bubble.done(answer);
        return;
      }
      if (options.provider === "hosted") hosted = hostedCompletion(signal);
      await runTurn({
        options, complete: hosted?.complete ?? siteCompletion(options), system: systemPrompt(options, available), messages, tools: available, context,
        hooks: {
          onText: (partial) => { panel.setThinking(false); bubble.setText(partial); },
          onAssistantDone: (full) => { bubble.done(full); bubble = panel.addAssistant(); panel.setThinking(true); },
          onToolStart: (call, tool, args) => { cards.set(call.id, panel.addTool(labelFor(tool, args))); emit({ type: "tool", name: call.function.name }); },
          onToolEnd: (call, result, failed) => { cards.get(call.id)?.finish(failed, result); },
        },
      });
    } catch (error) {
      if (signal.aborted && run?.signal === signal) panel.addNotice("info", null, strings.stopped);
      else if (!signal.aborted) showError(error);
    } finally {
      hosted?.close();
      if (run?.signal === signal) {
        run = null;
        panel.setBusy(false);
        void refreshQuota();
      }
    }
  }

  const panel = new Panel(strings, {
    onSend: (text) => void ask(text),
    onStop: () => run?.abort(),
    onReset: () => { run?.abort(); run = null; panel.setBusy(false); messages.length = 0; lastQuestion = ""; panel.clear(); emit({ type: "reset" }); },
    onOpenChange: (open) => { emit({ type: open ? "open" : "close" }); if (open) void refreshQuota(); },
    onLocalLink,
  });

  const present = () => panel.configure({
    strings, theme: resolvedTheme(), accent: options.accent, offset: options.offset, zIndex: options.zIndex,
    launcher: options.launcher !== false, name: options.name, greeting: options.greeting || (options.provider === "local" ? strings.localGreeting : strings.greeting), note: options.provider === "local" ? strings.localNote : options.provider === "hosted" ? strings.hostedNote : strings.siteNote, suggestions: options.suggestions ?? (options.provider === "local" && options.pageTools?.includes("read_page") ? [strings.overview] : []), actions: options.actions ?? [],
  });
  present();

  const themeWatcher = new MutationObserver(() => panel.configure({ theme: resolvedTheme() }));
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "lang"] });
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => panel.configure({ theme: resolvedTheme() });
  scheme.addEventListener("change", onScheme);

  const controller: LiteController = {
    open: () => panel.setOpen(true),
    close: () => panel.setOpen(false),
    toggle: () => panel.setOpen(!panel.isOpen),
    ask: (text) => void ask(text),
    update(next) {
      if (["provider", "endpoint", "tokenUrl", "pageTools", "skills", "model"].some(key => key in next)) {
        run?.abort(); run = null; messages.length = 0; lastQuestion = ""; panel.setBusy(false); panel.clear();
      }
      options = { ...options, ...next };
      strings = stringsFor(options.locale);
      present();
    },
    destroy() {
      run?.abort(); run = null;
      themeWatcher.disconnect();
      scheme.removeEventListener("change", onScheme);
      panel.destroy();
      if (active === controller) active = null;
    },
  };
  active = controller;
  return controller;
}
