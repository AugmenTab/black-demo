// Public entry point for Phase 3 name resolution.
//
// See phase-03.md §14 for the resolution pipeline. This module orchestrates:
//
//   discover reachable modules -> parse -> validate identity ->
//   construct graph -> reject cycles -> collect declarations ->
//   validate exports -> resolve imports -> resolve bodies -> Resolved AST
//
// Callers hand it a project source root + entry file. It returns a
// `ResolvedProgram` on success, or a diagnostics list on failure.

import path from "node:path";
import type { Diagnostic } from "../../white/output/diagnostics.js";
import type { ResolvedProgram } from "./types.js";
import { loadReachableModules } from "./loader.js";
import { buildModuleGraph } from "./graph.js";
import { collectAllDeclarations } from "./collect.js";
import { buildInterfaces } from "./interfaces.js";
import { resolveAllModules } from "./resolve.js";
import { buildPrelude, preludeDefinitions } from "./prelude.js";
import { DefIdAllocator } from "./defid.js";

export interface ResolveProjectRequest {
  projectRoot: string;
  sourceRoot: string; // preview-web-1: <projectRoot>/src
  entryPath: string; // absolute path to entry .blk
}

export interface ResolveProjectResult {
  ok: boolean; // true when there are no error diagnostics
  program: ResolvedProgram | null;
  diagnostics: Diagnostic[]; // may include warnings even on success
}

export async function resolveProject(
  request: ResolveProjectRequest,
): Promise<ResolveProjectResult> {
  const diagnostics: Diagnostic[] = [];

  // Step 1: discover reachable modules, parse each, and validate that each
  // file's declared module name matches its path.
  const loadResult = await loadReachableModules({
    projectRoot: path.resolve(request.projectRoot),
    sourceRoot: path.resolve(request.sourceRoot),
    entryPath: path.resolve(request.entryPath),
  });
  diagnostics.push(...loadResult.diagnostics);
  if (loadResult.hardFailure) {
    return { ok: false, program: null, diagnostics };
  }

  // Step 2: build module graph and reject cycles.
  const graphResult = buildModuleGraph(loadResult.modules, loadResult.entryModule);
  diagnostics.push(...graphResult.diagnostics);
  if (graphResult.hardFailure) {
    return { ok: false, program: null, diagnostics };
  }

  // Step 3: allocate DefIds for the prelude and every collected declaration.
  const alloc = new DefIdAllocator();
  const prelude = buildPrelude(alloc);
  const collectResult = collectAllDeclarations(loadResult.modules, alloc);
  diagnostics.push(...collectResult.diagnostics);
  if (collectResult.hardFailure) {
    return { ok: false, program: null, diagnostics };
  }

  // Seed the master definitions table with every Prelude identity so
  // consumers can look up operator/type/constructor DefIds (§21–§23).
  for (const rec of preludeDefinitions(prelude)) {
    collectResult.definitions.set(rec.id.value, rec);
  }

  // Step 4: validate exports and build module interfaces.
  const interfacesResult = buildInterfaces(
    loadResult.modules,
    collectResult.moduleDecls,
    collectResult.definitions,
    alloc,
  );
  diagnostics.push(...interfacesResult.diagnostics);
  if (interfacesResult.hardFailure) {
    return { ok: false, program: null, diagnostics };
  }

  // Step 5: resolve import decls, signatures, and function bodies.
  const resolveResult = resolveAllModules({
    modules: loadResult.modules,
    moduleDecls: collectResult.moduleDecls,
    definitions: collectResult.definitions,
    interfaces: interfacesResult.interfaces,
    prelude,
    alloc,
  });
  diagnostics.push(...resolveResult.diagnostics);
  if (resolveResult.hardFailure) {
    return { ok: false, program: null, diagnostics };
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) {
    return { ok: false, program: null, diagnostics };
  }

  const program: ResolvedProgram = {
    entryModule: loadResult.entryModule,
    modules: resolveResult.resolvedModules,
    interfaces: interfacesResult.interfaces,
    definitions: collectResult.definitions,
    loadOrder: graphResult.loadOrder,
    prelude,
  };

  return { ok: true, program, diagnostics };
}

export * from "./types.js";
