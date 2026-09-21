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
      implementation_stage: "phase-2-source-parsing",
      backend: "javascript-es-modules",
      targets: {
        node: "available",
        browser: "not-yet-implemented",
      },
      compiler: {
        source_parsing: true,
        name_resolution: false,
        typechecking: false,
        source_codegen: false,
        placeholder_build: true,
      },
      notes: [
        "Phase 2 lexes and parses Black source; unparseable programs are rejected before build.",
        "Name resolution, typechecking, and real code generation are still unimplemented.",
        "The placeholder build still emits a fixed marker; genuine Black-to-JavaScript emission belongs to Phase 5.",
      ],
    });
  },
};
