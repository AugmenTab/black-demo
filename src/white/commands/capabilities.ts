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
      implementation_stage: "phase-3-name-resolution",
      backend: "javascript-es-modules",
      targets: {
        node: "available",
        browser: "not-yet-implemented",
      },
      compiler: {
        source_parsing: true,
        name_resolution: true,
        typechecking: false,
        source_codegen: false,
        placeholder_build: true,
      },
      notes: [
        "Phase 2 lexes and parses Black source; unparseable programs are rejected before build.",
        "Phase 3 resolves the reachable module closure: module identities, exports, imports (selected + qualified), lexical scopes, and Prelude are all live.",
        "Typechecking and real code generation are still unimplemented.",
        "The placeholder build still emits a fixed marker; genuine Black-to-JavaScript emission belongs to Phase 5.",
      ],
    });
  },
};
