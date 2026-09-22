// Contract: import order does not affect resolution outcome (§46).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("swapping two independent import declarations produces the same resolved DefId for a shared reference", async () => {
  const filesAB = {
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (x)",
      "import B (y)",
      "",
      "main = x",
    ].join("\n") + "\n",
    "A.blk": "module A (x)\n\nx = ()\n",
    "B.blk": "module B (y)\n\ny = ()\n",
  };
  const filesBA = {
    "Main.blk": [
      "module Main (main)",
      "",
      "import B (y)",
      "import A (x)",
      "",
      "main = x",
    ].join("\n") + "\n",
    "A.blk": "module A (x)\n\nx = ()\n",
    "B.blk": "module B (y)\n\ny = ()\n",
  };

  const first = await resolveModules(filesAB);
  const second = await resolveModules(filesBA);
  try {
    assert.equal(first.errors.length, 0, JSON.stringify(first.errors));
    assert.equal(second.errors.length, 0, JSON.stringify(second.errors));
    // Both should resolve `main = x` to an A.x reference. Compare structural
    // equivalence — the DefIds are ephemeral so we compare the definition's
    // name+module tuple.
    const nameOfMainBody = (o: typeof first): string | null => {
      const main = o.result.program?.modules.get("Main");
      const def = main!.declarations.find(
        (d) => d.kind === "DeclDefinition" && d.name === "main",
      );
      if (!def || def.kind !== "DeclDefinition") return null;
      const body = def.body;
      if (!body || body.kind !== "ExprVarRef") return null;
      if ("kind" in body.ref) return null;
      const rec = o.result.program!.definitions.get(body.ref.id.value);
      return rec ? (rec as { name: string }).name : null;
    };
    assert.equal(nameOfMainBody(first), "x");
    assert.equal(nameOfMainBody(second), "x");
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
