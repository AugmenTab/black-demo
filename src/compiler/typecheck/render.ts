// Canonical diagnostic type renderer (§54).
//
// Fully applied substitutions must be enforced by callers via `zonk` before
// rendering — this renderer does not consult the substitution store.

import type { Ty } from "./types.js";
import type { TypeConEnv } from "./env.js";
import { lookupTyCon } from "./env.js";

export function renderTy(t: Ty, env: TypeConEnv): string {
  return renderPrec(t, env, /*prec=*/ 0);
}

function renderPrec(t: Ty, env: TypeConEnv, prec: number): string {
  switch (t.kind) {
    case "TyUnit":
      return "()";
    case "TyMeta":
      return `?t${t.id}`;
    case "TyRigid":
      return t.name;
    case "TyError":
      return "<error>";
    case "TyFun": {
      const inner = `${renderPrec(t.from, env, 1)} -> ${renderPrec(t.to, env, 0)}`;
      return prec >= 1 ? `(${inner})` : inner;
    }
    case "TyCon": {
      const info = lookupTyCon(env, t.con);
      const name = info?.name ?? `?con${t.con.value}`;
      if (t.args.length === 0) return name;
      const parts = [name, ...t.args.map((a) => renderPrec(a, env, 2))];
      const joined = parts.join(" ");
      return prec >= 2 ? `(${joined})` : joined;
    }
    case "TyRecord": {
      if (t.fields.length === 0) return "{}";
      const parts = t.fields.map((f) => `${f.name} :: ${renderPrec(f.ty, env, 0)}`);
      return `{ ${parts.join(", ")} }`;
    }
  }
}
