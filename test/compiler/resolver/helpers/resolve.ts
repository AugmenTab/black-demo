// Test-side driver for the Phase 3 resolver.
//
// Sets up a scratch project on disk, writes the given module sources to
// files under `src/`, then invokes resolveProject and returns the outcome
// plus the diagnostics. Callers pass entries as `{ "Main.blk": "…", "Game/Model.blk": "…" }`
// keyed by path relative to the source root.

import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  resolveProject,
  type ResolveProjectResult,
} from "../../../../src/compiler/resolver/index.js";
import type { Diagnostic } from "../../../../src/white/output/diagnostics.js";

export interface ResolveOptions {
  entry?: string; // path relative to src, defaults to Main.blk
}

export interface ResolveOutcome {
  result: ResolveProjectResult;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  cleanup: () => Promise<void>;
  root: string;
  sourceRoot: string;
}

export async function resolveModules(
  files: Record<string, string>,
  opts: ResolveOptions = {},
): Promise<ResolveOutcome> {
  const root = await mkdtemp(path.join(os.tmpdir(), "black-resolver-"));
  const sourceRoot = path.join(root, "src");
  await mkdir(sourceRoot, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(sourceRoot, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  const entryRel = opts.entry ?? "Main.blk";
  const entryPath = path.join(sourceRoot, entryRel);

  const result = await resolveProject({
    projectRoot: root,
    sourceRoot,
    entryPath,
  });
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");
  return {
    result,
    diagnostics: result.diagnostics,
    errors,
    warnings,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
    root,
    sourceRoot,
  };
}

export function firstError(o: ResolveOutcome): Diagnostic | undefined {
  return o.errors[0];
}

export function errorCodes(o: ResolveOutcome): string[] {
  return o.errors.map((d) => d.code);
}
