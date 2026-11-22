import type { LiteOptions } from "./types.js";

export const defaults = {
  provider: "local", name: "xgoose lite", theme: "auto", accent: "#7357e8",
  pageTools: ["read_page", "find_on_page", "list_actions", "scroll_to"],
  maxSteps: 6,
} satisfies LiteOptions;
