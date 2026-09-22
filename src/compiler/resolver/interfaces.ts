// Export validation + module interface construction.
//
// After declarations are collected, walk each module's export list, verify
// every export names an owned declaration (§27), enforce Type(..) semantics
// (§28–§30), and build the ResolvedModuleInterface the import resolver will
// consume.

import type { Diagnostic } from "../../white/output/diagnostics.js";
import { codes, makeDiagnostic } from "../../white/output/diagnostics.js";
import type {
  DefId,
  ModuleId,
  ResolvedModuleInterface,
  DefinitionRecord,
} from "./types.js";
import type { LoadedModuleRecord } from "./loader.js";
import type { ModuleDeclTable } from "./collect.js";
import type { DefIdAllocator } from "./defid.js";

export interface BuildInterfacesResult {
  hardFailure: boolean;
  interfaces: Map<ModuleId, ResolvedModuleInterface>;
  diagnostics: Diagnostic[];
}

export function buildInterfaces(
  modules: Map<ModuleId, LoadedModuleRecord>,
  moduleDecls: Map<ModuleId, ModuleDeclTable>,
  definitions: Map<number, DefinitionRecord>,
  _alloc: DefIdAllocator,
): BuildInterfacesResult {
  void _alloc;
  const diagnostics: Diagnostic[] = [];
  const interfaces = new Map<ModuleId, ResolvedModuleInterface>();

  for (const [moduleId, record] of modules) {
    const table = moduleDecls.get(moduleId);
    if (!table) continue;

    const exportedTypes = new Map<string, DefId>();
    const exportedTerms = new Map<string, DefId>();
    const exportedConstructorsByType = new Map<DefId, DefId[]>();

    for (const exp of record.parsed.exports) {
      switch (exp.kind) {
        case "term": {
          const entry = table.terms.get(exp.name);
          if (!entry) {
            diagnostics.push(
              makeDiagnostic({
                code: codes.exportUnknown,
                kind: "resolve",
                severity: "error",
                message: `module ${moduleId} exports unknown term '${exp.name}'`,
                file: record.file,
                span: toSpan(exp.nameSpan),
                details: { module: moduleId, name: exp.name, namespace: "term" },
              }),
            );
            continue;
          }
          exportedTerms.set(exp.name, entry.defId);
          break;
        }
        case "type": {
          const entry = table.types.get(exp.name);
          if (!entry) {
            diagnostics.push(
              makeDiagnostic({
                code: codes.exportUnknown,
                kind: "resolve",
                severity: "error",
                message: `module ${moduleId} exports unknown type '${exp.name}'`,
                file: record.file,
                span: toSpan(exp.nameSpan),
                details: { module: moduleId, name: exp.name, namespace: "type" },
              }),
            );
            continue;
          }
          exportedTypes.set(exp.name, entry.defId);
          break;
        }
        case "typeAll": {
          const entry = table.types.get(exp.name);
          if (!entry) {
            diagnostics.push(
              makeDiagnostic({
                code: codes.exportUnknown,
                kind: "resolve",
                severity: "error",
                message: `module ${moduleId} exports unknown type '${exp.name}'`,
                file: record.file,
                span: toSpan(exp.nameSpan),
                details: { module: moduleId, name: exp.name, namespace: "type" },
              }),
            );
            continue;
          }
          const def = definitions.get(entry.defId.value);
          if (!def || def.namespace !== "type" || def.category !== "variant") {
            // Alias-type Type(..) is invalid — you can't fabricate
            // constructors for a transparent alias (§30).
            diagnostics.push(
              makeDiagnostic({
                code: codes.exportInvalidConstructors,
                kind: "resolve",
                severity: "error",
                message: `type '${exp.name}' in module ${moduleId} has no constructors to export via '(..)'`,
                file: record.file,
                span: toSpan(exp.nameSpan),
                details: { module: moduleId, name: exp.name },
              }),
            );
            continue;
          }
          exportedTypes.set(exp.name, entry.defId);
          const ctorIds = table.constructorsByType.get(entry.defId) ?? [];
          exportedConstructorsByType.set(entry.defId, ctorIds);
          // Also register each constructor in exportedTerms so selected
          // imports of a `Type (..)` name expose the constructors.
          for (const cid of ctorIds) {
            const cdef = definitions.get(cid.value);
            if (cdef && cdef.namespace === "term" && cdef.category === "constructor") {
              exportedTerms.set(cdef.name, cid);
            }
          }
          break;
        }
      }
    }

    interfaces.set(moduleId, {
      moduleId,
      moduleDefId: table.moduleDefId,
      exportedTypes,
      exportedTerms,
      exportedConstructorsByType,
    });
  }

  return { hardFailure: false, interfaces, diagnostics };
}

function toSpan(span: { start: { line: number; column: number }; end: { line: number; column: number } }) {
  return {
    start: { line: span.start.line, column: span.start.column },
    end: { line: span.end.line, column: span.end.column },
  };
}
