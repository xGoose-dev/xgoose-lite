import type { ChatMessage, LiteOptions, LiteTool, ToolCall, ToolContext } from "./types.js";

import type { Completion } from "./connection.js";

export class LiteError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
  }
}

const MAX_REQUEST_BYTES = 48_000;
const MAX_MESSAGES = 36;
const MAX_TOOL_RESULT_CHARS = 7000;

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Drop the oldest whole exchanges until the request fits the endpoint's limits. */
export function fitMessages(messages: ChatMessage[], tools: unknown, system: string): ChatMessage[] {
  let kept = messages;
  const tooLarge = () => kept.length > MAX_MESSAGES || bytes({ system, tools, kept }) > MAX_REQUEST_BYTES;
  while (tooLarge()) {
    const next = kept.findIndex((message, index) => index > 0 && message.role === "user");
    if (next < 0) break;
    kept = kept.slice(next);
  }
  return kept;
}

interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
}

async function requestCompletion(
  complete: Completion,
  body: Record<string, unknown>,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<StreamResult> {
  const response = await complete(body, signal);
  if (!response.ok || !response.body) {
    let code = "http", message = "";
    try {
      const data = await response.json();
      code = String(data?.error?.code ?? (typeof data?.error === "string" ? data.error : code));
      message = String(data?.message ?? data?.error?.message ?? "");
    } catch { /* Non-JSON error bodies keep the generic message. */ }
    throw new LiteError(code, message, response.status);
  }
  const result: StreamResult = { text: "", toolCalls: [] };
  const consume = (payload: any) => {
    if (payload?.error) throw new LiteError("upstream", String(payload.error?.message ?? ""));
    const choice = payload?.choices?.[0];
    const delta = choice?.delta ?? choice?.message;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content) {
      result.text += delta.content;
      onText(result.text);
    }
    for (const call of delta.tool_calls ?? []) {
      const index = typeof call.index === "number" ? call.index : result.toolCalls.length;
      const slot = (result.toolCalls[index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
      if (call.id) slot.id = call.id;
      if (call.function?.name) slot.function.name += call.function.name;
      if (call.function?.arguments) slot.function.arguments += call.function.arguments;
    }
  };
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    consume(await response.json());
    return result;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") consume(JSON.parse(data));
    }
    if (done) break;
  }
  return result;
}

export interface TurnHooks {
  onText(text: string): void;
  onAssistantDone(text: string): void;
  onToolStart(call: ToolCall, tool: LiteTool | undefined, args: unknown): void;
  onToolEnd(call: ToolCall, result: unknown, failed: boolean): void;
}

/**
 * Run one visitor turn: stream the model, execute the tools it asks for in the
 * page, and continue until it answers in text. `messages` is appended in place
 * so an interrupted run keeps everything that already happened.
 */
export async function runTurn(input: {
  options: LiteOptions;
  complete: Completion;
  system: string;
  messages: ChatMessage[];
  tools: LiteTool[];
  context: ToolContext;
  hooks: TurnHooks;
}): Promise<void> {
  const { options, system, messages, tools, context, hooks } = input;
  const definitions = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: "object", properties: {} },
    },
  }));
  const maxSteps = Math.max(1, Math.min(options.provider === "hosted" ? 6 : 24, Math.floor(options.maxSteps || 6)));
  for (let step = 0; step < maxSteps; step++) {
    context.signal.throwIfAborted();
    const lastStep = step === maxSteps - 1;
    const body = {
      ...(options.model ? { model: options.model } : {}),
      messages: [{ role: "system", content: system }, ...fitMessages(messages, definitions, system)],
      // The final step gets no tools, so the run always ends with an answer.
      ...(definitions.length && !lastStep ? { tools: definitions } : {}),
      stream: true,
    };
    const { text, toolCalls } = await requestCompletion(input.complete, body, context.signal, hooks.onText);
    context.signal.throwIfAborted();
    const calls = toolCalls.filter((call) => call?.function.name).map((call, index) => ({ ...call, id: call.id || `call_${step}_${index}` }));
    messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    hooks.onAssistantDone(text);
    if (!calls.length || lastStep) return;
    for (const call of calls) {
      const tool = tools.find((candidate) => candidate.name === call.function.name);
      context.signal.throwIfAborted();
      let args: unknown = {}, result: unknown, failed = false, started = false;
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        hooks.onToolStart(call, tool, args);
        started = true;
        if (!tool) throw new Error(`Unknown tool ${call.function.name}`);
        result = await tool.run(args, context);
      } catch (error) {
        if (context.signal.aborted) throw error;
        failed = true;
        result = { error: error instanceof Error ? error.message : String(error) };
        if (!started) hooks.onToolStart(call, tool, args);
      }
      context.signal.throwIfAborted();
      hooks.onToolEnd(call, result, failed);
      const content = typeof result === "string" ? result : JSON.stringify(result ?? null);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: content.length > MAX_TOOL_RESULT_CHARS ? `${content.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]` : content,
      });
    }
  }
}
