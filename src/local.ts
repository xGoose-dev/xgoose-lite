import type { Strings } from "./strings.js";
import type { LiteTool, ToolContext } from "./types.js";

/** Offline mode uses the same selected page tools as an AI turn. */
export async function localAnswer(question: string, tools: LiteTool[], context: ToolContext, strings: Strings): Promise<string> {
  const outline = question === strings.overview;
  const tool = tools.find(item => item.name === (outline ? "read_page" : "find_on_page"));
  if (!tool) return strings.disabled;
  if (outline) {
    const page = await tool.run({}, context) as { title: string; headings: {text: string}[]; text: string };
    return [page.title, ...page.headings.map(heading => "- " + heading.text), page.text.slice(0, 380)].join("\n");
  }
  const result = await tool.run({ query: question }, context) as {matches: {snippet: string}[]};
  return result.matches.map(match => "- " + match.snippet).join("\n") || strings.noMatch;
}
