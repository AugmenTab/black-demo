import path from "node:path";
import { fail, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { projectFailure, resolveProject } from "./shared.js";
import { resolveProject as resolveNames } from "../../compiler/resolver/index.js";

export const checkCommand: CommandDefinition = {
  name: "check",
  summary: "Validate the current Black project's configuration, syntax, and name resolution.",
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
    if (!resolveResult.ok) {
      return fail("check", resolveResult.diagnostics);
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
        modulesLoaded: resolveResult.program?.modules.size ?? 0,
        note: "Black syntax valid and name resolution succeeded across the reachable module closure.",
      },
      resolveResult.diagnostics,
    );
  },
};
