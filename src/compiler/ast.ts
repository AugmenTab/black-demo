// Parsed AST for the Black preview grammar.
//
// The Parsed AST preserves the shape of surface syntax. Later phases (name
// resolution, typechecking) may build derived IRs; nothing in this AST is
// desugared away.

import type { Span } from "./source.js";

// ---------- Types ----------

export type TypeNode =
  | TypeVar
  | TypeCon
  | TypeApp
  | TypeFun
  | TypeRecord
  | TypeParen
  | TypeUnit;

export interface TypeUnit {
  kind: "TypeUnit";
  span: Span;
}

export interface TypeVar {
  kind: "TypeVar";
  name: string;
  span: Span;
}

export interface TypeCon {
  kind: "TypeCon";
  // Qualified type reference. The last component is the type name; earlier
  // components form the module path (e.g. Game.Model.Player).
  path: string[];
  span: Span;
}

export interface TypeApp {
  kind: "TypeApp";
  head: TypeNode;
  arg: TypeNode; // application is curried; multi-arg is nested left.
  span: Span;
}

export interface TypeFun {
  kind: "TypeFun";
  from: TypeNode;
  to: TypeNode;
  span: Span;
}

export interface TypeRecord {
  kind: "TypeRecord";
  fields: TypeRecordField[];
  span: Span;
}

export interface TypeRecordField {
  name: string;
  nameSpan: Span;
  fieldType: TypeNode;
  span: Span;
}

export interface TypeParen {
  kind: "TypeParen";
  inner: TypeNode;
  span: Span;
}

// ---------- Patterns ----------

export type Pattern =
  | PatternVar
  | PatternWildcard
  | PatternInt
  | PatternFloat
  | PatternString
  | PatternBool
  | PatternCon
  | PatternRecord;

export interface PatternVar {
  kind: "PatternVar";
  name: string;
  span: Span;
}

export interface PatternWildcard {
  kind: "PatternWildcard";
  span: Span;
}

export interface PatternInt {
  kind: "PatternInt";
  value: number;
  text: string;
  span: Span;
}

export interface PatternFloat {
  kind: "PatternFloat";
  value: number;
  text: string;
  span: Span;
}

export interface PatternString {
  kind: "PatternString";
  value: string;
  span: Span;
}

export interface PatternBool {
  kind: "PatternBool";
  value: boolean;
  span: Span;
}

export interface PatternCon {
  kind: "PatternCon";
  // For a module-qualified constructor pattern `Alias.Ctor arg…` or
  // `Mod.Sub.Ctor arg…`, `qualifier.parts` holds the module-path segments in
  // source order (length ≥ 1). `name` is always the terminal constructor.
  qualifier: { parts: { name: string; span: Span }[]; span: Span } | null;
  name: string;
  nameSpan: Span;
  args: Pattern[];
  span: Span;
}

export interface PatternRecord {
  kind: "PatternRecord";
  // Optional leading constructor: Point { x = px, y = py }.
  constructor: { name: string; span: Span } | null;
  fields: PatternRecordField[];
  span: Span;
}

export interface PatternRecordField {
  name: string;
  nameSpan: Span;
  pattern: Pattern;
  span: Span;
}

// ---------- Expressions ----------

export type Expr =
  | ExprInt
  | ExprFloat
  | ExprString
  | ExprBool
  | ExprVar
  | ExprCon
  | ExprApp
  | ExprField
  | ExprRecord
  | ExprRecordUpdate
  | ExprList
  | ExprLambda
  | ExprLet
  | ExprCase
  | ExprInfix
  | ExprParen
  | ExprUnit;

export interface ExprUnit {
  kind: "ExprUnit";
  span: Span;
}

export interface ExprInt { kind: "ExprInt"; value: number; text: string; span: Span }
export interface ExprFloat { kind: "ExprFloat"; value: number; text: string; span: Span }
export interface ExprString { kind: "ExprString"; value: string; span: Span }
export interface ExprBool { kind: "ExprBool"; value: boolean; span: Span }
export interface ExprVar { kind: "ExprVar"; name: string; span: Span }
export interface ExprCon { kind: "ExprCon"; name: string; span: Span }

export interface ExprApp {
  kind: "ExprApp";
  fn: Expr;
  arg: Expr;
  span: Span;
}

export interface ExprField {
  kind: "ExprField";
  record: Expr;
  field: string;
  fieldSpan: Span;
  span: Span;
}

export interface ExprRecord {
  kind: "ExprRecord";
  fields: RecordFieldValue[];
  span: Span;
}

export interface RecordFieldValue {
  name: string;
  nameSpan: Span;
  value: Expr;
  span: Span;
}

export interface ExprRecordUpdate {
  kind: "ExprRecordUpdate";
  record: Expr;
  fields: RecordFieldValue[];
  span: Span;
}

export interface ExprList {
  kind: "ExprList";
  elements: Expr[];
  span: Span;
}

export interface ExprLambda {
  kind: "ExprLambda";
  params: Pattern[];
  body: Expr;
  span: Span;
}

export interface ExprLet {
  kind: "ExprLet";
  bindings: LetBinding[];
  body: Expr;
  span: Span;
}

export interface LetBinding {
  name: string;
  nameSpan: Span;
  params: Pattern[];
  body: Expr;
  span: Span;
}

export interface ExprCase {
  kind: "ExprCase";
  scrutinee: Expr;
  branches: CaseBranch[];
  span: Span;
}

export interface CaseBranch {
  pattern: Pattern;
  body: Expr;
  span: Span;
}

export interface ExprInfix {
  kind: "ExprInfix";
  op: InfixOp;
  opSpan: Span;
  left: Expr;
  right: Expr;
  span: Span;
}

export type InfixOp = "+" | "-" | "*" | "/" | "==" | "<" | "<=" | ">" | ">=";

export interface ExprParen {
  kind: "ExprParen";
  inner: Expr;
  span: Span;
}

// ---------- Declarations ----------

export type Decl =
  | DeclTypeAlias
  | DeclVariant
  | DeclSignature
  | DeclDefinition;

export interface DeclTypeAlias {
  kind: "DeclTypeAlias";
  name: string;
  nameSpan: Span;
  body: TypeNode;
  span: Span;
}

export interface DeclVariant {
  kind: "DeclVariant";
  name: string;
  nameSpan: Span;
  alternatives: VariantAlt[];
  span: Span;
}

export interface VariantAlt {
  name: string;
  nameSpan: Span;
  payload: VariantPayload;
  span: Span;
}

export type VariantPayload =
  | { kind: "None" }
  | { kind: "Type"; type: TypeNode }
  | { kind: "Record"; fields: TypeRecordField[]; span: Span };

export interface DeclSignature {
  kind: "DeclSignature";
  name: string;
  nameSpan: Span;
  type: TypeNode;
  span: Span;
}

export interface DeclDefinition {
  kind: "DeclDefinition";
  name: string;
  nameSpan: Span;
  params: Pattern[];
  // Exactly one of `body` (plain =) or `guards` (guarded equation) is set.
  body: Expr | null;
  guards: GuardedRhs[] | null;
  span: Span;
}

export interface GuardedRhs {
  condition: Expr;
  body: Expr;
  span: Span;
}

// ---------- Module ----------

export interface ExportSpec {
  name: string;
  nameSpan: Span;
  kind: "term" | "type" | "typeAll";  // typeAll -> `Name (..)`
  span: Span;
}

export interface ImportDecl {
  path: string[];
  pathSpan: Span;
  // A `preview-web-1` import is EITHER a selected-name import OR a
  // qualified-as import; the hybrid form is intentionally not supported.
  kind: "selected" | "qualified";
  selected: SelectedImport[] | null;
  alias: { name: string; span: Span } | null;
  span: Span;
}

export interface SelectedImport {
  name: string;
  span: Span;
}

export interface Module {
  kind: "Module";
  name: string[];
  nameSpan: Span;
  exports: ExportSpec[];
  imports: ImportDecl[];
  declarations: Decl[];
  span: Span;
}
