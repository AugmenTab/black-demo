// Contract: explicit top-level signatures are required (§15).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("top-level definition with matching signature passes", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 42",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected errors: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("top-level definition without a signature fails BLACK_TYPE_MISSING_SIGNATURE", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main = 42",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISSING_SIGNATURE"),
      `expected missing signature; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("signature without a definition fails BLACK_TYPE_MISSING_DEFINITION", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "helper :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISSING_DEFINITION"),
      `expected missing definition; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
