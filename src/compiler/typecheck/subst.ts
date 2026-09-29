// Meta-variable substitution store with path compression.
//
// `TyMeta` values point into this store. Unification writes bindings here;
// `prune` collapses chains lazily. `zonk` fully applies the substitution to
// a type before diagnostics or the Typed AST expose it.

import type { Ty, TyMeta } from "./types.js";
import { tyMeta } from "./types.js";

export class MetaStore {
  private next = 0;
  private bindings = new Map<number, Ty>();

  fresh(): TyMeta {
    return tyMeta(this.next++);
  }

  bind(id: number, ty: Ty): void {
    this.bindings.set(id, ty);
  }

  get(id: number): Ty | undefined {
    return this.bindings.get(id);
  }

  // Follow meta chains until reaching a bound non-meta or an unbound meta.
  // Applies path compression so future lookups are constant time.
  prune(t: Ty): Ty {
    if (t.kind !== "TyMeta") return t;
    const bound = this.bindings.get(t.id);
    if (bound === undefined) return t;
    const target = this.prune(bound);
    if (target !== bound) this.bindings.set(t.id, target);
    return target;
  }

  // Fully apply the substitution to a type. Used before rendering and before
  // returning success (§56).
  zonk(t: Ty): Ty {
    const pruned = this.prune(t);
    switch (pruned.kind) {
      case "TyMeta":
      case "TyRigid":
      case "TyUnit":
      case "TyError":
        return pruned;
      case "TyCon":
        return { kind: "TyCon", con: pruned.con, args: pruned.args.map((a) => this.zonk(a)) };
      case "TyFun":
        return { kind: "TyFun", from: this.zonk(pruned.from), to: this.zonk(pruned.to) };
      case "TyRecord":
        return {
          kind: "TyRecord",
          fields: pruned.fields.map((f) => ({ name: f.name, ty: this.zonk(f.ty) })),
        };
    }
  }

  // Return every unresolved meta id reachable from `t` after `prune`.
  freeMetas(t: Ty, out: Set<number> = new Set()): Set<number> {
    const pruned = this.prune(t);
    switch (pruned.kind) {
      case "TyMeta":
        out.add(pruned.id);
        return out;
      case "TyRigid":
      case "TyUnit":
      case "TyError":
        return out;
      case "TyCon":
        for (const a of pruned.args) this.freeMetas(a, out);
        return out;
      case "TyFun":
        this.freeMetas(pruned.from, out);
        this.freeMetas(pruned.to, out);
        return out;
      case "TyRecord":
        for (const f of pruned.fields) this.freeMetas(f.ty, out);
        return out;
    }
  }
}
