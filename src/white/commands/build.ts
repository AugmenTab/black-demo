import { compile } from "../../compiler/index.js";
import { codes, fail, makeDiagnostic, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { distDir, projectFailure, resolveProject } from "./shared.js";

export const buildCommand: CommandDefinition = {
  name: "build",
  summary: "Parse the entry module and emit the placeholder JavaScript artifact.",
  supportsJson: true,
  async run(ctx) {
    const outcome = await resolveProject(ctx.cwd);
    if (!outcome.ok) {
      return projectFailure("build", outcome.diagnostics);
    }
    const { loaded } = outcome;
    const outDir = distDir(loaded.projectRoot);
    try {
      const result = await compile({
        projectRoot: loaded.projectRoot,
        entryPath: loaded.absoluteEntry,
        outDir,
      });
      if (!result.ok) {
        return fail("build", result.diagnostics);
      }
      return ok(
        "build",
        {
          projectRoot: loaded.projectRoot,
          outDir,
          artifacts: result.artifacts,
          placeholder: true,
          note: "Source parsed successfully; JavaScript emission is still a placeholder (real codegen belongs to Phase 5).",
        },
        result.diagnostics,
      );
    } catch (err) {
      return projectFailure("build", [
        makeDiagnostic({
          code: codes.buildFailed,
          kind: "build",
          message: `build failed: ${(err as Error).message}`,
        }),
      ]);
    }
  },
};
