// Program-wide typing environment: type-constructor metadata + term
// schemes. Built once before any function body is checked (§8, §57).

import type { DefId } from "../resolver/types.js";
import type { Scheme, Ty } from "./types.js";

// Metadata for a semantic type identity. Every `DefId` reachable as a type
// name in the resolved program is registered here.
export type TyConInfo =
  | { kind: "primitive"; name: string; arity: 0 }
  | { kind: "builtinParam"; name: string; arity: number }
  | { kind: "alias"; name: string; arity: 0; body: Ty }
  | {
      kind: "variant";
      name: string;
      arity: 0;
      // Ordered constructor DefIds. Each carries its payload type (or `null`
      // for a nullary alternative).
      constructors: VariantConstructor[];
    };

export interface VariantConstructor {
  id: DefId;
  name: string;
  payload: Ty | null;
}

export interface TypeConEnv {
  byDefId: Map<number, TyConInfo>;
}

export function makeTypeConEnv(): TypeConEnv {
  return { byDefId: new Map() };
}

export function registerTyCon(env: TypeConEnv, id: DefId, info: TyConInfo): void {
  env.byDefId.set(id.value, info);
}

export function lookupTyCon(env: TypeConEnv, id: DefId): TyConInfo | undefined {
  return env.byDefId.get(id.value);
}

// A term scheme table indexed by resolved DefId (§57).
export interface SchemeEnv {
  byDefId: Map<number, Scheme>;
}

export function makeSchemeEnv(): SchemeEnv {
  return { byDefId: new Map() };
}
