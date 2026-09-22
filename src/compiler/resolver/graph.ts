// Module dependency graph and cycle detection.
//
// Phase 3 constructs a directed graph ModuleId -> imported ModuleIds and
// rejects cycles (phase-03.md §12–§13). The diagnostic must identify the
// full cycle, not just report that one exists.

import type { Diagnostic, RelatedLocation } from "../../white/output/diagnostics.js";
import { codes, makeDiagnostic } from "../../white/output/diagnostics.js";
import type { LoadedModuleRecord } from "./loader.js";
import type { ModuleId } from "./types.js";
import { moduleIdFromPath } from "./types.js";
import type { ImportDecl } from "../ast.js";

export interface ModuleGraphResult {
  hardFailure: boolean;
  loadOrder: ModuleId[]; // reverse-postorder topological ordering
  diagnostics: Diagnostic[];
}

export function buildModuleGraph(
  modules: Map<ModuleId, LoadedModuleRecord>,
  entryModule: ModuleId,
): ModuleGraphResult {
  const diagnostics: Diagnostic[] = [];

  // Build adjacency: ModuleId -> list of (importedId, importDecl).
  const adjacency = new Map<ModuleId, { target: ModuleId; imp: ImportDecl; sourceFile: string }[]>();
  for (const [id, record] of modules) {
    const edges: { target: ModuleId; imp: ImportDecl; sourceFile: string }[] = [];
    for (const imp of record.parsed.imports) {
      edges.push({
        target: moduleIdFromPath(imp.path),
        imp,
        sourceFile: record.file,
      });
    }
    adjacency.set(id, edges);
  }

  // Cycle detection via DFS. On detection, we walk the parent chain to
  // recover the full cycle path.
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<ModuleId, number>();
  const parent = new Map<ModuleId, ModuleId>();
  const parentEdge = new Map<ModuleId, { imp: ImportDecl; sourceFile: string }>();
  const postorder: ModuleId[] = [];
  const cyclesReported = new Set<string>();

  function visit(id: ModuleId): void {
    color.set(id, GRAY);
    const edges = adjacency.get(id) ?? [];
    for (const edge of edges) {
      const target = edge.target;
      const targetColor = color.get(target) ?? WHITE;
      if (targetColor === WHITE) {
        parent.set(target, id);
        parentEdge.set(target, { imp: edge.imp, sourceFile: edge.sourceFile });
        visit(target);
      } else if (targetColor === GRAY) {
        // Cycle: target is an ancestor of current. Rebuild the cycle by
        // walking parent-chain from id back to target, then closing.
        const cyclePath: ModuleId[] = [target];
        let cur: ModuleId | undefined = id;
        while (cur !== undefined && cur !== target) {
          cyclePath.push(cur);
          cur = parent.get(cur);
        }
        cyclePath.push(target); // close the cycle explicitly
        cyclePath.reverse();
        const key = cycleKey(cyclePath);
        if (!cyclesReported.has(key)) {
          cyclesReported.add(key);
          const related: RelatedLocation[] = [];
          // Add the closing edge (id -> target) as an explicit related loc.
          related.push({
            file: edge.sourceFile,
            span: toSpan(edge.imp.pathSpan),
            message: `${id} imports ${target}`,
          });
          // Add each edge along the path.
          for (let i = 0; i < cyclePath.length - 1; i++) {
            const from = cyclePath[i]!;
            const to = cyclePath[i + 1]!;
            const rec = modules.get(from);
            if (!rec) continue;
            const importDecl = rec.parsed.imports.find(
              (im) => moduleIdFromPath(im.path) === to,
            );
            if (importDecl) {
              related.push({
                file: rec.file,
                span: toSpan(importDecl.pathSpan),
                message: `${from} imports ${to}`,
              });
            }
          }
          diagnostics.push(
            makeDiagnostic({
              code: codes.moduleCycle,
              kind: "resolve",
              severity: "error",
              message: `module import cycle: ${cyclePath.join(" → ")}`,
              file: edge.sourceFile,
              span: toSpan(edge.imp.pathSpan),
              details: { cycle: cyclePath },
              related,
            }),
          );
        }
      }
      // BLACK targets are fine — cross-edge, not a cycle.
    }
    color.set(id, BLACK);
    postorder.push(id);
  }

  // Start DFS from the entry module — Phase 3 only compiles reachable code.
  if (adjacency.has(entryModule)) {
    visit(entryModule);
  }

  // Any reachable modules recorded in `modules` that we haven't visited yet
  // must have been added during loading (they're all reachable by
  // construction). Visit them for a full ordering — but the cycle detector
  // catches issues starting from entry.
  for (const id of adjacency.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      visit(id);
    }
  }

  const hardFailure = diagnostics.length > 0;
  // Postorder is the topological order of *finish* times; reversing it puts
  // dependencies before dependents.
  const loadOrder = postorder.slice();
  return { hardFailure, loadOrder, diagnostics };
}

function cycleKey(cycle: ModuleId[]): string {
  // Normalize cycle representation so A→B→A and B→A→B produce the same key.
  const trimmed = cycle.slice(0, -1); // drop the closing repeat
  // Rotate so lexicographically smallest module is first.
  let minIdx = 0;
  for (let i = 1; i < trimmed.length; i++) {
    if (trimmed[i]! < trimmed[minIdx]!) minIdx = i;
  }
  const rotated = trimmed.slice(minIdx).concat(trimmed.slice(0, minIdx));
  return rotated.join("→");
}

function toSpan(span: { start: { line: number; column: number }; end: { line: number; column: number } }) {
  return {
    start: { line: span.start.line, column: span.start.column },
    end: { line: span.end.line, column: span.end.column },
  };
}
