import type { LiteTool, ToolContext } from "./types.js";

/** Elements the page tools must never read or operate. */
const IGNORED = "[data-xgoose-lite],[data-xgoose-ignore],script,style,noscript,template,[hidden],[inert],[contenteditable]:not([contenteditable=false])";
const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link],[role=menuitem],[role=switch],[role=checkbox]';
const TEXT_INPUT = /^(text|search|url|tel|email)$/i;
const SENSITIVE_AUTOCOMPLETE = /cc-|one-time-code|current-password|new-password/i;

const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function visible(element: Element): boolean {
  if (element.closest(IGNORED)) return false;
  if (!element.getClientRects().length) return false;
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.opacity !== "0";
}

function pageText(root: Element, max = 5201, start?: Element, end?: Element): string {
  if (root.closest(IGNORED + ",textarea")) return "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element) return node.matches(IGNORED + ",textarea") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return node.parentElement && visible(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  if (start) walker.currentNode = start;
  let text = "";
  for (let node = walker.nextNode(); node && text.length < max; node = walker.nextNode()) {
    if (end && (end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    const part = clean(node.textContent);
    if (part) text += (text ? " " : "") + part.slice(0, max - text.length);
  }
  return text;
}

function accessibleName(element: Element): string {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
  const labelled = ids.map(id => document.getElementById(id)).map(el => el ? pageText(el, 90) : "").join(" ").trim();
  const labels = (element as HTMLInputElement).labels;
  const nativeLabel = labels ? [...labels].map(label => pageText(label, 90)).join(" ").trim() : "";
  return clip(clean(element.getAttribute("aria-label") || labelled || nativeLabel || pageText(element, 90) ||
    element.getAttribute("placeholder") || element.getAttribute("title") || element.getAttribute("alt")), 90);
}

function kindOf(element: Element): string {
  const role = element.getAttribute("role");
  if (role) return role;
  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "input") return `input:${(element as HTMLInputElement).type}`;
  return tag;
}

/** Short-lived element handles, so the model never has to write selectors. */
export class ElementRegistry {
  private elements = new Map<string, WeakRef<Element>>();
  private ids = new WeakMap<Element, string>();
  private next = 1;
  ref = (element: Element): string => {
    let id = this.ids.get(element);
    if (!id) {
      id = `e${this.next++}`;
      this.ids.set(element, id);
      this.elements.set(id, new WeakRef(element));
    }
    return id;
  };
  resolve(id: unknown): Element {
    const element = typeof id === "string" ? this.elements.get(id)?.deref() : undefined;
    if (!element || !element.isConnected || !visible(element)) throw new Error("That element is no longer on the page. Look it up again.");
    return element;
  }
}

const pageRoot = () => document.querySelector("main") ?? document.body;
const settle = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function createPageTools(registry: ElementRegistry, navigate?: (url: string) => void): LiteTool[] {
  const describe = (element: Element) => ({ ref: registry.ref(element), kind: kindOf(element), name: accessibleName(element) });

  const readPage: LiteTool = {
    name: "read_page",
    description: "Read the visible text of the current page: title, URL, heading outline and content. Pass `section` (a heading ref or part of a heading) to read one section in full.",
    parameters: { type: "object", properties: { section: { type: "string", description: "Heading ref or heading text to focus on." } } },
    label: "Reading the page",
    run({ section }: { section?: string }) {
      const root = pageRoot();
      const elements = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
      const headings = elements.map((heading) => ({ level: Number(heading.tagName[1]), text: clip(clean(heading.getAttribute("aria-label") || pageText(heading, 100)), 100), ref: registry.ref(heading) }))
        .filter((heading) => heading.text);
      let start: Element | undefined, end: Element | undefined;
      if (section) {
        const wanted = section.toLowerCase();
        const match = headings.find((heading) => heading.ref === section || heading.text.toLowerCase().includes(wanted));
        if (!match) throw new Error(`No heading matches "${section}".`);
        start = registry.resolve(match.ref);
        end = elements.slice(elements.indexOf(start) + 1).find(heading => Number(heading.tagName[1]) <= match.level);
      }
      const text = pageText(root, 5201, start, end);
      const limit = 5200;
      return {
        title: document.title,
        url: location.href,
        language: document.documentElement.lang || undefined,
        ...(section ? {} : { headings: headings.slice(0, 40) }),
        text: clip(text, limit),
        ...(text.length > limit ? { truncated: true, hint: "Use `section` or find_on_page for the rest." } : {}),
      };
    },
  };

  const findOnPage: LiteTool = {
    name: "find_on_page",
    description: "Find visible text on the page. Returns matching snippets with element refs for scroll_to or click.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    label: ({ query }) => `Looking for “${clip(String(query ?? ""), 40)}”`,
    run({ query }: { query: string }) {
      const wanted = clean(query).toLowerCase();
      if (!wanted) throw new Error("query is required");
      const matches: { ref: string; kind: string; snippet: string }[] = [];
      const seen = new Set<Element>();
      const walker = document.createTreeWalker(pageRoot(), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && matches.length < 8; node = walker.nextNode()) {
        const text = clean(node.textContent);
        const at = text.toLowerCase().indexOf(wanted);
        const parent = node.parentElement;
        if (at < 0 || parent?.closest("textarea") || !parent || seen.has(parent) || !visible(parent)) continue;
        seen.add(parent);
        const target = parent.closest(INTERACTIVE) ?? parent;
        matches.push({ ref: registry.ref(target), kind: kindOf(target), snippet: clip(text.slice(Math.max(0, at - 60), at + wanted.length + 120), 200) });
      }
      return matches.length ? { matches } : { matches, hint: "Nothing visible matches. Try a shorter phrase or read_page." };
    },
  };

  const listActions: LiteTool = {
    name: "list_actions",
    description: "List links, buttons, tabs and form fields the visitor can use on this page, each with a ref. Pass `filter` to narrow by name.",
    parameters: { type: "object", properties: { filter: { type: "string" } } },
    label: "Checking what this page can do",
    run({ filter }: { filter?: string }) {
      const wanted = clean(filter).toLowerCase();
      const actions = [...pageRoot().querySelectorAll(INTERACTIVE), ...document.querySelectorAll(`header ${INTERACTIVE.split(",").join(",header ")}`)]
        .filter((element, index, all) => all.indexOf(element) === index && visible(element) && !(element as HTMLButtonElement).disabled)
        .map((element) => ({ ...describe(element), ...(element instanceof HTMLAnchorElement ? { href: element.getAttribute("href") } : {}) }))
        .filter((action) => action.name && (!wanted || action.name.toLowerCase().includes(wanted)));
      return { total: actions.length, actions: actions.slice(0, 45) };
    },
  };

  const scrollTo: LiteTool = {
    name: "scroll_to",
    description: "Scroll an element into view and outline it so the visitor can see it.",
    parameters: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
    label: "Showing you where it is",
    async run({ ref }: { ref: string }, context: ToolContext) {
      const element = registry.resolve(ref);
      context.highlight(element);
      await settle(450);
      const current = registry.resolve(ref);
      return { ok: true, shown: accessibleName(current) || pageText(current, 90) };
    },
  };

  const click: LiteTool = {
    name: "click",
    description: "Click a link, button or tab on this page by ref. Only use it when the visitor asked for that action.",
    parameters: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
    label: "Clicking for you",
    async run({ ref }: { ref: string }, context: ToolContext) {
      const element = registry.resolve(ref);
      const target = (element.closest(INTERACTIVE) ?? element) as HTMLElement;
      if (!target.matches(INTERACTIVE) || !visible(target)) throw new Error("That element cannot be clicked.");
      if ((target as HTMLButtonElement).disabled) throw new Error("That control is disabled.");
      const name = accessibleName(target);
      if (target instanceof HTMLAnchorElement) {
        const url = new URL(target.href, location.href);
        if (url.origin !== location.origin || target.target === "_blank" || target.hasAttribute("download"))
          return { ok: false, url: url.href, reason: "This link leaves the page. Give the visitor the URL instead of opening it." };
        context.highlight(target);
        await settle(350);
        context.signal.throwIfAborted();
        registry.resolve(ref);
        if (navigate && !url.hash) navigate(url.pathname + url.search); else target.click();
      } else {
        context.highlight(target);
        await settle(350);
        context.signal.throwIfAborted();
        registry.resolve(ref);
        target.click();
      }
      await settle(600);
      return { ok: true, clicked: name, url: location.href };
    },
  };

  const typeText: LiteTool = {
    name: "type_text",
    description: "Type into a text field or search box by ref. Does not submit the form.",
    parameters: { type: "object", properties: { ref: { type: "string" }, text: { type: "string" } }, required: ["ref", "text"] },
    label: "Typing for you",
    async run({ ref, text }: { ref: string; text: string }, context: ToolContext) {
      const field = registry.resolve(ref);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !visible(field) || field.disabled || field.readOnly)
        throw new Error("That element is not an editable text field.");
      if ((field instanceof HTMLInputElement && !TEXT_INPUT.test(field.type)) || SENSITIVE_AUTOCOMPLETE.test(field.autocomplete))
        throw new Error("Choose a regular text field or search box.");
      context.highlight(field);
      field.focus();
      // Frameworks track the value through the native setter.
      const prototype = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, String(text));
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      await settle(500);
      return { ok: true };
    },
  };

  return [readPage, findOnPage, listActions, scrollTo, click, typeText];
}
