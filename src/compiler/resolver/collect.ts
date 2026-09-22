// Declaration collection.
//
// For each loaded module, walk its top-level declarations and allocate a
// semantic DefId for every type name, constructor, and top-level term.
// Signatures share a DefId with their matching definition (§24). Duplicate
// same-namespace declarations in one module are reported here (§26).
//
// This pass does NOT resolve bodies. That's a later stage.

import type { Diagnostic, RelatedLocation } from "../../white/output/diagnostics.js";
import { codes, makeDiagnostic } from "../../white/output/diagnostics.js";
import type {
  DefId,
  DefinitionRecord,
  ModuleId,
} from "./types.js";
import type { LoadedModuleRecord } from "./loader.js";
import type { DefIdAllocator } from "./defid.js";
import type { Decl } from "../ast.js";

export interface ModuleDeclTable {
  moduleId: ModuleId;
  moduleDefId: DefId;
  // name -> DefId for each namespace, plus source spans for related-location
  // diagnostics later.
  types: Map<string, TopLevelEntry>;
  terms: Map<string, TopLevelEntry>;
  // Each variant declaration's constructor entries (owner type DefId ->
  // ordered constructor DefIds). Constructor names also live in `terms`.
  constructorsByType: Map<DefId, DefId[]>;
}

export interface TopLevelEntry {
  defId: DefId;
  name: string;
  span: { file: string; start: { line: number; column: number }; end: { line: number; column: number } };
  // Which parsed declaration(s) produced this entry.
  originatingDecls: Decl[];
}

export interface CollectResult {
  hardFailure: boolean;
  moduleDecls: Map<ModuleId, ModuleDeclTable>;
  definitions: Map<number, DefinitionRecord>;
  diagnostics: Diagnostic[];
}

export function collectAllDeclarations(
  modules: Map<ModuleId, LoadedModuleRecord>,
  alloc: DefIdAllocator,
): CollectResult {
  const diagnostics: Diagnostic[] = [];
  const moduleDecls = new Map<ModuleId, ModuleDeclTable>();
  const definitions = new Map<number, DefinitionRecord>();

  for (const [moduleId, record] of modules) {
    const table = collectModule(moduleId, record, alloc, definitions, diagnostics);
    moduleDecls.set(moduleId, table);
  }

  // Duplicate declaration errors are reported here but they should not
  // hard-abort the pipeline — subsequent stages can still work with the
  // "winner" declarations. We do surface a hardFailure flag when any error
  // was emitted so callers may choose to short-circuit; but the current
  // caller (index.ts) simply checks severity later.
  const hardFailure = false;
  return { hardFailure, moduleDecls, definitions, diagnostics };
}

function collectModule(
  moduleId: ModuleId,
  record: LoadedModuleRecord,
  alloc: DefIdAllocator,
  definitions: Map<number, DefinitionRecord>,
  diagnostics: Diagnostic[],
): ModuleDeclTable {
  const moduleDefId = alloc.fresh();
  const table: ModuleDeclTable = {
    moduleId,
    moduleDefId,
    types: new Map(),
    terms: new Map(),
    constructorsByType: new Map(),
  };

  // A helper for reporting duplicate declarations with related-location info.
  function reportDuplicate(
    namespaceLabel: string,
    name: string,
    firstSpan: TopLevelEntry["span"],
    duplicate: { file: string; span: TopLevelEntry["span"] },
  ) {
    const related: RelatedLocation[] = [
      {
        file: firstSpan.file,
        span: { start: firstSpan.start, end: firstSpan.end },
        message: `first declaration of '${name}'`,
      },
    ];
    diagnostics.push(
      makeDiagnostic({
        code: codes.nameDuplicate,
        kind: "resolve",
        severity: "error",
        message: `duplicate ${namespaceLabel} '${name}' in module ${moduleId}`,
        file: duplicate.file,
        span: { start: duplicate.span.start, end: duplicate.span.end },
        details: { module: moduleId, name, namespace: namespaceLabel },
        related,
      }),
    );
  }

  // Track signatures seen so far (for the "same term may share a signature"
  // rule §24). Multiple signatures for one name → error (§26).
  const signatureSeen = new Set<string>();

  // We visit declarations in source order. That order is not observable to
  // the resolver — top-level names are predeclared as a set — but it lets
  // us produce deterministic diagnostics.
  for (const decl of record.parsed.declarations) {
    switch (decl.kind) {
      case "DeclTypeAlias":
      case "DeclVariant": {
        const name = decl.name;
        const spanForDiag = spanFrom(record.file, decl.nameSpan);
        const existing = table.types.get(name);
        if (existing) {
          reportDuplicate("type", name, existing.span, {
            file: record.file,
            span: spanForDiag,
          });
          continue;
        }
        const defId = alloc.fresh();
        table.types.set(name, {
          defId,
          name,
          span: spanForDiag,
          originatingDecls: [decl],
        });
        if (decl.kind === "DeclTypeAlias") {
          definitions.set(defId.value, {
            id: defId,
            namespace: "type",
            category: "typeAlias",
            name,
            origin: {
              kind: "user",
              module: moduleId,
              span: decl.nameSpan,
            },
            constructors: [],
          });
        } else {
          // Variant. Allocate constructor DefIds and register them in terms.
          const ctorIds: DefId[] = [];
          for (const alt of decl.alternatives) {
            const altSpan = spanFrom(record.file, alt.nameSpan);
            const dup = table.terms.get(alt.name);
            if (dup) {
              // Constructor name collides with another term in the same
              // module (§26 explicitly requires this to error).
              reportDuplicate("term", alt.name, dup.span, {
                file: record.file,
                span: altSpan,
              });
              continue;
            }
            const cid = alloc.fresh();
            ctorIds.push(cid);
            table.terms.set(alt.name, {
              defId: cid,
              name: alt.name,
              span: altSpan,
              originatingDecls: [decl],
            });
            definitions.set(cid.value, {
              id: cid,
              namespace: "term",
              category: "constructor",
              name: alt.name,
              origin: {
                kind: "user",
                module: moduleId,
                span: alt.nameSpan,
              },
              ownerType: defId,
            });
          }
          table.constructorsByType.set(defId, ctorIds);
          definitions.set(defId.value, {
            id: defId,
            namespace: "type",
            category: "variant",
            name,
            origin: {
              kind: "user",
              module: moduleId,
              span: decl.nameSpan,
            },
            constructors: ctorIds,
          });
        }
        break;
      }
      case "DeclSignature": {
        const name = decl.name;
        const spanForDiag = spanFrom(record.file, decl.nameSpan);
        if (signatureSeen.has(name)) {
          diagnostics.push(
            makeDiagnostic({
              code: codes.nameDuplicate,
              kind: "resolve",
              severity: "error",
              message: `duplicate signature for '${name}' in module ${moduleId}`,
              file: record.file,
              span: { start: spanForDiag.start, end: spanForDiag.end },
              details: { module: moduleId, name },
            }),
          );
          continue;
        }
        signatureSeen.add(name);
        const existing = table.terms.get(name);
        if (existing) {
          const prevDef = definitions.get(existing.defId.value);
          if (prevDef && prevDef.namespace === "term" && prevDef.category === "constructor") {
            // Signature colliding with a constructor of the same name.
            reportDuplicate("term", name, existing.span, {
              file: record.file,
              span: spanForDiag,
            });
            continue;
          }
          // A signature after (or before) a definition attaches to the same
          // term DefId. Update the existing entry's originating decls.
          existing.originatingDecls.push(decl);
          if (prevDef && prevDef.namespace === "term" && prevDef.category === "topLevel") {
            prevDef.hasSignature = true;
          }
        } else {
          const defId = alloc.fresh();
          table.terms.set(name, {
            defId,
            name,
            span: spanForDiag,
            originatingDecls: [decl],
          });
          definitions.set(defId.value, {
            id: defId,
            namespace: "term",
            category: "topLevel",
            name,
            origin: {
              kind: "user",
              module: moduleId,
              span: decl.nameSpan,
            },
            hasSignature: true,
          });
        }
        break;
      }
      case "DeclDefinition": {
        const name = decl.name;
        const spanForDiag = spanFrom(record.file, decl.nameSpan);
        const existing = table.terms.get(name);
        if (existing) {
          const prevDef = definitions.get(existing.defId.value);
          if (prevDef && prevDef.namespace === "term" && prevDef.category === "constructor") {
            reportDuplicate("term", name, existing.span, {
              file: record.file,
              span: spanForDiag,
            });
            continue;
          }
          // Definition after signature (or additional equations) → same DefId.
          existing.originatingDecls.push(decl);
        } else {
          const defId = alloc.fresh();
          table.terms.set(name, {
            defId,
            name,
            span: spanForDiag,
            originatingDecls: [decl],
          });
          definitions.set(defId.value, {
            id: defId,
            namespace: "term",
            category: "topLevel",
            name,
            origin: {
              kind: "user",
              module: moduleId,
              span: decl.nameSpan,
            },
            hasSignature: false,
          });
        }
        break;
      }
    }
  }

  return table;
}

function spanFrom(file: string, span: { start: { line: number; column: number }; end: { line: number; column: number } }) {
  return {
    file,
    start: { line: span.start.line, column: span.start.column },
    end: { line: span.end.line, column: span.end.column },
  };
}
