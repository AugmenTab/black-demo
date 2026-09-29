// Contract: transparent aliases + alias-cycle rejection (§10, §11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("transparent alias is interchangeable with its body", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Age = Int",
      "",
      "double :: Age -> Age",
      "double a = a + a",
      "",
      "main :: Int",
      "main = double 21",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("transparent alias cycle fails BLACK_TYPE_ALIAS_CYCLE", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type A = B",
      "type B = A",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_ALIAS_CYCLE"),
      `expected alias cycle; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// Phase-04_2 §23: alias-cycle recovery placeholder must not masquerade as a
// real variant. After the alias cycle is reported, downstream use of the
// alias must not silently typecheck — the program must not become "well
// typed" merely because the alias is internally recovered.
test("alias-cycle recovery cannot satisfy a case scrutinee as a real variant", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type A = B",
      "type B = A",
      "",
      // A downstream construct that would succeed only if `A` were a real
      // variant with real constructors. Under recovery-as-TyError, no
      // constructor pattern can be recognized against `A`, and the case
      // must not appear exhaustive.
      "step :: A -> Int",
      "step a =",
      "  case a of",
      "    _ -> 0",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    // The alias-cycle diagnostic is authoritative.
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_ALIAS_CYCLE"),
      `expected alias cycle; got ${o.errorCodes.join(", ")}`,
    );
    // The overall program must not typecheck as successful — the recovery
    // placeholder must not launder the cycle away.
    assert.equal(o.ok, false, "program with alias cycle must not typecheck");
  } finally {
    await o.cleanup();
  }
});
