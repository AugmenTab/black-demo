// Maranget-style pattern-matrix exhaustiveness checker (§47, §48, §49).
//
// Operates on the Typed AST once inference has settled every pattern type
// (§56). The algorithm is a small recursive coverage check over a matrix of
// pattern rows plus a parallel vector of column types.
//
// Constructor semantics use resolved constructor identities and typed
// patterns, not spellings (§47). Ints/Floats/Text literals cannot prove
// exhaustiveness — a catch-all is required (§48). Bool is exhausted by True
// and False together. Closed variants are exhausted by all constructor
// identities together. Records are treated as one constructor with typed
// field components.

import type { DefId } from "../resolver/types.js";
import type { Ty } from "./types.js";
import type { TypeConEnv } from "./env.js";
import { lookupTyCon } from "./env.js";
import type { MetaStore } from "./subst.js";
import type { TypedPattern } from "./typed-ast.js";

// A "matrix" is rows of patterns; every row has the same column count.
export interface Matrix {
  rows: TypedPattern[][];
  colTypes: Ty[];
}

// Return true when the matrix covers every value of `colTypes`.
export function isExhaustive(m: Matrix, env: TypeConEnv, store: MetaStore): boolean {
  return specialize(m, env, store);
}

// A single-column, single-row wildcard matrix over the given type is
// trivially exhaustive; a matrix with zero columns is exhaustive iff it has
// at least one row.
function specialize(m: Matrix, env: TypeConEnv, store: MetaStore): boolean {
  if (m.colTypes.length === 0) return m.rows.length > 0;

  // Focus on the leftmost column.
  const colTy = normalizeAliasTy(store.prune(m.colTypes[0]!), env);

  // If no rows have a non-wildcard pattern in the leftmost column, then a
  // wildcard suffices only if the remaining columns are exhaustive under
  // any residual row that starts with wildcard/var.
  const heads = m.rows.map((r) => headKind(r[0]!));

  // If any row starts with wildcard/var, drop that column and continue over
  // the specialized matrix (all rows contribute), since a wildcard covers
  // every constructor.
  const hasCatchAll = heads.some((h) => h === "wild");
  if (hasCatchAll) {
    // Specialize by removing the first column for all rows. If any row has
    // a wildcard/var head, it collapses; rows with a constructor head also
    // collapse their columns (they still constrain later columns for the
    // residual, but for pure coverage the wildcard row makes the remainder
    // reduce to the tail matrix).
    const tail = tailMatrix(m);
    return specialize(tail, env, store);
  }

  // No wildcard row. We must check every possible constructor of `colTy`.
  const cons = allConstructors(colTy, env);
  if (cons === "unknown") {
    // Infinite/unknown value space (Int, Float, Text, unresolved meta, etc.)
    // — no catch-all means not exhaustive.
    return false;
  }
  for (const c of cons) {
    const specialized = specializeConstructor(m, c, env);
    if (specialized === null) return false; // no rows match this constructor
    if (!specialize(specialized, env, store)) return false;
  }
  return true;
}

// Missing constructors of the leftmost column that no row covers. Used by
// case-branch diagnostics.
export function missingConstructors(
  m: Matrix,
  env: TypeConEnv,
  store: MetaStore,
): { kind: "variant"; names: string[] } | { kind: "openScalar" } | { kind: "none" } {
  if (m.colTypes.length === 0) {
    return m.rows.length > 0 ? { kind: "none" } : { kind: "openScalar" };
  }
  const colTy = normalizeAliasTy(store.prune(m.colTypes[0]!), env);
  const heads = m.rows.map((r) => headKind(r[0]!));
  if (heads.some((h) => h === "wild")) {
    const tail = tailMatrix(m);
    return missingConstructors(tail, env, store);
  }
  const cons = allConstructors(colTy, env);
  if (cons === "unknown") return { kind: "openScalar" };
  const missing: string[] = [];
  for (const c of cons) {
    const specialized = specializeConstructor(m, c, env);
    if (specialized === null) {
      missing.push(c.name);
      continue;
    }
    const sub = missingConstructors(specialized, env, store);
    if (sub.kind === "openScalar") return sub;
    if (sub.kind === "variant" && sub.names.length > 0) {
      missing.push(...sub.names.map((n) => `${c.name} <${n}>`));
    }
  }
  if (missing.length === 0) return { kind: "none" };
  return { kind: "variant", names: missing };
}

function headKind(p: TypedPattern): "wild" | "ctor" | "record" | "lit" {
  switch (p.kind) {
    case "PatternWildcard":
    case "PatternVar":
      return "wild";
    case "PatternCon":
      return "ctor";
    case "PatternRecord":
      return "record";
    case "PatternInt":
    case "PatternFloat":
    case "PatternString":
    case "PatternBool":
      return "lit";
  }
}

// Drop the leftmost column for each row (rows preserved unconditionally).
function tailMatrix(m: Matrix): Matrix {
  return {
    rows: m.rows.map((r) => r.slice(1)),
    colTypes: m.colTypes.slice(1),
  };
}

interface ConDesc {
  // A distinguishing tag: constructor DefId for variant constructors, a
  // literal encoding for scalars, or "record" for structural records.
  kind: "variant" | "bool" | "record";
  id?: DefId; // variant only
  name: string;
  boolValue?: boolean;
  // The types introduced into the pattern matrix by specializing on this
  // constructor.
  subTypes: Ty[];
  // Ordered field names for record specialization.
  recordFields?: string[];
}

function allConstructors(ty: Ty, env: TypeConEnv): ConDesc[] | "unknown" {
  if (ty.kind === "TyCon") {
    const info = lookupTyCon(env, ty.con);
    if (!info) return "unknown";
    if (info.kind === "primitive") {
      if (info.name === "Bool") {
        return [
          { kind: "bool", name: "True", boolValue: true, subTypes: [] },
          { kind: "bool", name: "False", boolValue: false, subTypes: [] },
        ];
      }
      return "unknown"; // Int/Float/Text — infinite space
    }
    if (info.kind === "builtinParam") {
      if (info.name === "Maybe") {
        const arg = ty.args[0]!;
        return [
          { kind: "variant", name: "Some", subTypes: [arg] },
          { kind: "variant", name: "None", subTypes: [] },
        ];
      }
      // List has no user pattern support in preview-web-1 (§48). Only a
      // catch-all can exhaust it.
      return "unknown";
    }
    if (info.kind === "variant") {
      const out: ConDesc[] = [];
      for (const c of info.constructors) {
        out.push({
          kind: "variant",
          id: c.id,
          name: c.name,
          subTypes: c.payload === null ? [] : [c.payload],
        });
      }
      return out;
    }
    if (info.kind === "alias") {
      return allConstructors(info.body, env);
    }
  }
  if (ty.kind === "TyRecord") {
    return [
      {
        kind: "record",
        name: "<record>",
        subTypes: ty.fields.map((f) => f.ty),
        recordFields: ty.fields.map((f) => f.name),
      },
    ];
  }
  if (ty.kind === "TyUnit") {
    // Unit has a single inhabitant. No dedicated pattern syntax yet
    // (§48 — a wildcard/variable suffices). Model it as a single "record"
    // constructor with zero fields — any wildcard covers it, so with no
    // catch-all in a row, missing coverage is the "unit" constructor.
    return [{ kind: "record", name: "()", subTypes: [] }];
  }
  return "unknown";
}

// Specialize the matrix on constructor `c`: keep only rows whose head is
// either a wildcard/variable or the same constructor; expand the head into
// the constructor's sub-patterns. Returns `null` when no row matches (used
// for missing-constructor diagnostics).
function specializeConstructor(m: Matrix, c: ConDesc, env: TypeConEnv): Matrix | null {
  const rows: TypedPattern[][] = [];
  let touched = false;
  for (const row of m.rows) {
    const head = row[0]!;
    const rest = row.slice(1);
    switch (head.kind) {
      case "PatternWildcard":
      case "PatternVar": {
        const filler: TypedPattern[] = c.subTypes.map((t) => wildcardOf(t, head.span));
        rows.push([...filler, ...rest]);
        touched = true;
        break;
      }
      case "PatternBool":
        if (c.kind === "bool" && head.value === c.boolValue) {
          rows.push(rest);
          touched = true;
        }
        break;
      case "PatternCon":
        if (c.kind === "variant" && c.id && head.ref.value === c.id.value) {
          // Head has zero or one sub-pattern (§40).
          rows.push([...head.args, ...rest]);
          touched = true;
        }
        break;
      case "PatternRecord":
        if (c.kind === "record") {
          const fillerByName = new Map<string, TypedPattern>();
          for (const f of head.fields) fillerByName.set(f.name, f.pattern);
          const parts: TypedPattern[] = (c.recordFields ?? []).map((name) => {
            const p = fillerByName.get(name);
            if (p) return p;
            // Omitted field — wildcard component (§37).
            return {
              kind: "PatternWildcard",
              ty: c.subTypes[c.recordFields!.indexOf(name)]!,
              span: head.span,
            };
          });
          rows.push([...parts, ...rest]);
          touched = true;
        }
        break;
      case "PatternInt":
      case "PatternFloat":
      case "PatternString":
        // Never contribute to variant/bool/record specialization.
        break;
    }
  }
  if (!touched) return null;
  // New column types: constructor sub-types followed by the tail column
  // types.
  const newCols = [...c.subTypes, ...m.colTypes.slice(1)];
  return { rows, colTypes: newCols };
}

function wildcardOf(ty: Ty, span: TypedPattern["span"]): TypedPattern {
  return { kind: "PatternWildcard", ty, span };
}

function normalizeAliasTy(t: Ty, env: TypeConEnv): Ty {
  let cur = t;
  while (cur.kind === "TyCon" && cur.args.length === 0) {
    const info = lookupTyCon(env, cur.con);
    if (!info || info.kind !== "alias") return cur;
    cur = info.body;
  }
  return cur;
}
