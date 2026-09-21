import { ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";

export const capabilitiesCommand: CommandDefinition = {
  name: "capabilities",
  summary: "Report profile identity and current compiler implementation status.",
  supportsJson: true,
  async run() {
    return ok("capabilities", {
      language: "Black",
      profile: "preview-web-1",
      implementation_stage: "phase-1-walking-skeleton",
      backend: "javascript-es-modules",
      targets: {
        node: "available",
        browser: "not-yet-implemented",
      },
      compiler: {
        source_parsing: false,
        name_resolution: false,
        typechecking: false,
        source_codegen: false,
        placeholder_build: true,
      },
      notes: [
        "Phase 1 exercises the toolchain without implementing Black semantics.",
        "The placeholder build emits a fixed marker regardless of .blk contents.",
      ],
    });
  },
};
