import { ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { projectFailure, resolveProject } from "./shared.js";

export const checkCommand: CommandDefinition = {
  name: "check",
  summary: "Validate the current Black project's infrastructure.",
  supportsJson: true,
  async run(ctx) {
    const outcome = await resolveProject(ctx.cwd);
    if (!outcome.ok) {
      return projectFailure("check", outcome.diagnostics);
    }
    const { loaded } = outcome;
    return ok("check", {
      projectRoot: loaded.projectRoot,
      configPath: loaded.configPath,
      entry: loaded.absoluteEntry,
      profile: loaded.config.project.profile,
      target: loaded.config.target.kind,
      infrastructureValid: true,
      sourceCheckingImplemented: false,
      note: "Black source checking is not implemented in this phase.",
    });
  },
};
