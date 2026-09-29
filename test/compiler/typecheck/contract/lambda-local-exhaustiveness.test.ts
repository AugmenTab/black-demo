// Contract: refutable single-clause lambda and local-function patterns are
// rejected via the same exhaustiveness machinery as top-level equations
// (§31, §32).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("lambda matching only one constructor of a 2-alt variant is non-exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Choice =",
      "  | A Int",
      "  | B Int",
      "",
      "extract :: Choice -> Int",
      "extract = \\(A x) -> x",
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

test("local function matching only one constructor of a 2-alt variant is non-exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Choice =",
      "  | A Int",
      "  | B Int",
      "",
      "some :: Choice",
      "some = A 1",
      "",
      "run :: Int",
      "run =",
      "  let get (A x) = x",
      "  in get some",
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

test("lambda covering both variant alternatives is exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Choice =",
      "  | A Int",
      "  | B Int",
      "",
      "extract :: Choice -> Int",
      "extract c =",
      "  case c of",
      "    A x -> x",
      "    B x -> x",
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
