// Contract: separate module / type / term namespaces (§18–§22).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("type and term of the same name coexist without conflict", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Foo = Text",
      "foo = ()",
      "",
      "main :: Foo",
      "main = foo",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("a type and a constructor may share a name (e.g. `Maybe = | Maybe`) without term collision", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Wrapper =",
      "  | Wrapper",
      "",
      "main = Wrapper",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("two variant declarations sharing a constructor name in the same module fail (§26)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type A =",
      "  | Same",
      "",
      "type B =",
      "  | Same",
      "",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_DUPLICATE"),
      `expected duplicate constructor; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
