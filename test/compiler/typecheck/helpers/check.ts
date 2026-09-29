// Test-side driver for the Phase 4 typechecker.
//
// Writes given .blk sources to a scratch project on disk, resolves names,
// then runs the typechecker and returns the diagnostics + typed program.

import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveProject } from "../../../../src/compiler/resolver/index.js";
import { typecheckProgram } from "../../../../src/compiler/typecheck/index.js";
import type { TypedProgram } from "../../../../src/compiler/typecheck/typed-ast.js";
import type { Diagnostic } from "../../../../src/white/output/diagnostics.js";

export interface CheckOptions {
  entry?: string;
}

export interface CheckOutcome {
  ok: boolean;
  program: TypedProgram | null;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  errorCodes: string[];
  cleanup: () => Promise<void>;
}

export async function typecheckModules(
  files: Record<string, string>,
  opts: CheckOptions = {},
): Promise<CheckOutcome> {
  const root = await mkdtemp(path.join(os.tmpdir(), "black-tc-"));
  const sourceRoot = path.join(root, "src");
  await mkdir(sourceRoot, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(sourceRoot, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  const entryRel = opts.entry ?? "Main.blk";
  const entryPath = path.join(sourceRoot, entryRel);

  const resolved = await resolveProject({ projectRoot: root, sourceRoot, entryPath });
  if (!resolved.ok || !resolved.program) {
    const errors = resolved.diagnostics.filter((d) => d.severity === "error");
    return {
      ok: false,
      program: null,
      diagnostics: resolved.diagnostics,
      errors,
      errorCodes: errors.map((d) => d.code),
      cleanup: async () => {
        await rm(root, { recursive: true, force: true });
      },
    };
  }
  const tc = typecheckProgram(resolved.program);
  const all = [...resolved.diagnostics, ...tc.diagnostics];
  const errors = all.filter((d) => d.severity === "error");
  return {
    ok: tc.ok,
    program: tc.program,
    diagnostics: all,
    errors,
    errorCodes: errors.map((d) => d.code),
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function withHeader(body: string): string {
  return `module Main (main)\n\n${body}\n`;
}
