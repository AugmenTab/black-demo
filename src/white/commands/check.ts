import path from "node:path";
import { fail, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { projectFailure, resolveProject } from "./shared.js";
import { resolveProject as resolveNames } from "../../compiler/resolver/index.js";
import { typecheckProgram } from "../../compiler/typecheck/index.js";

export const checkCommand: CommandDefinition = {
  name: "check",
  summary: "Validate the current Black project's configuration, syntax, name resolution, and types.",
  supportsJson: true,
  async run(ctx) {
    const outcome = await resolveProject(ctx.cwd);
    if (!outcome.ok) {
      return projectFailure("check", outcome.diagnostics);
    }
    const { loaded } = outcome;

    const sourceRoot = path.join(loaded.projectRoot, "src");
    const resolveResult = await resolveNames({
      projectRoot: loaded.projectRoot,
      sourceRoot,
      entryPath: loaded.absoluteEntry,
    });
    if (!resolveResult.ok || !resolveResult.program) {
      return fail("check", resolveResult.diagnostics);
    }

    const typecheck = typecheckProgram(resolveResult.program);
    const allDiagnostics = [...resolveResult.diagnostics, ...typecheck.diagnostics];
    if (!typecheck.ok) {
      return fail("check", allDiagnostics);
    }

    return ok(
      "check",
      {
        projectRoot: loaded.projectRoot,
        configPath: loaded.configPath,
        entry: loaded.absoluteEntry,
        profile: loaded.config.project.profile,
        target: loaded.config.target.kind,
        infrastructureValid: true,
        syntaxValid: true,
        namesResolved: true,
        typesChecked: true,
        modulesLoaded: resolveResult.program.modules.size,
        note: "Black syntax valid; name resolution and typechecking succeeded across the reachable module closure.",
      },
      allDiagnostics,
    );
  },
};
