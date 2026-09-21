import { compile } from "../../compiler/index.js";
import { codes, makeDiagnostic, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { distDir, projectFailure, resolveProject } from "./shared.js";

export const buildCommand: CommandDefinition = {
  name: "build",
  summary: "Build the current Black project (placeholder compiler in Phase 1).",
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
      if (result.diagnostics.some((d) => d.severity === "error")) {
        return projectFailure("build", result.diagnostics);
      }
      return ok(
        "build",
        {
          projectRoot: loaded.projectRoot,
          outDir,
          artifacts: result.artifacts,
          placeholder: true,
          note: "Placeholder build completed. Source parsing is not yet implemented.",
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
