// Phase-4 Prelude typing table.
//
// Keyed by the existing Prelude DefIds from name resolution (§14). This
// module does NOT allocate new identities — the resolver already created
// them; the typechecker consumes them.

import type { DefId, InfixOp, PreludeInterface } from "../resolver/types.js";
import type { Scheme, Ty, TyRigid } from "./types.js";
import {
  monoScheme,
  tyCon,
  tyFun,
  tyRigid,
} from "./types.js";
import type { TypeConEnv } from "./env.js";
import { registerTyCon } from "./env.js";
import type { SchemeEnv } from "./env.js";

export interface PreludeTypes {
  int: DefId;
  float: DefId;
  bool: DefId;
  text: DefId;
  unit: DefId; // not actually a TyCon — TyUnit is used directly; reserved.
  list: DefId;
  maybe: DefId;
}

// One of the four preview operator typing families (§43). The typechecker
// dispatches on this by consulting the *resolved* Prelude DefId on
// `ExprInfix.opRef` — never on the source spelling. `displayName` is the
// canonical spelling and is used only for human-facing diagnostics.
export type PreviewOperatorRuleKind =
  | "arithmetic" // + - * : Int/Int→Int OR Float/Float→Float
  | "divide"     // /     : Float/Float→Float only
  | "compare"    // < <= > >= : (Int|Float)²→Bool
  | "equal";     // ==    : same-type scalar/Unit→Bool

export interface PreviewOperatorRule {
  kind: PreviewOperatorRuleKind;
  displayName: InfixOp;
}

export interface BuiltPrelude {
  types: PreludeTypes;
  tyInt: Ty;
  tyFloat: Ty;
  tyBool: Ty;
  tyText: Ty;
  // Named operator schemes: caller uses the exact operator identity to select
  // one of the fixed preview typing rules (§43).
  operators: Map<InfixOp, DefId>;
  // Identity-keyed operator typing rules (phase-04_2.md §7-8). Keyed by the
  // Prelude operator's DefId.value. The typechecker's operator dispatch MUST
  // consult this table via `ExprInfix.opRef`, not the source spelling.
  operatorRuleByDefId: Map<number, PreviewOperatorRule>;
  // The Prelude `otherwise` term DefId (typed as Bool).
  otherwiseId: DefId | null;
}

// Populate `env` with entries for every prelude type and register schemes
// for prelude terms and operators (§14, §43). Returns pointers to the
// prelude type DefIds so the converter and inference layer can consult
// them without repeated map lookups.
export function installPrelude(
  prelude: PreludeInterface,
  env: TypeConEnv,
  schemes: SchemeEnv,
): BuiltPrelude {
  const int = prelude.types.get("Int")!;
  const float = prelude.types.get("Float")!;
  const bool = prelude.types.get("Bool")!;
  const text = prelude.types.get("Text")!;
  const list = prelude.types.get("List")!;
  const maybe = prelude.types.get("Maybe")!;

  registerTyCon(env, int, { kind: "primitive", name: "Int", arity: 0 });
  registerTyCon(env, float, { kind: "primitive", name: "Float", arity: 0 });
  registerTyCon(env, bool, { kind: "primitive", name: "Bool", arity: 0 });
  registerTyCon(env, text, { kind: "primitive", name: "Text", arity: 0 });
  registerTyCon(env, list, { kind: "builtinParam", name: "List", arity: 1 });
  registerTyCon(env, maybe, { kind: "builtinParam", name: "Maybe", arity: 1 });

  const tyInt = tyCon(int);
  const tyFloat = tyCon(float);
  const tyBool = tyCon(bool);
  const tyText = tyCon(text);

  // Prelude terms.
  const otherwiseId = prelude.terms.get("otherwise") ?? null;
  if (otherwiseId !== null) {
    schemes.byDefId.set(otherwiseId.value, monoScheme(tyBool));
  }

  // Maybe constructors: `Some :: forall a. a -> Maybe a`; `None :: forall a. Maybe a`.
  const someId = prelude.terms.get("Some");
  const noneId = prelude.terms.get("None");
  if (someId && noneId) {
    // The rigid var identity here is synthetic — the resolver did not allocate a
    // type-variable DefId for the builtin `Maybe`. We reuse the `maybe` type
    // DefId only for its `.value` uniqueness. Real rigid comparison happens by
    // .id.value, and since these rigids are quantified and freshly instantiated
    // at each use site, no external identity leaks.
    const a: TyRigid = tyRigid({ value: -someId.value }, "a");
    const someTy: Ty = tyFun(a, tyCon(maybe, [a]));
    schemes.byDefId.set(someId.value, { rigids: [a], ty: someTy });

    const b: TyRigid = tyRigid({ value: -noneId.value }, "a");
    const noneTy: Ty = tyCon(maybe, [b]);
    schemes.byDefId.set(noneId.value, { rigids: [b], ty: noneTy });
  }

  // Operators (§43). Each operator's DefId can appear in multiple typing
  // rules (`+ :: Int -> Int -> Int` OR `+ :: Float -> Float -> Float`).
  // These are handled specially in inference rather than as monomorphic
  // schemes — see `inferInfix` in infer.ts. We still register a placeholder
  // scheme so `zonk`/scheme lookup doesn't crash if some code path reaches
  // through a variable reference.
  const opInt = tyFun(tyInt, tyFun(tyInt, tyInt));
  const operatorRuleByDefId = new Map<number, PreviewOperatorRule>();
  for (const [op, id] of prelude.operators) {
    schemes.byDefId.set(id.value, monoScheme(opInt));
    operatorRuleByDefId.set(id.value, { kind: ruleKindFor(op), displayName: op });
  }

  return {
    types: {
      int,
      float,
      bool,
      text,
      unit: int, // unused; kept for shape
      list,
      maybe,
    },
    tyInt,
    tyFloat,
    tyBool,
    tyText,
    operators: prelude.operators,
    operatorRuleByDefId,
    otherwiseId,
  };
}

// Static classification of each supported preview operator spelling into
// its typing family. This is applied ONCE at Prelude install time to seed
// `operatorRuleByDefId`; thereafter the typechecker consults the resolved
// DefId, not the spelling.
function ruleKindFor(op: InfixOp): PreviewOperatorRuleKind {
  switch (op) {
    case "+":
    case "-":
    case "*":
      return "arithmetic";
    case "/":
      return "divide";
    case "<":
    case "<=":
    case ">":
    case ">=":
      return "compare";
    case "==":
      return "equal";
  }
}
