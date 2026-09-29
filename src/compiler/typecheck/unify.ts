// First-order unification for Phase 4 (§21, §22).
//
// Alias transparency: whenever a `TyCon` names a transparent alias we
// substitute the alias body (aliases in `preview-web-1` are non-parameterized
// and cycle-checked at registration time — see convert.ts). Variants and
// primitive/builtin type constructors are compared by DefId with structural
// argument recursion. Records unify structurally with sorted field lists,
// requiring identical labels and componentwise unification.

import type { Ty } from "./types.js";
import type { TypeConEnv } from "./env.js";
import type { MetaStore } from "./subst.js";
import { lookupTyCon } from "./env.js";

export type UnifyOutcome =
  | { ok: true }
  | { ok: false; reason: UnifyFailure };

export type UnifyFailure =
  | { kind: "mismatch"; a: Ty; b: Ty }
  | { kind: "occurs"; metaId: number; ty: Ty }
  | { kind: "recordField"; missing: string[]; extra: string[]; a: Ty; b: Ty };

// Unify two types, mutating the meta store on success. Rigid variables never
// unify with anything but themselves (§17). Error/poison unifies with
// anything and returns success — one type error must not cascade (§23).
export function unify(a: Ty, b: Ty, store: MetaStore, env: TypeConEnv): UnifyOutcome {
  const ap = expandOnce(store.prune(a), env);
  const bp = expandOnce(store.prune(b), env);

  if (ap.kind === "TyError" || bp.kind === "TyError") return { ok: true };

  if (ap.kind === "TyMeta") {
    if (bp.kind === "TyMeta" && ap.id === bp.id) return { ok: true };
    if (occurs(ap.id, bp, store, env)) {
      return { ok: false, reason: { kind: "occurs", metaId: ap.id, ty: bp } };
    }
    store.bind(ap.id, bp);
    return { ok: true };
  }
  if (bp.kind === "TyMeta") {
    if (occurs(bp.id, ap, store, env)) {
      return { ok: false, reason: { kind: "occurs", metaId: bp.id, ty: ap } };
    }
    store.bind(bp.id, ap);
    return { ok: true };
  }

  if (ap.kind === "TyUnit" && bp.kind === "TyUnit") return { ok: true };

  if (ap.kind === "TyRigid" && bp.kind === "TyRigid") {
    if (ap.id.value === bp.id.value) return { ok: true };
    return { ok: false, reason: { kind: "mismatch", a: ap, b: bp } };
  }

  if (ap.kind === "TyFun" && bp.kind === "TyFun") {
    const u1 = unify(ap.from, bp.from, store, env);
    if (!u1.ok) return u1;
    return unify(ap.to, bp.to, store, env);
  }

  if (ap.kind === "TyCon" && bp.kind === "TyCon") {
    if (ap.con.value !== bp.con.value) {
      return { ok: false, reason: { kind: "mismatch", a: ap, b: bp } };
    }
    if (ap.args.length !== bp.args.length) {
      return { ok: false, reason: { kind: "mismatch", a: ap, b: bp } };
    }
    for (let i = 0; i < ap.args.length; i++) {
      const r = unify(ap.args[i]!, bp.args[i]!, store, env);
      if (!r.ok) return r;
    }
    return { ok: true };
  }

  if (ap.kind === "TyRecord" && bp.kind === "TyRecord") {
    const aNames = new Set(ap.fields.map((f) => f.name));
    const bNames = new Set(bp.fields.map((f) => f.name));
    const missing: string[] = [];
    const extra: string[] = [];
    for (const n of aNames) if (!bNames.has(n)) missing.push(n);
    for (const n of bNames) if (!aNames.has(n)) extra.push(n);
    if (missing.length > 0 || extra.length > 0) {
      return { ok: false, reason: { kind: "recordField", missing, extra, a: ap, b: bp } };
    }
    const aMap = new Map(ap.fields.map((f) => [f.name, f.ty] as const));
    for (const f of bp.fields) {
      const other = aMap.get(f.name)!;
      const r = unify(other, f.ty, store, env);
      if (!r.ok) return r;
    }
    return { ok: true };
  }

  return { ok: false, reason: { kind: "mismatch", a: ap, b: bp } };
}

// If the outermost type constructor names a transparent alias, expand it
// once. Aliases in this profile are non-parameterized (§9) so we simply
// substitute the alias body verbatim. Cycles are rejected up front, so
// expansion terminates. Iterative rather than recursive to allow alias
// chains to collapse.
function expandOnce(t: Ty, env: TypeConEnv): Ty {
  let cur = t;
  while (cur.kind === "TyCon" && cur.args.length === 0) {
    const info = lookupTyCon(env, cur.con);
    if (!info || info.kind !== "alias") return cur;
    cur = info.body;
  }
  return cur;
}

// Occurs check (§22): the meta must not appear in the type it is being bound
// to. Aliases expand for the check so that hidden self-reference is caught.
function occurs(metaId: number, t: Ty, store: MetaStore, env: TypeConEnv): boolean {
  const pruned = store.prune(t);
  const expanded = expandOnce(pruned, env);
  switch (expanded.kind) {
    case "TyMeta":
      return expanded.id === metaId;
    case "TyRigid":
    case "TyUnit":
    case "TyError":
      return false;
    case "TyCon":
      return expanded.args.some((a) => occurs(metaId, a, store, env));
    case "TyFun":
      return occurs(metaId, expanded.from, store, env) || occurs(metaId, expanded.to, store, env);
    case "TyRecord":
      return expanded.fields.some((f) => occurs(metaId, f.ty, store, env));
  }
}
