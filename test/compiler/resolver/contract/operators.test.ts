// Contract: every supported preview operator (phase-03_5.md §21–§23) has a
// semantic identity registered by the synthetic Prelude and attached to each
// ExprInfix use site.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";
import type {
  ResolvedDeclDefinition,
  ResolvedExpr,
} from "../../../../src/compiler/resolver/types.js";

const OPS = ["+", "-", "*", "/", "==", "<", "<=", ">", ">="] as const;

function findInfix(e: ResolvedExpr): (ResolvedExpr & { kind: "ExprInfix" }) | null {
  if (e.kind === "ExprInfix") return e;
  if (e.kind === "ExprParen") return findInfix(e.inner);
  return null;
}

for (const op of OPS) {
  test(`Prelude operator '${op}' resolves to a synthetic identity`, async () => {
    const o = await resolveModules({
      "Main.blk": [
        "module Main (main)",
        "",
        `main = 1 ${op} 2`,
      ].join("\n") + "\n",
    });
    try {
      assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
      const prog = o.result.program!;
      const opId = prog.prelude.operators.get(op);
      assert.ok(opId, `Prelude must register operator '${op}'`);
      const main = prog.modules.get("Main")!;
      const decl = main.declarations.find(
        (d) => d.kind === "DeclDefinition" && d.name === "main",
      ) as ResolvedDeclDefinition | undefined;
      assert.ok(decl && decl.body, "main must have a body");
      const infix = findInfix(decl.body!);
      assert.ok(infix, `main body must be an ExprInfix using '${op}'`);
      assert.equal(infix.op, op);
      assert.ok(!("kind" in infix.opRef), `operator '${op}' must be resolved`);
      if ("kind" in infix.opRef) return;
      assert.equal(infix.opRef.id.value, opId!.value, `opRef must equal Prelude id for '${op}'`);
      // The identity must correspond to a synthetic Prelude operator declaration.
      const defRec = prog.definitions.get(opId!.value);
      assert.ok(defRec);
      assert.equal(defRec!.namespace, "term");
      assert.equal(defRec!.category, "operator");
      assert.equal(defRec!.name, op);
    } finally {
      await o.cleanup();
    }
  });
}
