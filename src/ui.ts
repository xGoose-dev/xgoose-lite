import { renderMarkdown } from "./markdown.js";
import { ICONS, MARK, STYLES } from "./styles.js";
import type { Strings } from "./strings.js";
import type { LiteAction } from "./types.js";

export interface PanelCallbacks {
  onSend(text: string): void;
  onStop(): void;
  onReset(): void;
  onOpenChange(open: boolean): void;
  onLocalLink?: (url: URL, event: MouseEvent) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
/** Static, library-owned icon markup only. */
function icon(markup: string, className?: string): HTMLSpanElement {
  const span = el("span", className);
  span.innerHTML = markup;
  return span;
}

/** The floating button and conversation panel, isolated in a shadow root. */
export class Panel {
  readonly host = el("div");
  private root: ShadowRoot;
  private launcher = el("button", "launcher");
  private launcherText = el("span", "text");
  private panel = el("section", "panel");
  private title = el("strong");
  private badge = el("span", "badge");
  private resetButton = el("button", "icon");
  private closeButton = el("button", "icon");
  private log = el("div", "log");
  private input = el("textarea");
  private send = el("button", "send");
  private note = el("span");
  private actionLink = el("a");
  private spot = el("div", "spot");
  private thinking: HTMLElement | null = null;
  private spotTimer = 0;
  private spotFrame = 0;
  private busy = false;
  private open = false;
  private quota: number | null = null;
  private greeting = "";
  private footerNote = "";
  private suggestions: string[] = [];
  private actions: LiteAction[] = [];

  constructor(private strings: Strings, private callbacks: PanelCallbacks) {
    this.host.setAttribute("data-xgoose-lite", "");
    this.root = this.host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = STYLES;

    this.launcher.type = "button";
    this.launcher.append(icon(MARK, "mark"), this.launcherText);
    this.launcher.addEventListener("click", () => this.setOpen(true));

    this.panel.setAttribute("role", "dialog");
    this.panel.dataset.open = "false";
    this.panel.inert = true;
    const head = el("header", "head");
    this.resetButton.type = this.closeButton.type = "button";
    this.resetButton.append(icon(ICONS.reset));
    this.closeButton.append(icon(ICONS.close));
    this.resetButton.addEventListener("click", () => this.callbacks.onReset());
    this.closeButton.addEventListener("click", () => this.setOpen(false));
    head.append(icon(MARK, "mark"), this.title, this.badge, el("span", "spacer"), this.resetButton, this.closeButton);

    this.log.setAttribute("aria-live", "polite");
    const compose = el("form", "compose");
    this.input.rows = 1;
    this.send.type = "submit";
    compose.append(this.input, this.send);
    compose.addEventListener("submit", (event) => { event.preventDefault(); this.submit(); });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.submit(); }
    });
    this.input.addEventListener("input", () => { this.grow(); this.syncSend(); });
    const foot = el("footer", "foot");
    foot.append(this.note, this.actionLink);
    this.panel.append(head, this.log, compose, foot);
    this.panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); this.setOpen(false); this.launcher.focus(); }
      // Page-level shortcuts (games, site search) must not react to typing here.
      else event.stopPropagation();
    });

    this.root.append(style, this.launcher, this.panel, this.spot);
    this.applyStrings();
    this.renderEmpty();
    document.body.appendChild(this.host);
  }

  get isOpen() { return this.open; }
  get isEmpty() { return !this.log.querySelector(".user"); }

  configure(input: { note?: string; strings?: Strings; theme?: "light" | "dark"; accent?: string; offset?: { x?: number; y?: number }; zIndex?: number; launcher?: boolean; name?: string; greeting?: string; suggestions?: string[]; actions?: LiteAction[] }) {
    if (input.note !== undefined) this.footerNote = input.note;
    if (input.strings) this.strings = input.strings;
    if (input.theme) this.host.dataset.theme = input.theme;
    if (input.accent) this.host.style.setProperty("--xgl-accent", input.accent);
    if (input.offset?.x !== undefined) this.host.style.setProperty("--xgl-x", `${input.offset.x}px`);
    if (input.offset?.y !== undefined) this.host.style.setProperty("--xgl-y", `${input.offset.y}px`);
    if (input.zIndex !== undefined) this.host.style.setProperty("--xgl-z", String(input.zIndex));
    if (input.launcher !== undefined) this.launcher.hidden = !input.launcher;
    if (input.name !== undefined) this.title.dataset.name = input.name;
    if (input.greeting !== undefined) this.greeting = input.greeting;
    if (input.suggestions) this.suggestions = input.suggestions;
    if (input.actions) this.actions = input.actions;
    this.applyStrings();
    if (this.isEmpty && !this.busy) this.renderEmpty();
  }

  private applyStrings() {
    const s = this.strings;
    this.launcherText.textContent = s.launcher;
    this.launcher.setAttribute("aria-label", s.launcherLabel);
    this.panel.setAttribute("aria-label", this.title.dataset.name || s.title);
    this.title.textContent = this.title.dataset.name || s.title;
    this.badge.textContent = s.badge;
    this.resetButton.setAttribute("aria-label", s.newChat);
    this.resetButton.title = s.newChat;
    this.closeButton.setAttribute("aria-label", s.close);
    this.input.placeholder = s.placeholder;
    this.input.setAttribute("aria-label", s.placeholder);
    this.syncSend();
    this.syncFoot();
  }

  private syncSend() {
    this.send.replaceChildren(icon(this.busy ? ICONS.stop : ICONS.send));
    this.send.setAttribute("aria-label", this.busy ? this.strings.stop : this.strings.send);
    this.send.disabled = !this.busy && !this.input.value.trim();
  }

  private syncFoot() {
    this.note.textContent = this.quota === null ? this.footerNote : this.strings.remaining.replace("{0}", String(this.quota));
    const action = this.actions[0];
    this.actionLink.hidden = !action;
    if (action) { this.actionLink.textContent = action.label; this.actionLink.href = action.href; }
  }

  private grow() {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(120, this.input.scrollHeight)}px`;
  }

  private submit() {
    if (this.busy) return this.callbacks.onStop();
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = "";
    this.grow();
    this.callbacks.onSend(text);
  }

  private renderEmpty() {
    const empty = el("div", "empty");
    empty.append(el("p", undefined, this.greeting || this.strings.greeting));
    if (this.suggestions.length) {
      empty.append(el("small", undefined, this.strings.suggestionsLabel));
      const chips = el("div", "chips");
      for (const suggestion of this.suggestions) {
        const chip = el("button", "chip", suggestion);
        chip.type = "button";
        chip.addEventListener("click", () => this.callbacks.onSend(suggestion));
        chips.append(chip);
      }
      empty.append(chips);
    }
    this.log.replaceChildren(empty);
  }

  private append(node: HTMLElement) {
    this.log.querySelector(".empty")?.remove();
    const pinned = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
    // The thinking indicator always stays last.
    if (this.thinking && node !== this.thinking) this.log.insertBefore(node, this.thinking); else this.log.append(node);
    if (pinned || node.classList.contains("user")) this.scrollToEnd();
  }

  private scrollToEnd() { this.log.scrollTop = this.log.scrollHeight; }

  setOpen(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    this.panel.dataset.open = String(open);
    this.panel.inert = !open;
    this.launcher.inert = open;
    this.launcher.dataset.open = String(open);
    this.launcher.setAttribute("aria-expanded", String(open));
    if (open) { this.scrollToEnd(); this.input.focus({ preventScroll: true }); }
    else if (!this.launcher.hidden) this.launcher.focus({ preventScroll: true });
    this.callbacks.onOpenChange(open);
  }

  setBusy(busy: boolean) {
    this.busy = busy;
    this.syncSend();
    this.setThinking(busy);
  }

  setThinking(on: boolean) {
    if (on && !this.thinking) {
      const thinking = el("div", "thinking");
      const dots = el("i");
      dots.append(el("b"), el("b"), el("b"));
      thinking.append(dots, el("span", undefined, this.strings.thinking));
      this.thinking = thinking;
      this.append(thinking);
    } else if (!on && this.thinking) { this.thinking.remove(); this.thinking = null; }
  }

  setQuota(remaining: number | null) { this.quota = remaining; this.syncFoot(); }

  clear() { this.setThinking(false); this.renderEmpty(); }

  addUser(text: string) { this.append(el("div", "user", text)); }

  /** A streaming assistant bubble; text is re-rendered as it grows. */
  addAssistant() {
    let bubble: HTMLDivElement | null = null, frame = 0, latest = "";
    const paint = () => {
      frame = 0;
      if (!latest.trim()) return;
      if (!bubble) { bubble = el("div", "ai"); this.append(bubble); }
      const pinned = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
      renderMarkdown(bubble, latest, this.callbacks.onLocalLink);
      if (pinned) this.scrollToEnd();
    };
    return {
      setText: (text: string) => { latest = text; if (!frame) frame = requestAnimationFrame(paint); },
      done: (text: string) => { latest = text; cancelAnimationFrame(frame); paint(); },
    };
  }

  addTool(label: string) {
    const card = el("details", "tool");
    card.dataset.state = "running";
    const summary = el("summary"), state = el("span", "state");
    summary.append(state, el("span", undefined, label));
    card.append(summary);
    this.append(card);
    return {
      finish: (failed: boolean, detail: unknown) => {
        card.dataset.state = failed ? "failed" : "done";
        state.replaceChildren(icon(failed ? ICONS.fail : ICONS.check));
        const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? null, null, 1);
        card.append(el("pre", undefined, text.length > 1500 ? `${text.slice(0, 1500)}…` : text));
      },
    };
  }

  addNotice(kind: "error" | "limit" | "info", title: string | null, body: string, buttons: { label: string; href?: string; primary?: boolean; onClick?: () => void }[] = []) {
    const notice = el("div", "notice");
    notice.dataset.kind = kind;
    if (title) notice.append(el("strong", undefined, title));
    if (body) notice.append(el("span", undefined, body));
    if (buttons.length) {
      const row = el("div", "row");
      for (const button of buttons) {
        const control = button.href ? el("a", "pill", button.label) : el("button", "pill", button.label);
        if (control instanceof HTMLAnchorElement) control.href = button.href!; else control.type = "button";
        if (button.primary) control.dataset.primary = "";
        if (button.onClick) control.addEventListener("click", () => { notice.remove(); button.onClick!(); });
        row.append(control);
      }
      notice.append(row);
    }
    this.append(notice);
  }

  limitActions() { return this.actions.map((action, index) => ({ ...action, primary: index === 0 })); }

  /** Scroll to an element and keep an outline on it while it moves into place. */
  highlight(element: Element) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    clearTimeout(this.spotTimer);
    cancelAnimationFrame(this.spotFrame);
    const track = () => {
      if (!element.isConnected) return;
      const rect = element.getBoundingClientRect();
      Object.assign(this.spot.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      this.spotFrame = requestAnimationFrame(track);
    };
    track();
    this.spot.dataset.on = "true";
    this.spotTimer = window.setTimeout(() => { this.spot.dataset.on = "false"; cancelAnimationFrame(this.spotFrame); }, 2200);
  }

  destroy() {
    clearTimeout(this.spotTimer);
    cancelAnimationFrame(this.spotFrame);
    this.host.remove();
  }
}
