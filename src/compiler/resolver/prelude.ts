// Synthetic preview Prelude interface.
//
// preview-web-1 does not read a physical Prelude.blk. The compiler ships an
// in-memory interface providing only the identifiers the preview grammar or
// existing examples require. See phase-03.md §39 — do not add speculative
// entries here even if they might be useful later.

import type { PreludeInterface, DefId, DefinitionRecord, InfixOp } from "./types.js";
import type { DefIdAllocator } from "./defid.js";

const PRELUDE_TYPES = ["Int", "Float", "Bool", "Text", "List", "Maybe"] as const;

// `Some` and `None` are the observable constructors of `Maybe` (see
// DEMO_PROFILE §7.11). `otherwise` is required by guarded equations.
const PRELUDE_TERMS = ["otherwise"] as const;

// Note: `Some` / `None` are added as constructors of the prelude `Maybe`
// type below.
const PRELUDE_OPERATORS: InfixOp[] = [
  "+", "-", "*", "/", "==", "<", "<=", ">", ">=",
];

export interface PreludeBuildResult {
  prelude: PreludeInterface;
  definitions: DefinitionRecord[];
}

export function buildPrelude(alloc: DefIdAllocator): PreludeInterface {
  const types = new Map<string, DefId>();
  const terms = new Map<string, DefId>();
  const constructorsByType = new Map<DefId, DefId[]>();
  const operators = new Map<InfixOp, DefId>();

  for (const name of PRELUDE_TYPES) {
    types.set(name, alloc.fresh());
  }

  for (const name of PRELUDE_TERMS) {
    terms.set(name, alloc.fresh());
  }

  // Maybe constructors — Some and None are frozen for preview-web-1.
  const maybeId = types.get("Maybe")!;
  const someId = alloc.fresh();
  const noneId = alloc.fresh();
  terms.set("Some", someId);
  terms.set("None", noneId);
  constructorsByType.set(maybeId, [someId, noneId]);

  // List is a prelude nominal type with no user-visible constructors in this
  // preview — literal `[...]` syntax replaces them. Register an empty list.
  const listId = types.get("List")!;
  constructorsByType.set(listId, []);

  for (const op of PRELUDE_OPERATORS) {
    operators.set(op, alloc.fresh());
  }

  return { types, terms, constructorsByType, operators };
}

// Materialize DefinitionRecords for the prelude so callers can look up any
// DefId (including operator IDs) in the program's definitions map. This is
// invoked by `collect` to seed the master definitions table.
export function preludeDefinitions(prelude: PreludeInterface): DefinitionRecord[] {
  const out: DefinitionRecord[] = [];

  for (const [name, id] of prelude.types) {
    out.push({
      id,
      namespace: "type",
      category: "preludeType",
      name,
      origin: { kind: "prelude" },
      constructors: prelude.constructorsByType.get(id) ?? [],
    });
  }

  // Reverse-index constructors → owner type.
  const ownerByConstructor = new Map<number, DefId>();
  for (const [ownerId, ctors] of prelude.constructorsByType) {
    for (const c of ctors) ownerByConstructor.set(c.value, ownerId);
  }

  for (const [name, id] of prelude.terms) {
    const owner = ownerByConstructor.get(id.value);
    if (owner !== undefined) {
      out.push({
        id,
        namespace: "term",
        category: "constructor",
        name,
        origin: { kind: "prelude" },
        ownerType: owner,
      });
    } else {
      out.push({
        id,
        namespace: "term",
        category: "preludeTerm",
        name,
        origin: { kind: "prelude" },
        hasSignature: false,
      });
    }
  }

  for (const [op, id] of prelude.operators) {
    out.push({
      id,
      namespace: "term",
      category: "operator",
      name: op,
      origin: { kind: "operator", op },
      hasSignature: false,
    });
  }

  return out;
}
