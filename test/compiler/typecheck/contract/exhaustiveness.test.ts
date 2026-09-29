// Contract: pattern exhaustiveness (§46–§51).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("exhaustive case over a Bool passes", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  case True of",
      "    True -> 1",
      "    False -> 0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("case missing a Bool branch fails BLACK_NON_EXHAUSTIVE_CASE", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  case True of",
      "    True -> 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_CASE"),
      `expected non-exhaustive case; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("case over Int without catch-all fails BLACK_NON_EXHAUSTIVE_CASE", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  case 1 of",
      "    0 -> 0",
      "    1 -> 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_CASE"),
      `expected non-exhaustive case; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("case over a variant covering every constructor passes", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Shape =",
      "  | Circle",
      "  | Square",
      "  | Triangle",
      "",
      "main :: Int",
      "main =",
      "  case Circle of",
      "    Circle -> 0",
      "    Square -> 1",
      "    Triangle -> 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("case over a variant missing an alternative fails non-exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Shape =",
      "  | Circle",
      "  | Square",
      "  | Triangle",
      "",
      "main :: Int",
      "main =",
      "  case Circle of",
      "    Circle -> 0",
      "    Square -> 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_CASE"),
      `expected non-exhaustive case; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
