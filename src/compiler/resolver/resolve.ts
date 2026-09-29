// Body resolver: turns each parsed module into a ResolvedModule with
// semantic identities on every supported reference.
//
// Scope discipline (phase-03.md §44–§50):
//   * module top-level names are predeclared before bodies are resolved so
//     forward references and top-level recursion resolve to the shared
//     identity.
//   * function parameters, lambda parameters, let bindings, and case-branch
//     patterns each open a fresh lexical scope.
//   * legal shadowing emits BLACK_NAME_SHADOWING but does not fail (§41).
//   * duplicate binders in one scope emit BLACK_NAME_DUPLICATE_BINDING (§50).
//   * wildcards allocate no identity (§47).
//   * structural field labels are NOT resolved (§36–§38).
//
// Local `let` bindings are sequential and non-recursive (phase-03_5.md §3):
// each binding's RHS sees the enclosing scope plus every earlier binding in
// the same block, but not itself and not later siblings. The `in` body sees
// all bindings.

import type { Diagnostic, RelatedLocation } from "../../white/output/diagnostics.js";
import { codes, makeDiagnostic } from "../../white/output/diagnostics.js";
import type {
  DefId,
  DefinitionRecord,
  LocalBinder,
  MaybeResolvedRef,
  ModuleId,
  PreludeInterface,
  ResolvedCaseBranch,
  ResolvedDecl,
  ResolvedDeclDefinition,
  ResolvedDeclSignature,
  ResolvedDeclTypeAlias,
  ResolvedDeclVariant,
  ResolvedExpr,
  ResolvedGuardedRhs,
  ResolvedImport,
  ResolvedLetBinding,
  ResolvedModule,
  ResolvedModuleInterface,
  ResolvedPattern,
  ResolvedPatternRecordField,
  ResolvedRecordFieldValue,
  ResolvedSelectedImport,
  ResolvedType,
  ResolvedTypeRecordField,
  ResolvedVariantAlt,
  ResolvedVariantPayload,
  Namespace,
} from "./types.js";
import { moduleIdFromPath } from "./types.js";
import type { LoadedModuleRecord } from "./loader.js";
import type { ModuleDeclTable } from "./collect.js";
import type { DefIdAllocator } from "./defid.js";
import type {
  CaseBranch,
  Decl,
  Expr,
  ExprField,
  ImportDecl,
  LetBinding,
  Pattern,
  RecordFieldValue,
  SelectedImport,
  TypeNode,
  TypeRecordField,
  VariantAlt,
} from "../ast.js";
import type { Span } from "../source.js";
import { makeSpan } from "../source.js";

export interface ResolveAllRequest {
  modules: Map<ModuleId, LoadedModuleRecord>;
  moduleDecls: Map<ModuleId, ModuleDeclTable>;
  definitions: Map<number, DefinitionRecord>;
  interfaces: Map<ModuleId, ResolvedModuleInterface>;
  prelude: PreludeInterface;
  alloc: DefIdAllocator;
}

export interface ResolveAllResult {
  hardFailure: boolean;
  resolvedModules: Map<ModuleId, ResolvedModule>;
  diagnostics: Diagnostic[];
}

export function resolveAllModules(req: ResolveAllRequest): ResolveAllResult {
  const diagnostics: Diagnostic[] = [];
  const resolvedModules = new Map<ModuleId, ResolvedModule>();

  for (const [moduleId, record] of req.modules) {
    const table = req.moduleDecls.get(moduleId);
    const iface = req.interfaces.get(moduleId);
    if (!table || !iface) continue;

    const resolver = new ModuleResolver(
      moduleId,
      record,
      table,
      iface,
      req.moduleDecls,
      req.definitions,
      req.interfaces,
      req.prelude,
      req.alloc,
    );
    const resolved = resolver.run();
    diagnostics.push(...resolver.diagnostics);
    resolvedModules.set(moduleId, resolved);
  }

  return { hardFailure: false, resolvedModules, diagnostics };
}

// ---------- Per-module scopes ----------

// A term binding introduced by imports/prelude/module-scope has an origin
// note used for ambiguity diagnostics.
interface ImportedBinding {
  defId: DefId;
  origin: "prelude" | "selected-import" | "module-local";
  // For selected imports: which module the name came from (for ambiguity
  // diagnostics). Prelude and module-local have their own labels.
  fromModule?: ModuleId;
  // Source spans used in ambiguity related-locations.
  span?: Span;
  file?: string;
}

interface CanonicalSelectedScope {
  moduleId: ModuleId;
  // DefIds explicitly requested through selected imports. Terms include
  // constructors made visible via `Type (..)`. Types include the type name
  // requested (plain or with `(..)`). Populated only from selected imports —
  // never from `import M as X` (phase-03_3.md §§2, 7, 22).
  types: Map<string, DefId>;
  terms: Map<string, DefId>;
  // First import span/file that registered this canonical scope, retained
  // for future diagnostic use.
  span: Span;
  file: string;
}

interface ModuleScopes {
  // Term-namespace bindings visible at module top-level (imports + module's
  // own declarations + prelude). Multiple candidates per name → ambiguity
  // at the use site.
  terms: Map<string, ImportedBinding[]>;
  types: Map<string, ImportedBinding[]>;
  // Module aliases from `import M as X` — the alias lets any exported
  // declaration in M be reached via `X.<name>` (phase-03_3.md §§3, 23).
  moduleAliases: Map<string, { moduleId: ModuleId; defId: DefId; span: Span; file: string }>;
  // Canonical dotted paths that were registered by SELECTED imports. Only
  // declarations that the selected import(s) named are visible here. An
  // aliased-only import does NOT register a canonical scope (phase-03_3.md
  // §§2-4, 20, 22).
  canonicalQualifiedScopes: Map<string, CanonicalSelectedScope>;
}

// A single potential source for a qualifier spelling.
//
// Aliases and canonical selected scopes are both merely visibility sources —
// they do not select one another via precedence. Instead, all candidates for
// a given spelling are collected, collapsed by semantic module identity, and
// either resolved (one identity — union the visibility surfaces) or rejected
// as ambiguous (multiple identities — phase-03_4.md §§3, 7-11).
type QualifierCandidate =
  | { kind: "alias"; moduleId: ModuleId; iface: ResolvedModuleInterface; span: Span; file: string }
  | { kind: "canonical"; moduleId: ModuleId; scope: CanonicalSelectedScope };

// A qualifier resolves to a single semantic module identity, but may keep
// multiple candidate sources so that the visibility surface at member lookup
// is the union of all legally available surfaces for that spelling
// (phase-03_4.md §§8, 9, 15).
interface QualifierResolution {
  moduleId: ModuleId;
  candidates: QualifierCandidate[];
}

// Three-state qualifier decision (phase-03_5.md §4). Expression-side
// structural fallback for `Foo.x` is legal ONLY when the qualifier is
// `no-qualifier` — a spelling that names no module at all. An `ambiguous`
// spelling was recognised as module syntax and must stop after the ambiguity
// diagnostic; a subsequent structural reinterpretation would fabricate a
// spurious BLACK_NAME_UNKNOWN for the head.
type QualifierDecision =
  | { kind: "resolved"; qual: QualifierResolution }
  | { kind: "no-qualifier" }
  | { kind: "ambiguous" };

class ModuleResolver {
  diagnostics: Diagnostic[] = [];
  private scopes: ModuleScopes = {
    terms: new Map(),
    types: new Map(),
    moduleAliases: new Map(),
    canonicalQualifiedScopes: new Map(),
  };
  private resolvedImports: ResolvedImport[] = [];

  constructor(
    private readonly moduleId: ModuleId,
    private readonly record: LoadedModuleRecord,
    private readonly table: ModuleDeclTable,
    private readonly iface: ResolvedModuleInterface,
    private readonly allModuleDecls: Map<ModuleId, ModuleDeclTable>,
    private readonly definitions: Map<number, DefinitionRecord>,
    private readonly allInterfaces: Map<ModuleId, ResolvedModuleInterface>,
    private readonly prelude: PreludeInterface,
    private readonly alloc: DefIdAllocator,
  ) {}

  run(): ResolvedModule {
    this.installPreludeIntoScope();
    this.installImports();
    this.installOwnDeclarations();

    const resolvedDecls: ResolvedDecl[] = [];
    for (const decl of this.record.parsed.declarations) {
      const r = this.resolveDecl(decl);
      if (r) resolvedDecls.push(r);
    }

    return {
      moduleId: this.moduleId,
      moduleDefId: this.table.moduleDefId,
      file: this.record.file,
      nameSpan: this.record.parsed.nameSpan,
      exports: this.record.parsed.exports,
      imports: this.resolvedImports,
      declarations: resolvedDecls,
      span: this.record.parsed.span,
    };
  }

  // ---- Scope installation ----

  private installPreludeIntoScope(): void {
    for (const [name, id] of this.prelude.types) {
      this.pushBinding(this.scopes.types, name, {
        defId: id,
        origin: "prelude",
      });
    }
    for (const [name, id] of this.prelude.terms) {
      this.pushBinding(this.scopes.terms, name, {
        defId: id,
        origin: "prelude",
      });
    }
  }

  private installImports(): void {
    for (const imp of this.record.parsed.imports) {
      this.installImport(imp);
    }
  }

  private installImport(imp: ImportDecl): void {
    const targetId = moduleIdFromPath(imp.path);
    const targetIface = this.allInterfaces.get(targetId);
    if (!targetIface) {
      // Module was not loaded — either missing (already reported by loader)
      // or part of an unresolved cycle. Emit a resolver-level diagnostic so
      // the import isn't silently ignored.
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.moduleNotFound,
          kind: "resolve",
          severity: "error",
          message: `import target module ${targetId} is not available`,
          file: this.record.file,
          span: toSpan(imp.pathSpan),
          details: { module: targetId },
        }),
      );
      // Still record a placeholder resolved import so the Resolved AST
      // preserves source shape.
      this.resolvedImports.push({
        path: imp.path,
        pathSpan: imp.pathSpan,
        kind: imp.kind,
        targetModule: targetId,
        targetModuleId: this.alloc.fresh(),
        selected: null,
        alias: null,
        span: imp.span,
      });
      return;
    }

    if (imp.kind === "qualified") {
      const aliasName = imp.alias!.name;
      const existing = this.scopes.moduleAliases.get(aliasName);
      if (existing) {
        this.diagnostics.push(
          makeDiagnostic({
            code: codes.moduleAliasDuplicate,
            kind: "resolve",
            severity: "error",
            message: `duplicate module alias '${aliasName}' in module ${this.moduleId}`,
            file: this.record.file,
            span: toSpan(imp.alias!.span),
            details: { alias: aliasName },
            related: [
              {
                file: existing.file,
                span: toSpan(existing.span),
                message: `previous alias '${aliasName}' bound to ${existing.moduleId}`,
              },
            ],
          }),
        );
      } else {
        this.scopes.moduleAliases.set(aliasName, {
          moduleId: targetId,
          defId: targetIface.moduleDefId,
          span: imp.alias!.span,
          file: this.record.file,
        });
      }
      this.resolvedImports.push({
        path: imp.path,
        pathSpan: imp.pathSpan,
        kind: "qualified",
        targetModule: targetId,
        targetModuleId: targetIface.moduleDefId,
        selected: null,
        alias: {
          name: aliasName,
          span: imp.alias!.span,
          moduleDefId: targetIface.moduleDefId,
        },
        span: imp.span,
      });
      return;
    }

    // Selected import.
    // Get-or-create the canonical qualified scope for this module path. Only
    // declarations that this or a sibling selected import actually names go
    // in here (phase-03_3.md §§2, 20, 22).
    const canonicalKey = imp.path.join(".");
    const canonicalScope = this.getOrCreateCanonicalScope(canonicalKey, targetId, imp.pathSpan);
    const selected: ResolvedSelectedImport[] = [];
    for (const sel of imp.selected ?? []) {
      const isTypeAll = sel.name.endsWith("(..)");
      const bareName = isTypeAll ? sel.name.slice(0, -"(..)".length) : sel.name;

      if (isTypeAll) {
        const typeId = targetIface.exportedTypes.get(bareName);
        if (typeId === undefined) {
          const targetDecls = this.allModuleDecls.get(targetId);
          const declaredButHidden =
            targetDecls !== undefined && targetDecls.types.has(bareName);
          this.diagnostics.push(
            makeDiagnostic({
              code: declaredButHidden ? codes.importNotExported : codes.importUnknownName,
              kind: "resolve",
              severity: "error",
              message: declaredButHidden
                ? `module ${targetId} declares type '${bareName}' but does not export it`
                : `module ${targetId} does not export type '${bareName}'`,
              file: this.record.file,
              span: toSpan(sel.span),
              details: { module: targetId, name: bareName, namespace: "type" },
            }),
          );
          continue;
        }
        const ctorIds = targetIface.exportedConstructorsByType.get(typeId);
        if (!ctorIds) {
          // The type exists but was not exported with (..). Constructors are
          // hidden — reject the `(..)` request.
          this.diagnostics.push(
            makeDiagnostic({
              code: codes.importConstructorsNotExported,
              kind: "resolve",
              severity: "error",
              message: `module ${targetId} does not export constructors of '${bareName}'`,
              file: this.record.file,
              span: toSpan(sel.span),
              details: { module: targetId, name: bareName },
            }),
          );
          continue;
        }
        this.pushBinding(this.scopes.types, bareName, {
          defId: typeId,
          origin: "selected-import",
          fromModule: targetId,
          span: sel.span,
          file: this.record.file,
        });
        canonicalScope.types.set(bareName, typeId);
        const ctorRefs = [];
        for (const cid of ctorIds) {
          const def = this.definitions.get(cid.value);
          if (!def) continue;
          const ctorName = def.name;
          this.pushBinding(this.scopes.terms, ctorName, {
            defId: cid,
            origin: "selected-import",
            fromModule: targetId,
            span: sel.span,
            file: this.record.file,
          });
          canonicalScope.terms.set(ctorName, cid);
          ctorRefs.push({ id: cid, namespace: "term" as const, name: ctorName, span: sel.span });
        }
        selected.push({
          name: sel.name,
          span: sel.span,
          termRef: null,
          typeRef: { id: typeId, namespace: "type", name: bareName, span: sel.span },
          constructorRefs: ctorRefs,
        });
      } else {
        // Selected name — could be a type OR a term (constructor or function).
        const typeId = targetIface.exportedTypes.get(bareName);
        const termId = targetIface.exportedTerms.get(bareName);
        let addedAny = false;
        let typeRef = null as ResolvedSelectedImport["typeRef"];
        let termRef = null as ResolvedSelectedImport["termRef"];

        if (typeId !== undefined) {
          this.pushBinding(this.scopes.types, bareName, {
            defId: typeId,
            origin: "selected-import",
            fromModule: targetId,
            span: sel.span,
            file: this.record.file,
          });
          canonicalScope.types.set(bareName, typeId);
          typeRef = { id: typeId, namespace: "type", name: bareName, span: sel.span };
          addedAny = true;
        }
        if (termId !== undefined) {
          this.pushBinding(this.scopes.terms, bareName, {
            defId: termId,
            origin: "selected-import",
            fromModule: targetId,
            span: sel.span,
            file: this.record.file,
          });
          canonicalScope.terms.set(bareName, termId);
          termRef = { id: termId, namespace: "term", name: bareName, span: sel.span };
          addedAny = true;
        }
        if (!addedAny) {
          // Distinguish "declared but not exported" from "never declared".
          const targetDecls = this.allModuleDecls.get(targetId);
          const declaredButHidden =
            targetDecls !== undefined &&
            (targetDecls.terms.has(bareName) || targetDecls.types.has(bareName));
          this.diagnostics.push(
            makeDiagnostic({
              code: declaredButHidden ? codes.importNotExported : codes.importUnknownName,
              kind: "resolve",
              severity: "error",
              message: declaredButHidden
                ? `module ${targetId} declares '${bareName}' but does not export it`
                : `module ${targetId} does not export '${bareName}'`,
              file: this.record.file,
              span: toSpan(sel.span),
              details: { module: targetId, name: bareName },
            }),
          );
          continue;
        }
        selected.push({
          name: sel.name,
          span: sel.span,
          termRef,
          typeRef,
          constructorRefs: [],
        });
      }
    }
    this.resolvedImports.push({
      path: imp.path,
      pathSpan: imp.pathSpan,
      kind: "selected",
      targetModule: targetId,
      targetModuleId: targetIface.moduleDefId,
      selected,
      alias: null,
      span: imp.span,
    });
  }

  private installOwnDeclarations(): void {
    // Module-local declarations win over prelude for the same name — they
    // must appear last in the bindings list per name (last-pushed is
    // preferred by the resolver on ties WITHIN the module's own scope, but
    // ambiguity comes from having multiple non-local candidates).
    for (const [name, entry] of this.table.types) {
      this.pushBinding(this.scopes.types, name, {
        defId: entry.defId,
        origin: "module-local",
        fromModule: this.moduleId,
        file: this.record.file,
        span: { file: this.record.file, start: entry.span.start, end: entry.span.end } as unknown as Span,
      });
    }
    for (const [name, entry] of this.table.terms) {
      this.pushBinding(this.scopes.terms, name, {
        defId: entry.defId,
        origin: "module-local",
        fromModule: this.moduleId,
        file: this.record.file,
        span: { file: this.record.file, start: entry.span.start, end: entry.span.end } as unknown as Span,
      });
    }
  }

  private getOrCreateCanonicalScope(
    key: string,
    moduleId: ModuleId,
    span: Span,
  ): CanonicalSelectedScope {
    const existing = this.scopes.canonicalQualifiedScopes.get(key);
    if (existing) return existing;
    const fresh: CanonicalSelectedScope = {
      moduleId,
      types: new Map(),
      terms: new Map(),
      span,
      file: this.record.file,
    };
    this.scopes.canonicalQualifiedScopes.set(key, fresh);
    return fresh;
  }

  private pushBinding(
    map: Map<string, ImportedBinding[]>,
    name: string,
    entry: ImportedBinding,
  ): void {
    const list = map.get(name);
    if (list) {
      // Deduplicate identical bindings so a Type(..) import doesn't shadow
      // itself and repeat imports of the same identity don't count as
      // ambiguous.
      if (!list.some((b) => b.defId.value === entry.defId.value && b.origin === entry.origin)) {
        list.push(entry);
      }
    } else {
      map.set(name, [entry]);
    }
  }

  // ---- Reference resolution ----

  // For module-level term references: apply the "nearest unambiguous
  // applicable binding" rule (§2). The tie-breaking policy: any single
  // module-local binding wins over external candidates (a module can
  // shadow prelude/import — with a warning); external candidates that
  // resolve to different DefIds are ambiguous.
  private resolveModuleTerm(name: string, span: Span): MaybeResolvedRef {
    const list = this.scopes.terms.get(name);
    if (!list || list.length === 0) {
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.nameUnknown,
          kind: "resolve",
          severity: "error",
          message: `unknown term '${name}' in module ${this.moduleId}`,
          file: this.record.file,
          span: toSpan(span),
          details: { module: this.moduleId, name, namespace: "term" },
        }),
      );
      return { kind: "unresolved", name, namespace: "term", span };
    }
    return this.selectFromBindings(name, "term", span, list);
  }

  private resolveModuleType(name: string, span: Span): MaybeResolvedRef {
    const list = this.scopes.types.get(name);
    if (!list || list.length === 0) {
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.typeNameUnknown,
          kind: "resolve",
          severity: "error",
          message: `unknown type '${name}' in module ${this.moduleId}`,
          file: this.record.file,
          span: toSpan(span),
          details: { module: this.moduleId, name, namespace: "type" },
        }),
      );
      return { kind: "unresolved", name, namespace: "type", span };
    }
    return this.selectFromBindings(name, "type", span, list);
  }

  private selectFromBindings(
    name: string,
    namespace: Namespace,
    span: Span,
    list: ImportedBinding[],
  ): MaybeResolvedRef {
    // If a module-local binding exists, prefer it. This models the "nearest
    // unambiguous applicable" rule: the module's own declarations sit inside
    // the module's own scope, closer than external imports.
    const local = list.find((b) => b.origin === "module-local");
    if (local) {
      // If external bindings also carry the same DefId (which happens for
      // re-exports of the same identity, not for spelling collisions), the
      // choice is trivial.
      return { id: local.defId, namespace, name, span };
    }

    // No module-local. Deduplicate by DefId — two imports of the same
    // identity are not ambiguous, only two DIFFERENT identities are.
    const unique = new Map<number, ImportedBinding>();
    for (const b of list) unique.set(b.defId.value, b);
    if (unique.size === 1) {
      const only = list[0]!;
      return { id: only.defId, namespace, name, span };
    }

    const related: RelatedLocation[] = [];
    for (const b of unique.values()) {
      const originLabel =
        b.origin === "prelude"
          ? "prelude"
          : b.origin === "selected-import"
            ? `imported from ${b.fromModule}`
            : "module-local declaration";
      related.push({
        file: b.file,
        span: b.span ? toSpan(b.span) : undefined,
        message: `candidate '${name}': ${originLabel}`,
      });
    }
    this.diagnostics.push(
      makeDiagnostic({
        code: codes.nameAmbiguous,
        kind: "resolve",
        severity: "error",
        message: `ambiguous ${namespace} '${name}' in module ${this.moduleId}`,
        file: this.record.file,
        span: toSpan(span),
        details: { module: this.moduleId, name, namespace, candidates: [...unique.keys()] },
        related,
      }),
    );
    return { kind: "unresolved", name, namespace, span };
  }

  // ---- Declaration bodies ----

  private resolveDecl(decl: Decl): ResolvedDecl | null {
    const name = decl.name;
    switch (decl.kind) {
      case "DeclTypeAlias": {
        const entry = this.table.types.get(name);
        if (!entry) return null;
        const tvScope = this.makeSignatureTypeVarScope(entry.defId, "typeDecl");
        const body = this.resolveType(decl.body, tvScope);
        const r: ResolvedDeclTypeAlias = {
          kind: "DeclTypeAlias",
          defId: entry.defId,
          name,
          nameSpan: decl.nameSpan,
          body,
          span: decl.span,
        };
        return r;
      }
      case "DeclVariant": {
        const entry = this.table.types.get(name);
        if (!entry) return null;
        const ctorIds = this.table.constructorsByType.get(entry.defId) ?? [];
        const tvScope = this.makeSignatureTypeVarScope(entry.defId, "typeDecl");
        const alts: ResolvedVariantAlt[] = [];
        for (let i = 0; i < decl.alternatives.length; i++) {
          const alt = decl.alternatives[i]!;
          const altId = ctorIds[i] ?? this.alloc.fresh();
          const payload = this.resolveVariantPayload(alt, tvScope);
          alts.push({
            defId: altId,
            name: alt.name,
            nameSpan: alt.nameSpan,
            payload,
            span: alt.span,
          });
        }
        const r: ResolvedDeclVariant = {
          kind: "DeclVariant",
          defId: entry.defId,
          name,
          nameSpan: decl.nameSpan,
          alternatives: alts,
          span: decl.span,
        };
        return r;
      }
      case "DeclSignature": {
        const entry = this.table.terms.get(name);
        if (!entry) return null;
        const tvScope = this.makeSignatureTypeVarScope(entry.defId, "signature");
        const type = this.resolveType(decl.type, tvScope);
        const r: ResolvedDeclSignature = {
          kind: "DeclSignature",
          defId: entry.defId,
          name,
          nameSpan: decl.nameSpan,
          type,
          span: decl.span,
        };
        return r;
      }
      case "DeclDefinition": {
        const entry = this.table.terms.get(name);
        if (!entry) return null;
        const scope = new LexicalScope(null);
        const resolvedParams: ResolvedPattern[] = [];
        for (const p of decl.params) {
          resolvedParams.push(this.resolvePattern(p, scope, "param"));
        }
        let body: ResolvedExpr | null = null;
        let guards: ResolvedGuardedRhs[] | null = null;
        if (decl.body !== null) {
          body = this.resolveExpr(decl.body, scope);
        } else if (decl.guards !== null) {
          guards = decl.guards.map((g) => ({
            condition: this.resolveExpr(g.condition, scope),
            body: this.resolveExpr(g.body, scope),
            span: g.span,
          }));
        }
        const r: ResolvedDeclDefinition = {
          kind: "DeclDefinition",
          defId: entry.defId,
          name,
          nameSpan: decl.nameSpan,
          params: resolvedParams,
          body,
          guards,
          span: decl.span,
        };
        return r;
      }
    }
  }

  private resolveVariantPayload(
    alt: VariantAlt,
    tvScope: TypeVarScope,
  ): ResolvedVariantPayload {
    switch (alt.payload.kind) {
      case "None":
        return { kind: "None" };
      case "Type":
        return { kind: "Type", type: this.resolveType(alt.payload.type, tvScope) };
      case "Record":
        return {
          kind: "Record",
          fields: alt.payload.fields.map((f) => this.resolveTypeRecordField(f, tvScope)),
          span: alt.payload.span,
        };
    }
  }

  private resolveTypeRecordField(
    f: TypeRecordField,
    tvScope: TypeVarScope,
  ): ResolvedTypeRecordField {
    return {
      name: f.name,
      nameSpan: f.nameSpan,
      fieldType: this.resolveType(f.fieldType, tvScope),
      span: f.span,
    };
  }

  // ---- Types ----

  private resolveType(node: TypeNode, tvScope: TypeVarScope): ResolvedType {
    switch (node.kind) {
      case "TypeUnit":
        return { kind: "TypeUnit", span: node.span };
      case "TypeVar": {
        const id = tvScope.get(node.name);
        if (id !== undefined) {
          return {
            kind: "TypeVarRef",
            ref: { id, namespace: "type", name: node.name, span: node.span },
            span: node.span,
          };
        }
        // Fresh type variable — allocate one bound to the current scope.
        const fresh = this.alloc.fresh();
        tvScope.introduce(node.name, fresh);
        this.definitions.set(fresh.value, {
          id: fresh,
          namespace: "type",
          category: "typeVar",
          name: node.name,
          origin: { kind: "user", module: this.moduleId, span: node.span },
          scope: tvScope.descriptor,
        });
        return {
          kind: "TypeVarRef",
          ref: { id: fresh, namespace: "type", name: node.name, span: node.span },
          span: node.span,
        };
      }
      case "TypeCon": {
        const ref = this.resolveTypeConPath(node.path, node.span);
        return { kind: "TypeConRef", ref, path: node.path, span: node.span };
      }
      case "TypeApp":
        return {
          kind: "TypeApp",
          head: this.resolveType(node.head, tvScope),
          arg: this.resolveType(node.arg, tvScope),
          span: node.span,
        };
      case "TypeFun":
        return {
          kind: "TypeFun",
          from: this.resolveType(node.from, tvScope),
          to: this.resolveType(node.to, tvScope),
          span: node.span,
        };
      case "TypeRecord":
        return {
          kind: "TypeRecord",
          fields: node.fields.map((f) => this.resolveTypeRecordField(f, tvScope)),
          span: node.span,
        };
      case "TypeParen":
        return {
          kind: "TypeParen",
          inner: this.resolveType(node.inner, tvScope),
          span: node.span,
        };
    }
  }

  private resolveTypeConPath(pathIn: string[], span: Span): MaybeResolvedRef {
    if (pathIn.length === 1) {
      return this.resolveModuleType(pathIn[0]!, span);
    }
    // Qualified type: resolve the leading segments as a module qualifier via
    // the same alias/canonical mechanism used for terms. Aliases expose the
    // whole exported interface; canonical selected scopes expose only what
    // was selected (phase-03_3.md §§8, 15).
    const qualifierParts = pathIn.slice(0, -1).map((p) => ({ name: p, span }));
    const lastName = pathIn[pathIn.length - 1]!;
    const qual = this.resolveQualifierToModule(qualifierParts, span);
    if (qual === null) {
      return { kind: "unresolved", name: pathIn.join("."), namespace: "type", span };
    }
    return this.lookupTypeInQualifier(qual, lastName, span);
  }

  private makeSignatureTypeVarScope(owner: DefId, kind: "signature" | "typeDecl"): TypeVarScope {
    return new TypeVarScope({ kind, owner });
  }

  // Resolve a module-qualified term reference. The qualifier may be either a
  // single alias (`Alias.name`) or a multi-segment canonical module path
  // (`Data.Text.trim`, `Game.Model.Circle`). Qualification never bypasses
  // the module's exported interface (aliases) or the selected-import scope
  // (canonical dotted paths) — see phase-03_3.md §§2-4, 24.
  private resolveQualifiedTerm(
    qualifierParts: { name: string; span: Span }[],
    qualifierSpan: Span,
    name: string,
    nameSpan: Span,
  ): MaybeResolvedRef {
    const qual = this.resolveQualifierToModule(qualifierParts, qualifierSpan);
    if (qual === null) {
      return { kind: "unresolved", name, namespace: "term", span: nameSpan };
    }
    return this.lookupTermInQualifier(qual, name, nameSpan);
  }

  // Look up a terminal term name once the qualifier has already resolved to
  // a single semantic module identity. Visibility is the union across every
  // legally available candidate — an alias source exposes the whole exported
  // interface, a canonical selected source exposes only selected declarations
  // — so any candidate that lists the name suffices (phase-03_4.md §§8, 9,
  // 15). Emits BLACK_QUALIFIED_NAME_UNKNOWN when no candidate exposes it.
  private lookupTermInQualifier(
    qual: QualifierResolution,
    name: string,
    nameSpan: Span,
  ): MaybeResolvedRef {
    let id: DefId | undefined;
    for (const c of qual.candidates) {
      const found =
        c.kind === "alias"
          ? c.iface.exportedTerms.get(name)
          : c.scope.terms.get(name);
      if (found !== undefined) {
        id = found;
        break;
      }
    }
    if (id === undefined) {
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.qualifiedNameUnknown,
          kind: "resolve",
          severity: "error",
          message: `module ${qual.moduleId} does not export term '${name}'`,
          file: this.record.file,
          span: toSpan(nameSpan),
          details: { module: qual.moduleId, name, namespace: "term" },
        }),
      );
      return { kind: "unresolved", name, namespace: "term", span: nameSpan };
    }
    return { id, namespace: "term", name, span: nameSpan };
  }

  private lookupTypeInQualifier(
    qual: QualifierResolution,
    name: string,
    nameSpan: Span,
  ): MaybeResolvedRef {
    let id: DefId | undefined;
    for (const c of qual.candidates) {
      const found =
        c.kind === "alias"
          ? c.iface.exportedTypes.get(name)
          : c.scope.types.get(name);
      if (found !== undefined) {
        id = found;
        break;
      }
    }
    if (id === undefined) {
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.qualifiedNameUnknown,
          kind: "resolve",
          severity: "error",
          message: `module ${qual.moduleId} does not export type '${name}'`,
          file: this.record.file,
          span: toSpan(nameSpan),
          details: { module: qual.moduleId, name, namespace: "type" },
        }),
      );
      return { kind: "unresolved", name, namespace: "type", span: nameSpan };
    }
    return { id, namespace: "type", name, span: nameSpan };
  }

  // Resolve a qualifier (one or more CONID segments) into a single semantic
  // module identity. Two visibility sources compete for a single-segment
  // qualifier spelling: (a) a matching `import M as Alias` and (b) a
  // canonical dotted path registered by any selected `import M (…)`. Both
  // are collected, then collapsed by semantic module identity — a spelling
  // that ultimately names one module is resolved (with visibility union
  // across candidates); a spelling that names two different modules is a
  // BLACK_MODULE_QUALIFIER_AMBIGUOUS error, regardless of import order or
  // whether the terminal member happens to be defined in only one candidate
  // (phase-03_4.md §§3, 4, 5, 7-11). Emits BLACK_MODULE_ALIAS_UNKNOWN when
  // no candidate exists at all — used by type/pattern paths where the
  // qualifier is required and no structural fallback exists.
  private resolveQualifierToModule(
    parts: { name: string; span: Span }[],
    qualifierSpan: Span,
  ): QualifierResolution | null {
    const decision = this.resolveQualifier(parts, qualifierSpan);
    if (decision.kind === "resolved") return decision.qual;
    if (decision.kind === "no-qualifier") {
      const dotted = parts.map((p) => p.name).join(".");
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.moduleAliasUnknown,
          kind: "resolve",
          severity: "error",
          message: `unknown module qualifier '${dotted}'`,
          file: this.record.file,
          span: toSpan(qualifierSpan),
          details: { alias: dotted },
        }),
      );
    }
    return null;
  }

  // Preserves the three-state distinction so expression-side callers can:
  //  * `resolved`   — proceed with qualified lookup;
  //  * `no-qualifier` — fall through to structural field access silently;
  //  * `ambiguous`  — stop with the ambiguity diagnostic already emitted, and
  //                   NOT reinterpret as structural (phase-03_5.md §4, §5).
  private resolveQualifierDecision(
    parts: { name: string; span: Span }[],
    qualifierSpan: Span,
  ): QualifierDecision {
    return this.resolveQualifier(parts, qualifierSpan);
  }

  private resolveQualifier(
    parts: { name: string; span: Span }[],
    qualifierSpan: Span,
  ): QualifierDecision {
    const candidates = this.collectQualifierCandidates(parts);
    if (candidates.length === 0) {
      return { kind: "no-qualifier" };
    }

    // Collapse by semantic module identity. Multiple visibility sources for
    // the same module identity are not ambiguity — they are identity-equal
    // paths that combine their visibility surfaces (phase-03_4.md §§3, 9).
    const identities = new Map<ModuleId, QualifierCandidate[]>();
    for (const c of candidates) {
      const list = identities.get(c.moduleId);
      if (list) list.push(c);
      else identities.set(c.moduleId, [c]);
    }

    if (identities.size === 1) {
      const [moduleId] = identities.keys();
      return { kind: "resolved", qual: { moduleId: moduleId!, candidates } };
    }

    // Genuine module-namespace collision. Do NOT use lookup order to break
    // it, and do NOT use terminal-member visibility to disambiguate — the
    // qualifier is ambiguous before member lookup (phase-03_4.md §§4, 5).
    const dotted = parts.map((p) => p.name).join(".");
    const related: RelatedLocation[] = [];
    for (const c of candidates) {
      if (c.kind === "alias") {
        related.push({
          file: c.file,
          span: toSpan(c.span),
          message: `qualifier '${dotted}' bound to module ${c.moduleId} by 'import ${c.moduleId} as ${dotted}'`,
        });
      } else {
        related.push({
          file: c.scope.file,
          span: toSpan(c.scope.span),
          message: `qualifier '${dotted}' introduced by selected import of module ${c.moduleId}`,
        });
      }
    }
    this.diagnostics.push(
      makeDiagnostic({
        code: codes.moduleQualifierAmbiguous,
        kind: "resolve",
        severity: "error",
        message: `module qualifier '${dotted}' is ambiguous`,
        file: this.record.file,
        span: toSpan(qualifierSpan),
        details: { qualifier: dotted, modules: [...identities.keys()] },
        related,
      }),
    );
    return { kind: "ambiguous" };
  }

  private collectQualifierCandidates(
    parts: { name: string; span: Span }[],
  ): QualifierCandidate[] {
    const candidates: QualifierCandidate[] = [];
    // Only single-segment names participate as aliases — Black does not
    // permit multi-segment alias spellings, so `import Other as Game` and
    // canonical `Game.Model` cannot collide (phase-03_4.md §6, §19).
    if (parts.length === 1) {
      const alias = this.scopes.moduleAliases.get(parts[0]!.name);
      if (alias) {
        const iface = this.allInterfaces.get(alias.moduleId);
        if (iface) {
          candidates.push({
            kind: "alias",
            moduleId: alias.moduleId,
            iface,
            span: alias.span,
            file: alias.file,
          });
        }
      }
    }
    const dotted = parts.map((p) => p.name).join(".");
    const canonical = this.scopes.canonicalQualifiedScopes.get(dotted);
    if (canonical) {
      candidates.push({
        kind: "canonical",
        moduleId: canonical.moduleId,
        scope: canonical,
      });
    }
    return candidates;
  }

  // ---- Patterns ----

  private resolvePattern(
    p: Pattern,
    scope: LexicalScope,
    subKind: "param" | "lambdaParam" | "let" | "patternBinder",
  ): ResolvedPattern {
    switch (p.kind) {
      case "PatternWildcard":
        return { kind: "PatternWildcard", span: p.span };
      case "PatternVar": {
        const binder = this.introduceLocalBinder(p.name, p.span, scope, subKind);
        return { kind: "PatternVar", binder, span: p.span };
      }
      case "PatternInt":
      case "PatternFloat":
      case "PatternString":
      case "PatternBool":
        return p as ResolvedPattern;
      case "PatternCon": {
        const ref: MaybeResolvedRef = p.qualifier
          ? this.resolveQualifiedTerm(p.qualifier.parts, p.qualifier.span, p.name, p.nameSpan)
          : this.resolveModuleTerm(p.name, p.nameSpan);
        // Validate that ref actually refers to a constructor if resolved.
        if (!("kind" in ref)) {
          const def = this.definitions.get(ref.id.value);
          if (def && def.namespace === "term" && def.category !== "constructor") {
            this.diagnostics.push(
              makeDiagnostic({
                code: codes.nameUnknown,
                kind: "resolve",
                severity: "error",
                message: `'${p.name}' is not a constructor and cannot be used in a pattern`,
                file: this.record.file,
                span: toSpan(p.nameSpan),
                details: { name: p.name },
              }),
            );
          }
        }
        const args: ResolvedPattern[] = [];
        for (const a of p.args) {
          args.push(this.resolvePattern(a, scope, subKind));
        }
        return { kind: "PatternCon", ref, args, span: p.span };
      }
      case "PatternRecord": {
        let ctor: MaybeResolvedRef | null = null;
        if (p.constructor) {
          ctor = this.resolveModuleTerm(p.constructor.name, p.constructor.span);
        }
        const fields: ResolvedPatternRecordField[] = [];
        for (const f of p.fields) {
          // Structural field label — deliberately NOT resolved (§38).
          fields.push({
            name: f.name,
            nameSpan: f.nameSpan,
            pattern: this.resolvePattern(f.pattern, scope, "patternBinder"),
            span: f.span,
          });
        }
        return { kind: "PatternRecord", constructor: ctor, fields, span: p.span };
      }
    }
  }

  private introduceLocalBinder(
    name: string,
    span: Span,
    scope: LexicalScope,
    subKind: LocalBinder["subKind"],
  ): LocalBinder {
    // Duplicate in the same lexical scope? Error (§50).
    if (scope.hasLocal(name)) {
      const prev = scope.getLocal(name)!;
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.nameDuplicateBinding,
          kind: "resolve",
          severity: "error",
          message: `duplicate binder '${name}' in the same pattern/parameter list`,
          file: this.record.file,
          span: toSpan(span),
          details: { name },
          related: [
            {
              file: this.record.file,
              span: toSpan(prev.span),
              message: `previous binding of '${name}'`,
            },
          ],
        }),
      );
      // Fall through and introduce anyway so downstream work continues.
    } else if (scope.hasVisible(name) || this.scopes.terms.has(name)) {
      // Shadowing — legal but warn (§41).
      const outer = scope.getVisible(name);
      const related: RelatedLocation[] = [];
      if (outer) {
        related.push({
          file: this.record.file,
          span: toSpan(outer.span),
          message: `outer binding of '${name}'`,
        });
      } else {
        const topList = this.scopes.terms.get(name);
        if (topList && topList[0]?.span) {
          related.push({
            file: topList[0].file ?? this.record.file,
            span: toSpan(topList[0].span),
            message: `outer binding of '${name}'`,
          });
        }
      }
      this.diagnostics.push(
        makeDiagnostic({
          code: codes.nameShadowing,
          kind: "resolve",
          severity: "warning",
          message: `binding '${name}' shadows an outer binding`,
          file: this.record.file,
          span: toSpan(span),
          details: { name },
          related,
        }),
      );
    }
    const id = this.alloc.fresh();
    const binder: LocalBinder = { id, name, span, subKind };
    scope.set(name, binder);
    this.definitions.set(id.value, {
      id,
      namespace: "term",
      category: "local",
      subKind,
      name,
      origin: { kind: "user", module: this.moduleId, span },
    });
    return binder;
  }

  // ---- Expressions ----

  private resolveExpr(e: Expr, scope: LexicalScope): ResolvedExpr {
    switch (e.kind) {
      case "ExprInt":
      case "ExprFloat":
      case "ExprString":
      case "ExprBool":
      case "ExprUnit":
        return e as ResolvedExpr;
      case "ExprVar":
        return {
          kind: "ExprVarRef",
          ref: this.resolveTermInScope(e.name, e.span, scope),
          span: e.span,
        };
      case "ExprCon":
        return {
          kind: "ExprConRef",
          ref: this.resolveTermInScope(e.name, e.span, scope),
          span: e.span,
        };
      case "ExprApp":
        return {
          kind: "ExprApp",
          fn: this.resolveExpr(e.fn, scope),
          arg: this.resolveExpr(e.arg, scope),
          span: e.span,
        };
      case "ExprField": {
        // Walk any CONID.CONID.…CONID prefix into a qualifier candidate.
        // `Alias.name`, `Data.Text.trim`, and `Game.Model.Circle` all present
        // as chained ExprFields whose leaf record is an ExprCon and whose
        // intermediate `.field`s start with a capital letter (parsed as CONID
        // by the lexer, then captured verbatim in `field`).
        const qualifier = collectQualifierChain(e);
        if (qualifier !== null) {
          const decision = this.resolveQualifierDecision(qualifier.parts, qualifier.span);
          const dotted = qualifier.parts.map((p) => p.name).join(".");
          if (decision.kind === "resolved") {
            // Once the qualifier is recognised as a module path, an unknown
            // terminal is a qualified-name error, not a structural fallback
            // (phase-03_3.md §24).
            const ref = this.lookupTermInQualifier(decision.qual, e.field, e.fieldSpan);
            return {
              kind: "ExprQualified",
              alias: dotted,
              aliasSpan: qualifier.span,
              moduleId: decision.qual.moduleId,
              ref,
              span: e.span,
            };
          }
          if (decision.kind === "ambiguous") {
            // The qualifier was recognised as module syntax but names two
            // different module identities. The ambiguity diagnostic is
            // already emitted; do NOT reinterpret this as structural field
            // access — that would fabricate a spurious BLACK_NAME_UNKNOWN
            // for the head (phase-03_5.md §§5, 6). Preserve source
            // provenance without fabricating a module identity.
            return {
              kind: "ExprQualified",
              alias: dotted,
              aliasSpan: qualifier.span,
              moduleId: null,
              ref: { kind: "unresolved", name: e.field, namespace: "term", span: e.fieldSpan },
              span: e.span,
            };
          }
          // decision.kind === "no-qualifier" — fall through to structural.
        }
        // Ordinary structural field access — resolve the record expression,
        // leave the field label unresolved (§36).
        return {
          kind: "ExprField",
          record: this.resolveExpr(e.record, scope),
          field: e.field,
          fieldSpan: e.fieldSpan,
          span: e.span,
        };
      }
      case "ExprRecord": {
        const fields: ResolvedRecordFieldValue[] = e.fields.map((f) =>
          this.resolveRecordFieldValue(f, scope),
        );
        return { kind: "ExprRecord", fields, span: e.span };
      }
      case "ExprRecordUpdate": {
        const fields: ResolvedRecordFieldValue[] = e.fields.map((f) =>
          this.resolveRecordFieldValue(f, scope),
        );
        return {
          kind: "ExprRecordUpdate",
          record: this.resolveExpr(e.record, scope),
          fields,
          span: e.span,
        };
      }
      case "ExprList":
        return {
          kind: "ExprList",
          elements: e.elements.map((el) => this.resolveExpr(el, scope)),
          span: e.span,
        };
      case "ExprLambda": {
        const inner = new LexicalScope(scope);
        const params: ResolvedPattern[] = [];
        for (const p of e.params) {
          params.push(this.resolvePattern(p, inner, "lambdaParam"));
        }
        const body = this.resolveExpr(e.body, inner);
        return { kind: "ExprLambda", params, body, span: e.span };
      }
      case "ExprLet":
        return this.resolveLet(e.bindings, e.body, scope, e.span);
      case "ExprCase": {
        const scrutinee = this.resolveExpr(e.scrutinee, scope);
        const branches: ResolvedCaseBranch[] = e.branches.map((b) =>
          this.resolveCaseBranch(b, scope),
        );
        return { kind: "ExprCase", scrutinee, branches, span: e.span };
      }
      case "ExprInfix": {
        const opId = this.prelude.operators.get(e.op);
        if (!opId) {
          this.diagnostics.push(
            makeDiagnostic({
              code: codes.nameUnknown,
              kind: "resolve",
              severity: "error",
              message: `operator '${e.op}' is not defined in the Prelude`,
              file: this.record.file,
              span: toSpan(e.opSpan),
              details: { name: e.op, namespace: "term" },
            }),
          );
        }
        const opRef: MaybeResolvedRef = opId
          ? { id: opId, namespace: "term", name: e.op, span: e.opSpan }
          : { kind: "unresolved", name: e.op, namespace: "term", span: e.opSpan };
        return {
          kind: "ExprInfix",
          op: e.op,
          opSpan: e.opSpan,
          opRef,
          left: this.resolveExpr(e.left, scope),
          right: this.resolveExpr(e.right, scope),
          span: e.span,
        };
      }
      case "ExprParen":
        return {
          kind: "ExprParen",
          inner: this.resolveExpr(e.inner, scope),
          span: e.span,
        };
    }
  }

  private resolveTermInScope(
    name: string,
    span: Span,
    scope: LexicalScope,
  ): MaybeResolvedRef {
    const binder = scope.getVisible(name);
    if (binder) {
      return { id: binder.id, namespace: "term", name, span };
    }
    return this.resolveModuleTerm(name, span);
  }

  private resolveRecordFieldValue(
    f: RecordFieldValue,
    scope: LexicalScope,
  ): ResolvedRecordFieldValue {
    return {
      name: f.name,
      nameSpan: f.nameSpan,
      value: this.resolveExpr(f.value, scope),
      span: f.span,
    };
  }

  private resolveCaseBranch(b: CaseBranch, outer: LexicalScope): ResolvedCaseBranch {
    // Each branch opens its own scope so pattern binders don't leak (§48).
    const branchScope = new LexicalScope(outer);
    const pattern = this.resolvePattern(b.pattern, branchScope, "patternBinder");
    const body = this.resolveExpr(b.body, branchScope);
    return { pattern, body, span: b.span };
  }

  private resolveLet(
    bindings: LetBinding[],
    bodyExpr: Expr,
    outer: LexicalScope,
    letSpan: Span,
  ): ResolvedExpr {
    // Local `let` is sequential and non-recursive (phase-03_5.md §3): each
    // binding's RHS sees the enclosing scope plus every earlier binding in
    // the same block, but not itself and not later siblings. The `in` body
    // sees all bindings.
    const rhsScope = new LexicalScope(outer);
    const seen = new Map<string, LocalBinder>();
    const resolvedBindings: ResolvedLetBinding[] = [];

    for (const b of bindings) {
      if (seen.has(b.name)) {
        const prev = seen.get(b.name)!;
        this.diagnostics.push(
          makeDiagnostic({
            code: codes.nameDuplicateBinding,
            kind: "resolve",
            severity: "error",
            message: `duplicate let binding '${b.name}'`,
            file: this.record.file,
            span: toSpan(b.nameSpan),
            details: { name: b.name },
            related: [
              {
                file: this.record.file,
                span: toSpan(prev.span),
                message: `previous binding of '${b.name}'`,
              },
            ],
          }),
        );
        continue;
      }

      // Resolve the RHS BEFORE installing this binding, so `self` and
      // later-sibling references cannot resolve to it.
      const paramScope = new LexicalScope(rhsScope);
      const params: ResolvedPattern[] = b.params.map((p) =>
        this.resolvePattern(p, paramScope, "patternBinder"),
      );
      const body = this.resolveExpr(b.body, paramScope);

      // Shadowing check happens at install time, against the pre-install
      // scope (outer + earlier siblings) and the module scope.
      if (rhsScope.hasVisible(b.name) || this.scopes.terms.has(b.name)) {
        const shadowed = rhsScope.getVisible(b.name);
        const related: RelatedLocation[] = [];
        if (shadowed) {
          related.push({
            file: this.record.file,
            span: toSpan(shadowed.span),
            message: `outer binding of '${b.name}'`,
          });
        }
        this.diagnostics.push(
          makeDiagnostic({
            code: codes.nameShadowing,
            kind: "resolve",
            severity: "warning",
            message: `let binding '${b.name}' shadows an outer binding`,
            file: this.record.file,
            span: toSpan(b.nameSpan),
            details: { name: b.name },
            related,
          }),
        );
      }

      const id = this.alloc.fresh();
      const binder: LocalBinder = { id, name: b.name, span: b.nameSpan, subKind: "let" };
      seen.set(b.name, binder);
      this.definitions.set(id.value, {
        id,
        namespace: "term",
        category: "local",
        subKind: "let",
        name: b.name,
        origin: { kind: "user", module: this.moduleId, span: b.nameSpan },
      });
      rhsScope.set(b.name, binder);
      resolvedBindings.push({ binder, params, body, span: b.span });
    }

    const body = this.resolveExpr(bodyExpr, rhsScope);
    return { kind: "ExprLet", bindings: resolvedBindings, body, span: letSpan };
  }

}

// ---------- Lexical scope ----------

class LexicalScope {
  private map = new Map<string, LocalBinder>();
  constructor(private readonly parent: LexicalScope | null) {}

  hasLocal(name: string): boolean {
    return this.map.has(name);
  }
  getLocal(name: string): LocalBinder | null {
    return this.map.get(name) ?? null;
  }
  set(name: string, binder: LocalBinder): void {
    this.map.set(name, binder);
  }
  hasVisible(name: string): boolean {
    return this.getVisible(name) !== null;
  }
  getVisible(name: string): LocalBinder | null {
    if (this.map.has(name)) return this.map.get(name)!;
    if (this.parent) return this.parent.getVisible(name);
    return null;
  }
}

class TypeVarScope {
  private map = new Map<string, DefId>();
  readonly descriptor: import("./types.js").TypeVarScope;
  constructor(descriptor: import("./types.js").TypeVarScope) {
    this.descriptor = descriptor;
  }
  get(name: string): DefId | undefined {
    return this.map.get(name);
  }
  introduce(name: string, id: DefId): void {
    this.map.set(name, id);
  }
}

// ---------- helpers ----------

function toSpan(span: { start: { line: number; column: number }; end: { line: number; column: number } }) {
  return {
    start: { line: span.start.line, column: span.start.column },
    end: { line: span.end.line, column: span.end.column },
  };
}

// Walk an `ExprField` inward as long as each intermediate hop looks like a
// CONID.CONID module qualification (`.Text`, `.Model`, etc.) and the base of
// the chain is an `ExprCon`. Returns the qualifier segments (base + all
// intermediate CONID hops, in source order) plus the span covering them.
//
// Returns `null` when the chain cannot possibly be a module qualification —
// for example `player.position.x`, whose base is `ExprVar`.
//
// The terminal member — `.trim`, `.Circle`, `.x` — is NOT included; it lives
// on the caller's outer `ExprField.field`.
function collectQualifierChain(
  e: ExprField,
): { parts: { name: string; span: Span }[]; span: Span } | null {
  const intermediates: { name: string; span: Span }[] = [];
  let cur: Expr = e.record;
  while (cur.kind === "ExprField") {
    if (!startsWithUpper(cur.field)) return null;
    intermediates.push({ name: cur.field, span: cur.fieldSpan });
    cur = cur.record;
  }
  if (cur.kind !== "ExprCon") return null;
  const base = { name: cur.name, span: cur.span };
  const parts = [base, ...intermediates.reverse()];
  const first = parts[0]!.span;
  const last = parts[parts.length - 1]!.span;
  return {
    parts,
    span: makeSpan(first.file, first.start, last.end),
  };
}

function startsWithUpper(s: string): boolean {
  if (s.length === 0) return false;
  const c = s.charCodeAt(0);
  return c >= 0x41 && c <= 0x5a;
}


// Suppress unused-import warning for SelectedImport (used in inline types).
void undefined as unknown as SelectedImport;
