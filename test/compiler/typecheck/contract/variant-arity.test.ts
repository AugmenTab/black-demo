// Contract: Black variant alternatives carry zero payloads or exactly one
// arbitrary payload (§27). Multi-argument variant constructors are not
// legal — the parser must reject them and the typechecker must not treat
// any variant alternative as taking more than one argument.

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("zero-payload variant alternative typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Choice =",
      "  | Yes",
      "  | No",
      "",
      "yes :: Choice",
      "yes = Yes",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("single-payload variant alternative typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Box =",
      "  | Box Int",
      "",
      "b :: Box",
      "b = Box 1",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("record-payload variant alternative typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Node =",
      "  | Node { value :: Int, next :: Int }",
      "",
      "n :: Node",
      // Parenthesize the record literal so the parser treats it as the
      // constructor's payload argument rather than a record-update target.
      "n = Node ({ value = 1, next = 2 })",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("apparent multi-arg constructor payload is rejected", async () => {
  // `Node Tree Tree` should NOT curry as a two-arg constructor. Given the
  // preview grammar, the parser treats what follows the constructor as a
  // single payload expression; supplying a second application makes the
  // program reject (`Node` has arity 1).
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Pair =",
      "  | Pair Int",
      "",
      "bad :: Pair",
      "bad = Pair 1 2",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected typecheck failure for multi-arg constructor");
  } finally {
    await o.cleanup();
  }
});
