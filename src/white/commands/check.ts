import { parseSource } from "../../compiler/index.js";
import { fail, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { projectFailure, resolveProject } from "./shared.js";

export const checkCommand: CommandDefinition = {
  name: "check",
  summary: "Validate the current Black project's configuration and syntax.",
  supportsJson: true,
  async run(ctx) {
    const outcome = await resolveProject(ctx.cwd);
    if (!outcome.ok) {
      return projectFailure("check", outcome.diagnostics);
    }
    const { loaded } = outcome;

    const parseResult = await parseSource({ entryPath: loaded.absoluteEntry });
    if (!parseResult.ok) {
      return fail("check", parseResult.diagnostics);
    }

    return ok("check", {
      projectRoot: loaded.projectRoot,
      configPath: loaded.configPath,
      entry: loaded.absoluteEntry,
      profile: loaded.config.project.profile,
      target: loaded.config.target.kind,
      infrastructureValid: true,
      syntaxValid: true,
      semanticCheckingImplemented: false,
      note: "Black syntax valid. Semantic checking is not yet implemented in this phase.",
    });
  },
};
