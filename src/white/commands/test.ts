import { ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";

export const testCommand: CommandDefinition = {
  name: "test",
  summary: "Run project tests (Black-level tests not yet implemented).",
  supportsJson: true,
  async run() {
    return ok("test", {
      status: "not_yet_implemented",
      ran: 0,
      message:
        "Black project tests are not implemented in this phase. Repository TypeScript tests are separate and live under `test/`.",
    });
  },
};
