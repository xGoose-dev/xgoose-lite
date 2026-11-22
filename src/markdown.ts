/** Model output becomes DOM nodes only; nothing here assigns markup strings. */
const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

type LinkHandler = (url: URL, event: MouseEvent) => void;

function link(text: string, href: string, onLocalLink?: LinkHandler): Node {
  if (!SAFE_URL.test(href)) return document.createTextNode(text);
  const anchor = document.createElement("a");
  anchor.textContent = text;
  anchor.href = href;
  const url = new URL(anchor.href, location.href);
  if (url.origin === location.origin && onLocalLink) anchor.addEventListener("click", (event) => onLocalLink(url, event));
  else { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; }
  return anchor;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])|(\*[^*\s][^*\n]*\*)/g;

function inline(parent: Node, text: string, onLocalLink?: LinkHandler) {
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0], at = match.index ?? 0;
    if (at > last) parent.appendChild(document.createTextNode(text.slice(last, at)));
    last = at + token.length;
    if (match[1]) { const code = document.createElement("code"); code.textContent = token.slice(1, -1); parent.appendChild(code); }
    else if (match[2]) { const strong = document.createElement("strong"); inline(strong, token.slice(2, -2), onLocalLink); parent.appendChild(strong); }
    else if (match[3]) { const split = token.lastIndexOf("]("); parent.appendChild(link(token.slice(1, split), token.slice(split + 2, -1), onLocalLink)); }
    else if (match[4]) parent.appendChild(link(token, token, onLocalLink));
    else { const em = document.createElement("em"); inline(em, token.slice(1, -1), onLocalLink); parent.appendChild(em); }
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

/** A small, forgiving subset: paragraphs, headings, lists, fenced code and inline marks. */
export function renderMarkdown(target: HTMLElement, source: string, onLocalLink?: LinkHandler) {
  const fragment = document.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [], list: HTMLElement | null = null;
  const flush = () => {
    if (paragraph.length) {
      const p = document.createElement("p");
      inline(p, paragraph.join(" "), onLocalLink);
      fragment.appendChild(p);
      paragraph = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush(); list = null;
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      const pre = document.createElement("pre"), block = document.createElement("code");
      block.textContent = code.join("\n");
      pre.appendChild(block);
      fragment.appendChild(pre);
      continue;
    }
    const heading = /^\s{0,3}(#{1,4})\s+(.*)$/.exec(line);
    const item = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush(); list = null;
      const h = document.createElement("h4");
      inline(h, heading[2].replace(/\s+#+\s*$/, ""), onLocalLink);
      fragment.appendChild(h);
    } else if (item) {
      flush();
      const tag = item[1] ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) { list = document.createElement(tag); fragment.appendChild(list); }
      const li = document.createElement("li");
      inline(li, item[2], onLocalLink);
      list.appendChild(li);
    } else if (!line.trim()) { flush(); list = null; }
    else if (list && /^\s{2,}\S/.test(line) && list.lastElementChild) inline(list.lastElementChild, ` ${line.trim()}`, onLocalLink);
    else { list = null; paragraph.push(line.trim()); }
  }
  flush();
  target.replaceChildren(fragment);
}
