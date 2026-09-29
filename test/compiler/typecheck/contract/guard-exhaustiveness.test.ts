// Contract: a conditionally-guarded equation cannot prove totality on its
// own. Only unconditional guards (literal `True` or the exact Prelude
// `otherwise` DefId) contribute unconditional coverage. Shadowed
// `otherwise` bindings do NOT count (§12–§15).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("conditional-guard-only function is rejected as non-exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "f :: Bool -> Int",
      "f x",
      "  | x = 1",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected non-exhaustive failure");
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_FUNCTION"),
      `expected BLACK_NON_EXHAUSTIVE_FUNCTION, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("guarded equation with `otherwise` covers the remaining space", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "f :: Bool -> Int",
      "f x",
      "  | x = 1",
      "  | otherwise = 0",
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

test("guarded equation with literal True covers the remaining space", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "f :: Bool -> Int",
      "f x",
      "  | x = 1",
      "  | True = 0",
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

test("a locally-shadowed `otherwise` does not count as unconditional", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "f :: Bool -> Int",
      "f x =",
      "  let otherwise = False",
      "  in g x",
      "",
      "g :: Bool -> Int",
      "g x",
      "  | x = 1",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected non-exhaustive failure on g");
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_FUNCTION"),
      `expected BLACK_NON_EXHAUSTIVE_FUNCTION, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
