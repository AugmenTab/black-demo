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
      implementation_stage: "phase-4-typechecking",
      backend: "javascript-es-modules",
      targets: {
        node: "available",
        browser: "not-yet-implemented",
      },
      compiler: {
        source_parsing: true,
        name_resolution: true,
        typechecking: true,
        source_codegen: false,
        placeholder_build: true,
      },
      notes: [
        "Black source is lexed and parsed; unparseable programs are rejected before build.",
        "Name resolution runs across the reachable module closure: module identities, exports, imports (selected + qualified), lexical scopes, and Prelude are all live.",
        "Typechecking is live: explicit top-level signatures are required and checked; rank-1 polymorphism, closed records/variants, exhaustiveness, and Prelude operator overloading are enforced.",
        "Real code generation is still unimplemented.",
        "The placeholder build still emits a fixed marker; genuine Black-to-JavaScript emission belongs to Phase 5.",
      ],
    });
  },
};
