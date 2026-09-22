// Contract: ambiguity between imports and module-local wins (§42–§43, §52).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("two selected imports of the same term name from two modules cause BLACK_NAME_AMBIGUOUS at the use site", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (x)",
      "import B (x)",
      "",
      "main = x",
    ].join("\n") + "\n",
    "A.blk": "module A (x)\n\nx = ()\n",
    "B.blk": "module B (x)\n\nx = ()\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_AMBIGUOUS"),
      `expected ambiguous; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("module-local declaration wins over a same-named selected import without ambiguity (§52)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (x)",
      "",
      "x = 1",
      "main = x",
    ].join("\n") + "\n",
    "A.blk": "module A (x)\n\nx = 2\n",
  });
  try {
    assert.ok(
      !o.errors.some((d) => d.code === "BLACK_NAME_AMBIGUOUS"),
      "module-local should win without ambiguity",
    );
    const main = o.result.program?.modules.get("Main");
    const mainDef = main!.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "main");
    const xDef = main!.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "x");
    assert.ok(mainDef && mainDef.kind === "DeclDefinition");
    assert.ok(xDef && xDef.kind === "DeclDefinition");
    const body = mainDef.body;
    assert.ok(body && body.kind === "ExprVarRef");
    if (!("kind" in body.ref)) {
      assert.equal(body.ref.id.value, xDef.defId.value, "module-local x should win");
    }
  } finally {
    await o.cleanup();
  }
});

test("importing the same name from the same module twice does NOT cause ambiguity (identical DefId)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (x)",
      "import A (x)",
      "",
      "main = x",
    ].join("\n") + "\n",
    "A.blk": "module A (x)\n\nx = 1\n",
  });
  try {
    assert.ok(
      !o.errors.some((d) => d.code === "BLACK_NAME_AMBIGUOUS"),
      "identical import twice should not be ambiguous",
    );
  } finally {
    await o.cleanup();
  }
});
