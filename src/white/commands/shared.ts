import path from "node:path";
import type { CommandResult, Diagnostic } from "../output/diagnostics.js";
import { codes, fail, makeDiagnostic } from "../output/diagnostics.js";
import { discoverProject } from "../project/discover.js";
import { loadProjectConfig, type LoadedConfig } from "../project/config.js";

export interface CommandContext {
  cwd: string;
  json: boolean;
  positional: string[];
}

export interface CommandDefinition {
  name: string;
  summary: string;
  run: (ctx: CommandContext) => Promise<CommandResult>;
  supportsJson: boolean;
}

export type LoadOutcome =
  | { ok: true; loaded: LoadedConfig }
  | { ok: false; diagnostics: Diagnostic[] };

export async function resolveProject(cwd: string): Promise<LoadOutcome> {
  const discovery = discoverProject(cwd);
  if (!discovery.found || !discovery.configPath || !discovery.projectRoot) {
    return {
      ok: false,
      diagnostics: [
        makeDiagnostic({
          code: codes.projectNotFound,
          kind: "project",
          message: `no white.toml found searching upward from ${cwd}`,
          details: { cwd },
        }),
      ],
    };
  }
  const load = await loadProjectConfig(discovery.configPath, discovery.projectRoot);
  if (!load.ok) {
    return { ok: false, diagnostics: load.diagnostics };
  }
  return { ok: true, loaded: load.loaded };
}

export function distDir(projectRoot: string): string {
  return path.join(projectRoot, "dist");
}

export function projectFailure(command: string, diagnostics: Diagnostic[]): CommandResult {
  return fail(command, diagnostics);
}
