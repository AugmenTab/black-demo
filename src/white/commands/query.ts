import { ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";

export const queryCommand: CommandDefinition = {
  name: "query",
  summary: "Query semantic information about a Black program (not yet implemented).",
  supportsJson: true,
  async run() {
    return ok("query", {
      status: "not_yet_implemented",
      message:
        "Semantic querying is unavailable because no parser, resolver, or typechecker exists yet in this phase.",
    });
  },
};
