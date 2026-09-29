// Contract: constructor payload mismatches surface as
// BLACK_BAD_CONSTRUCTOR_PAYLOAD, not the generic BLACK_TYPE_MISMATCH or
// BLACK_BAD_ARGUMENT. The typechecker must retain constructor context
// through the application (§26).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("wrong-typed constructor payload emits BLACK_BAD_CONSTRUCTOR_PAYLOAD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Box =",
      "  | Box Int",
      "",
      "bad :: Box",
      "bad = Box \"hello\"",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected failure");
    assert.ok(
      o.errorCodes.includes("BLACK_BAD_CONSTRUCTOR_PAYLOAD"),
      `expected BLACK_BAD_CONSTRUCTOR_PAYLOAD, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("qualified constructor with wrong payload also emits BLACK_BAD_CONSTRUCTOR_PAYLOAD", async () => {
  const o = await typecheckModules({
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Float",
    ].join("\n") + "\n",
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Shape (..))",
      "",
      "bad :: Game.Model.Shape",
      "bad = Game.Model.Circle \"nope\"",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected failure");
    assert.ok(
      o.errorCodes.includes("BLACK_BAD_CONSTRUCTOR_PAYLOAD"),
      `expected BLACK_BAD_CONSTRUCTOR_PAYLOAD, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("correct constructor payload still typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Box =",
      "  | Box Int",
      "",
      "good :: Box",
      "good = Box 42",
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
