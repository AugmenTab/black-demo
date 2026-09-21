import { ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";

export const docsCommand: CommandDefinition = {
  name: "docs",
  summary: "Query Black documentation (not yet implemented).",
  supportsJson: true,
  async run() {
    return ok("docs", {
      status: "not_yet_implemented",
      message:
        "Documentation query infrastructure is not implemented yet. See `white capabilities` for current compiler status.",
    });
  },
};
