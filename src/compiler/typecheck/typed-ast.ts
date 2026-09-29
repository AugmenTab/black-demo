// Typed AST produced by the Phase-4 typechecker.
//
// A `TypedProgram` is a distinct data structure from `ResolvedProgram` (§55).
// It preserves resolver identities, source spans, and expression/pattern
// shape, while annotating every expression and pattern node with its
// inferred type and every top-level term with its declared scheme.

import type { DefId, InfixOp, LocalBinder, ModuleId } from "../resolver/types.js";
import type { Span } from "../source.js";
import type { Scheme, Ty } from "./types.js";
import type { TypeConEnv, SchemeEnv } from "./env.js";

export type TypedExpr =
  | { kind: "ExprInt"; value: number; text: string; ty: Ty; span: Span }
  | { kind: "ExprFloat"; value: number; text: string; ty: Ty; span: Span }
  | { kind: "ExprString"; value: string; ty: Ty; span: Span }
  | { kind: "ExprBool"; value: boolean; ty: Ty; span: Span }
  | { kind: "ExprUnit"; ty: Ty; span: Span }
  | { kind: "ExprVarRef"; ref: DefId; name: string; ty: Ty; span: Span }
  | { kind: "ExprConRef"; ref: DefId; name: string; ty: Ty; span: Span }
  | {
      kind: "ExprQualified";
      alias: string;
      moduleId: ModuleId | null;
      ref: DefId;
      name: string;
      ty: Ty;
      span: Span;
    }
  | { kind: "ExprApp"; fn: TypedExpr; arg: TypedExpr; ty: Ty; span: Span }
  | { kind: "ExprField"; record: TypedExpr; field: string; ty: Ty; span: Span }
  | {
      kind: "ExprRecord";
      fields: { name: string; value: TypedExpr; span: Span }[];
      ty: Ty;
      span: Span;
    }
  | {
      kind: "ExprRecordUpdate";
      record: TypedExpr;
      fields: { name: string; value: TypedExpr; span: Span }[];
      ty: Ty;
      span: Span;
    }
  | { kind: "ExprList"; elements: TypedExpr[]; ty: Ty; span: Span }
  | {
      kind: "ExprLambda";
      params: TypedPattern[];
      body: TypedExpr;
      ty: Ty;
      span: Span;
    }
  | {
      kind: "ExprLet";
      bindings: TypedLetBinding[];
      body: TypedExpr;
      ty: Ty;
      span: Span;
    }
  | {
      kind: "ExprCase";
      scrutinee: TypedExpr;
      branches: TypedCaseBranch[];
      ty: Ty;
      span: Span;
    }
  | {
      kind: "ExprInfix";
      op: InfixOp;
      left: TypedExpr;
      right: TypedExpr;
      ty: Ty;
      span: Span;
    };

export interface TypedLetBinding {
  binder: LocalBinder;
  scheme: Scheme;
  params: TypedPattern[];
  body: TypedExpr;
  span: Span;
}

export interface TypedCaseBranch {
  pattern: TypedPattern;
  body: TypedExpr;
  span: Span;
}

export type TypedPattern =
  | { kind: "PatternVar"; binder: LocalBinder; ty: Ty; span: Span }
  | { kind: "PatternWildcard"; ty: Ty; span: Span }
  | { kind: "PatternInt"; value: number; ty: Ty; span: Span }
  | { kind: "PatternFloat"; value: number; ty: Ty; span: Span }
  | { kind: "PatternString"; value: string; ty: Ty; span: Span }
  | { kind: "PatternBool"; value: boolean; ty: Ty; span: Span }
  | {
      kind: "PatternCon";
      ref: DefId;
      name: string;
      args: TypedPattern[];
      ty: Ty;
      span: Span;
    }
  | {
      kind: "PatternRecord";
      constructor: DefId | null;
      fields: { name: string; pattern: TypedPattern; span: Span }[];
      ty: Ty;
      span: Span;
    };

export type TypedDecl =
  | { kind: "TypeAlias"; defId: DefId; name: string; span: Span }
  | { kind: "Variant"; defId: DefId; name: string; span: Span }
  | {
      kind: "Definition";
      defId: DefId;
      name: string;
      scheme: Scheme;
      equations: TypedEquation[];
      span: Span;
    };

export interface TypedEquation {
  params: TypedPattern[];
  body: TypedExpr | null;
  guards: TypedGuardedRhs[] | null;
  span: Span;
}

export interface TypedGuardedRhs {
  condition: TypedExpr;
  body: TypedExpr;
  span: Span;
}

export interface TypedModule {
  moduleId: ModuleId;
  file: string;
  declarations: TypedDecl[];
}

export interface TypedProgram {
  entryModule: ModuleId;
  modules: Map<ModuleId, TypedModule>;
  typeConEnv: TypeConEnv;
  schemeEnv: SchemeEnv;
}
