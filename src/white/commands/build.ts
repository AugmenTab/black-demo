import path from "node:path";
import { compile } from "../../compiler/index.js";
import { codes, fail, makeDiagnostic, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { distDir, projectFailure, resolveProject } from "./shared.js";
import { resolveProject as resolveNames } from "../../compiler/resolver/index.js";

export const buildCommand: CommandDefinition = {
  name: "build",
  summary: "Resolve names across the reachable module closure and emit the placeholder JavaScript artifact.",
  supportsJson: true,
  async run(ctx) {
    const outcome = await resolveProject(ctx.cwd);
    if (!outcome.ok) {
      return projectFailure("build", outcome.diagnostics);
    }
    const { loaded } = outcome;
    const outDir = distDir(loaded.projectRoot);
    try {
      // Name resolution is a hard prerequisite for emission (§14).
      const sourceRoot = path.join(loaded.projectRoot, "src");
      const resolveResult = await resolveNames({
        projectRoot: loaded.projectRoot,
        sourceRoot,
        entryPath: loaded.absoluteEntry,
      });
      if (!resolveResult.ok) {
        return fail("build", resolveResult.diagnostics);
      }
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
          modulesResolved: resolveResult.program?.modules.size ?? 0,
          placeholder: true,
          note: "Names resolved across the reachable module closure; JavaScript emission is still a placeholder (real codegen belongs to Phase 5).",
        },
        [...resolveResult.diagnostics, ...result.diagnostics],
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
