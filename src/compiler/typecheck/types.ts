// Semantic type representation for Phase 4 typechecking.
//
// The typechecker's internal `Ty` is distinct from both the Parsed AST
// `TypeNode` and the Resolved AST `ResolvedType`. Only `Ty` reaches
// unification; converters translate `ResolvedType` → `Ty` up front
// (phase-04.md §6, §7).

import type { DefId } from "../resolver/types.js";

export type Ty =
  | TyCon
  | TyFun
  | TyRecord
  | TyMeta
  | TyRigid
  | TyUnit
  | TyError;

export interface TyCon {
  kind: "TyCon";
  // Semantic identity of the type constructor. For primitives (Int, Bool,
  // Float, Text) and builtin parameterized types (List, Maybe) this is the
  // prelude DefId. For user aliases and variants it is the module-level type
  // DefId.
  con: DefId;
  args: Ty[];
}

export interface TyFun {
  kind: "TyFun";
  from: Ty;
  to: Ty;
}

// Closed structural record. Fields are stored sorted by name so record type
// equality is field-order independent (§32).
export interface TyRecord {
  kind: "TyRecord";
  fields: TyRecordField[];
}

export interface TyRecordField {
  name: string;
  ty: Ty;
}

// Unification variable. `id` is a monotonic identifier managed by the
// typechecker's substitution store.
export interface TyMeta {
  kind: "TyMeta";
  id: number;
}

// Rigid/skolem variable. Used when checking a polymorphic signature's body
// against its declared type (§17). Rigid variables never unify with anything
// but themselves.
export interface TyRigid {
  kind: "TyRigid";
  // The resolver-assigned DefId for the signature type variable; two rigid
  // variables are equal iff their DefIds match.
  id: DefId;
  // Preserved for stable diagnostic rendering.
  name: string;
}

export interface TyUnit {
  kind: "TyUnit";
}

// Poison type used for one-shot error recovery. A `TyError` unifies with
// anything without emitting further diagnostics (§23).
export interface TyError {
  kind: "TyError";
}

export const TyUnitSingleton: TyUnit = { kind: "TyUnit" };
export const TyErrorSingleton: TyError = { kind: "TyError" };

export function tyCon(con: DefId, args: Ty[] = []): TyCon {
  return { kind: "TyCon", con, args };
}

export function tyFun(from: Ty, to: Ty): TyFun {
  return { kind: "TyFun", from, to };
}

export function tyRecord(fields: TyRecordField[]): TyRecord {
  const sorted = [...fields].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { kind: "TyRecord", fields: sorted };
}

export function tyMeta(id: number): TyMeta {
  return { kind: "TyMeta", id };
}

export function tyRigid(id: DefId, name: string): TyRigid {
  return { kind: "TyRigid", id, name };
}

// A type scheme: rank-1 universal quantification over a set of rigid
// identities. Instantiation replaces each rigid with a fresh meta.
export interface Scheme {
  rigids: TyRigid[];
  ty: Ty;
}

export function monoScheme(ty: Ty): Scheme {
  return { rigids: [], ty };
}
