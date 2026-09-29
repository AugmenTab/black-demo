// Contract: local `let` bindings are sequential and non-recursive. An RHS
// may see earlier siblings; the `in` body sees them all. Local polymorphic
// bindings must be usable at multiple types by later siblings (§7, §8).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("earlier sibling is visible to a later RHS", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  let first = 1",
      "      second = first",
      "  in second",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("chained earlier siblings compose through the `in` body", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  let first = 1",
      "      second = first",
      "      third = second",
      "  in third",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("body sees all bindings", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  let a = 1",
      "      b = 2",
      "  in a + b",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("locally-polymorphic earlier sibling is usable at distinct types by later siblings", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: { i :: Int, t :: Text }",
      "main =",
      "  let id x = x",
      "      intValue = id 1",
      "      textValue = id \"hello\"",
      "  in { i = intValue, t = textValue }",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});
