// Contract: qualified constructor references in expression and pattern
// positions typecheck through the resolved constructor DefId, exactly like
// unqualified references. The typechecker does not depend on the source
// spelling (§10, §11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("qualified constructor application typechecks under expected variant type", async () => {
  const o = await typecheckModules({
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Float",
      "  | Square Float",
    ].join("\n") + "\n",
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Shape (..))",
      "",
      "shape :: Game.Model.Shape",
      "shape = Game.Model.Circle 5.0",
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

test("qualified constructor pattern binds payload and typechecks", async () => {
  const o = await typecheckModules({
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Float",
      "  | Square Float",
    ].join("\n") + "\n",
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Shape (..))",
      "",
      "radius :: Game.Model.Shape -> Float",
      "radius s =",
      "  case s of",
      "    Game.Model.Circle r -> r",
      "    Game.Model.Square s2 -> s2",
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

test("mixing qualified and unqualified constructor references in the same case is accepted", async () => {
  const o = await typecheckModules({
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Float",
      "  | Square Float",
    ].join("\n") + "\n",
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Shape (..))",
      "",
      "sizeOf :: Game.Model.Shape -> Float",
      "sizeOf s =",
      "  case s of",
      "    Game.Model.Circle r -> r",
      "    Square s2 -> s2",
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
