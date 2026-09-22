// Resolved AST + supporting types for Phase 3 name resolution.
//
// The resolver takes the reachable module closure of a project (Parsed AST +
// module graph), assigns every declaration an ephemeral semantic identity
// (`DefId`), and rewrites every supported source reference into a
// `ResolvedRef` that carries that identity. Anything the resolver cannot
// commit to (structural fields, and — pending semantic-freeze resolution —
// sibling `let` visibility) is preserved unresolved for a later phase.
//
// DefIds are unique **within one compiler invocation**. They are not stable
// across builds. See phase-03.md §15 / §67 — a durable semantic index is
// explicitly out of scope.

import type { Span } from "../source.js";
import type {
  Decl,
  ExportSpec,
  ImportDecl,
  Module,
  Pattern,
  TypeNode,
  Expr,
  RecordFieldValue,
  TypeRecordField,
  VariantAlt,
  GuardedRhs,
  CaseBranch,
  LetBinding,
  InfixOp,
} from "../ast.js";

// ---------- Module identity ----------

// Canonical dotted module name: ["Game", "Model"] etc.
export type ModuleId = string;

export function moduleIdFromPath(parts: string[]): ModuleId {
  return parts.join(".");
}

export function moduleIdParts(id: ModuleId): string[] {
  return id.split(".");
}

// ---------- Definition identity ----------

// A DefId is a plain nominal integer wrapper. Wrapping (rather than a raw
// number alias) keeps the type checker honest about the distinction between
// a numeric literal and a semantic identity.
export interface DefId {
  readonly value: number;
}

export function defIdEq(a: DefId, b: DefId): boolean {
  return a.value === b.value;
}

// ---------- Namespaces ----------

export type Namespace = "module" | "type" | "term";

// ---------- Definition records ----------

// Origin distinguishes user-authored declarations from Prelude builtins.
export type DefOrigin =
  | { kind: "user"; module: ModuleId; span: Span }
  | { kind: "prelude" }
  | { kind: "operator"; op: InfixOp };

// A DefinitionRecord describes what a DefId refers to. It is intentionally
// small — Phase 3 does not attach types or ABI, only identity/spelling.
export type DefinitionRecord =
  | TypeDefRecord
  | TermDefRecord
  | ConstructorDefRecord
  | TypeVarDefRecord
  | LocalTermDefRecord;

export interface TypeDefRecord {
  id: DefId;
  namespace: "type";
  category: "typeAlias" | "variant" | "preludeType";
  name: string;
  origin: DefOrigin;
  // For variant types: the constructor DefIds owned by this type, in source
  // order. Empty for aliases / prelude nominal types (List, Maybe are treated
  // as prelude types with constructors registered separately).
  constructors: DefId[];
}

export interface TermDefRecord {
  id: DefId;
  namespace: "term";
  category: "topLevel" | "preludeTerm" | "operator";
  name: string;
  origin: DefOrigin;
  // If this term declaration carries a signature, the span points at the
  // signature; if it only has equations, at the first equation's name.
  hasSignature: boolean;
}

export interface ConstructorDefRecord {
  id: DefId;
  namespace: "term";
  category: "constructor";
  name: string;
  origin: DefOrigin;
  ownerType: DefId;
}

export interface TypeVarDefRecord {
  id: DefId;
  namespace: "type";
  category: "typeVar";
  name: string;
  origin: DefOrigin;
  scope: TypeVarScope;
}

export type TypeVarScope =
  | { kind: "signature"; owner: DefId }
  | { kind: "typeDecl"; owner: DefId };

export interface LocalTermDefRecord {
  id: DefId;
  namespace: "term";
  category: "local";
  subKind: "param" | "lambdaParam" | "let" | "patternBinder";
  name: string;
  origin: DefOrigin;
}

// ---------- Resolved reference ----------

export interface ResolvedRef {
  id: DefId;
  namespace: Namespace;
  name: string;
  span: Span;
}

// A reference that could not be resolved. Emitted so later phases (or the
// Resolved AST serializer) can still walk the tree — the diagnostic is the
// authoritative signal.
export interface UnresolvedRef {
  kind: "unresolved";
  name: string;
  namespace: Namespace;
  span: Span;
}

export type MaybeResolvedRef = ResolvedRef | UnresolvedRef;

// ---------- Resolved patterns / expressions / types ----------

// Resolved variants mirror Parsed AST but carry semantic identities and,
// crucially, retain source provenance. See phase-03.md §17, §93.

export type ResolvedType =
  | { kind: "TypeUnit"; span: Span }
  | { kind: "TypeVarRef"; ref: MaybeResolvedRef; span: Span }
  | { kind: "TypeConRef"; ref: MaybeResolvedRef; path: string[]; span: Span }
  | { kind: "TypeApp"; head: ResolvedType; arg: ResolvedType; span: Span }
  | { kind: "TypeFun"; from: ResolvedType; to: ResolvedType; span: Span }
  | { kind: "TypeRecord"; fields: ResolvedTypeRecordField[]; span: Span }
  | { kind: "TypeParen"; inner: ResolvedType; span: Span };

export interface ResolvedTypeRecordField {
  name: string;
  nameSpan: Span;
  fieldType: ResolvedType;
  span: Span;
}

export type ResolvedPattern =
  | { kind: "PatternVar"; binder: LocalBinder; span: Span }
  | { kind: "PatternWildcard"; span: Span }
  | { kind: "PatternInt"; value: number; text: string; span: Span }
  | { kind: "PatternFloat"; value: number; text: string; span: Span }
  | { kind: "PatternString"; value: string; span: Span }
  | { kind: "PatternBool"; value: boolean; span: Span }
  | {
      kind: "PatternCon";
      ref: MaybeResolvedRef;
      args: ResolvedPattern[];
      span: Span;
    }
  | {
      kind: "PatternRecord";
      // Optional leading constructor: `Point { x = px, ... }`.
      constructor: MaybeResolvedRef | null;
      fields: ResolvedPatternRecordField[];
      span: Span;
    };

export interface ResolvedPatternRecordField {
  // Structural field label — NOT resolved in Phase 3 (§37).
  name: string;
  nameSpan: Span;
  pattern: ResolvedPattern;
  span: Span;
}

export interface LocalBinder {
  id: DefId;
  name: string;
  span: Span;
  subKind: "param" | "lambdaParam" | "let" | "patternBinder";
}

export type ResolvedExpr =
  | { kind: "ExprInt"; value: number; text: string; span: Span }
  | { kind: "ExprFloat"; value: number; text: string; span: Span }
  | { kind: "ExprString"; value: string; span: Span }
  | { kind: "ExprBool"; value: boolean; span: Span }
  | { kind: "ExprUnit"; span: Span }
  | { kind: "ExprVarRef"; ref: MaybeResolvedRef; span: Span }
  | { kind: "ExprConRef"; ref: MaybeResolvedRef; span: Span }
  | {
      kind: "ExprQualified";
      // Module-qualified access: `Alias.something` where the leftmost CONID is
      // a known module alias/name in scope. Preserved as a distinct node so
      // callers can distinguish it from record-field access.
      alias: string;
      aliasSpan: Span;
      moduleId: ModuleId; // module the alias refers to
      ref: MaybeResolvedRef;
      span: Span;
    }
  | { kind: "ExprApp"; fn: ResolvedExpr; arg: ResolvedExpr; span: Span }
  | {
      kind: "ExprField";
      // Structural field access — the field label is NOT resolved in Phase 3
      // (§36). Only `record` is resolved.
      record: ResolvedExpr;
      field: string;
      fieldSpan: Span;
      span: Span;
    }
  | {
      kind: "ExprRecord";
      fields: ResolvedRecordFieldValue[];
      span: Span;
    }
  | {
      kind: "ExprRecordUpdate";
      record: ResolvedExpr;
      fields: ResolvedRecordFieldValue[];
      span: Span;
    }
  | { kind: "ExprList"; elements: ResolvedExpr[]; span: Span }
  | {
      kind: "ExprLambda";
      params: ResolvedPattern[];
      body: ResolvedExpr;
      span: Span;
    }
  | {
      kind: "ExprLet";
      bindings: ResolvedLetBinding[];
      body: ResolvedExpr;
      span: Span;
    }
  | {
      kind: "ExprCase";
      scrutinee: ResolvedExpr;
      branches: ResolvedCaseBranch[];
      span: Span;
    }
  | {
      kind: "ExprInfix";
      op: InfixOp;
      opSpan: Span;
      opRef: MaybeResolvedRef;
      left: ResolvedExpr;
      right: ResolvedExpr;
      span: Span;
    }
  | { kind: "ExprParen"; inner: ResolvedExpr; span: Span };

export interface ResolvedRecordFieldValue {
  name: string;
  nameSpan: Span;
  value: ResolvedExpr;
  span: Span;
}

export interface ResolvedLetBinding {
  binder: LocalBinder;
  params: ResolvedPattern[];
  body: ResolvedExpr;
  span: Span;
}

export interface ResolvedCaseBranch {
  pattern: ResolvedPattern;
  body: ResolvedExpr;
  span: Span;
}

// ---------- Resolved declarations ----------

export type ResolvedDecl =
  | ResolvedDeclTypeAlias
  | ResolvedDeclVariant
  | ResolvedDeclSignature
  | ResolvedDeclDefinition;

export interface ResolvedDeclTypeAlias {
  kind: "DeclTypeAlias";
  defId: DefId;
  name: string;
  nameSpan: Span;
  body: ResolvedType;
  // Signature-scoped type variables introduced by the alias RHS have no
  // dedicated `type Foo a =` parameter list in the Parsed AST for
  // `preview-web-1`; aliases in this profile are non-parameterized.
  span: Span;
}

export interface ResolvedDeclVariant {
  kind: "DeclVariant";
  defId: DefId;
  name: string;
  nameSpan: Span;
  alternatives: ResolvedVariantAlt[];
  span: Span;
}

export interface ResolvedVariantAlt {
  defId: DefId;
  name: string;
  nameSpan: Span;
  payload: ResolvedVariantPayload;
  span: Span;
}

export type ResolvedVariantPayload =
  | { kind: "None" }
  | { kind: "Type"; type: ResolvedType }
  | { kind: "Record"; fields: ResolvedTypeRecordField[]; span: Span };

export interface ResolvedDeclSignature {
  kind: "DeclSignature";
  // Points at the shared top-level term identity for this name.
  defId: DefId;
  name: string;
  nameSpan: Span;
  type: ResolvedType;
  span: Span;
}

export interface ResolvedDeclDefinition {
  kind: "DeclDefinition";
  // Same DefId shared with any signature and every equation for this name.
  defId: DefId;
  name: string;
  nameSpan: Span;
  params: ResolvedPattern[];
  body: ResolvedExpr | null;
  guards: ResolvedGuardedRhs[] | null;
  span: Span;
}

export interface ResolvedGuardedRhs {
  condition: ResolvedExpr;
  body: ResolvedExpr;
  span: Span;
}

// ---------- Resolved module + interface ----------

export interface ResolvedImport {
  path: string[];
  pathSpan: Span;
  kind: "selected" | "qualified";
  targetModule: ModuleId; // resolved from `path`
  targetModuleId: DefId; // module namespace identity
  selected: ResolvedSelectedImport[] | null;
  alias: { name: string; span: Span; moduleDefId: DefId } | null;
  span: Span;
}

export interface ResolvedSelectedImport {
  name: string;
  span: Span;
  // A selected import brings either a term ref (function/constructor) or a
  // type ref (or both, if the name was `Type (..)`).
  termRef: ResolvedRef | null;
  typeRef: ResolvedRef | null;
  // Constructor DefIds introduced by a `Type (..)` selected import.
  constructorRefs: ResolvedRef[];
}

export interface ResolvedModule {
  moduleId: ModuleId;
  moduleDefId: DefId; // module-namespace identity
  file: string;
  nameSpan: Span;
  exports: ExportSpec[]; // preserved from parsed AST (validated separately)
  imports: ResolvedImport[];
  declarations: ResolvedDecl[];
  span: Span;
}

export interface ResolvedModuleInterface {
  moduleId: ModuleId;
  moduleDefId: DefId;
  exportedTypes: Map<string, DefId>;
  exportedTerms: Map<string, DefId>;
  // Constructors made externally visible via `Type (..)` are indexed by owner
  // type DefId. Each entry lists the constructor DefIds in declaration order.
  exportedConstructorsByType: Map<DefId, DefId[]>;
}

// ---------- Program-level result ----------

export interface ResolvedProgram {
  entryModule: ModuleId;
  modules: Map<ModuleId, ResolvedModule>;
  interfaces: Map<ModuleId, ResolvedModuleInterface>;
  definitions: Map<number, DefinitionRecord>;
  // Ordered list of module IDs in a legal load order (topological).
  loadOrder: ModuleId[];
  prelude: PreludeInterface;
}

// ---------- Prelude ----------

export interface PreludeInterface {
  types: Map<string, DefId>;
  terms: Map<string, DefId>;
  // Constructors registered against prelude nominal types (List, Maybe).
  constructorsByType: Map<DefId, DefId[]>;
  operators: Map<InfixOp, DefId>;
}

// ---------- Re-exports from parsed AST for convenience ----------

export type {
  Decl,
  ExportSpec,
  ImportDecl,
  Module,
  Pattern,
  TypeNode,
  Expr,
  RecordFieldValue,
  TypeRecordField,
  VariantAlt,
  GuardedRhs,
  CaseBranch,
  LetBinding,
  InfixOp,
};
