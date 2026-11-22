/** Public contract of xgoose lite: a small in-page agent a website can embed. */
export interface ToolContext {
  /** Aborts when the visitor stops the run. */
  signal: AbortSignal;
  /** Give an element a short handle the model can pass back to page tools. */
  ref(element: Element): string;
  /** Scroll an element into view and outline it for a moment. */
  highlight(element: Element): void;
}

export interface LiteTool {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters?: Record<string, unknown>;
  /** Short progress line shown in the conversation, e.g. "Searching skills". */
  label?: string | ((args: any) => string);
  run(args: any, context: ToolContext): unknown | Promise<unknown>;
}

/** A website skill: named tools that teach the assistant how one site works. */
export interface LiteSkill {
  name: string;
  description?: string;
  tools: LiteTool[];
}

export interface LiteAction {
  label: string;
  href: string;
}

export type LiteEvent =
  | { type: "open" | "close" | "reset" }
  | { type: "message"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; code: string };

export interface LiteOptions {
  /** OpenAI-compatible Chat Completions URL that accepts this page's origin. */
  endpoint?: string;
  provider?: "local" | "site" | "hosted";
  /** Same-origin POST endpoint returning { access_token } for the signed-in visitor. */
  tokenUrl?: string;
  pageTools?: string[];
  model?: string;
  /** Optional URL returning {available, remaining, limit} for a metered demo. */
  statusUrl?: string;
  name?: string;
  locale?: string;
  theme?: "auto" | "light" | "dark";
  accent?: string;
  /** Pixels from the bottom-right corner of the viewport. */
  offset?: { x?: number; y?: number };
  /** Stacking order of the widget. Defaults to the top of the page. */
  zIndex?: number;
  /** Hide the floating button when the site provides its own entry point. */
  launcher?: boolean;
  greeting?: string;
  suggestions?: string[];
  skills?: LiteSkill[];
  /** Extra instructions appended to the built-in system prompt. */
  instructions?: string;
  /** Client-side navigation for same-origin links, so the conversation survives. */
  navigate?: (url: string) => void;
  /** Shown beside the composer and when a metered demo runs out. */
  actions?: LiteAction[];
  maxSteps?: number;
  onEvent?: (event: LiteEvent) => void;
}

export interface LiteController {
  open(): void;
  close(): void;
  toggle(): void;
  /** Open the panel and send a question as the visitor. */
  ask(text: string): void;
  /** Replace locale, theme, suggestions and similar presentation options. */
  update(options: Partial<LiteOptions>): void;
  destroy(): void;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
