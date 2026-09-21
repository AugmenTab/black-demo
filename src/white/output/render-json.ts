import type { CommandResult } from "./diagnostics.js";

export function renderJson(result: CommandResult): string {
  return JSON.stringify(result, null, 2);
}
