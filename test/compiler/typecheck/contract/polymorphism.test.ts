// Contract: rank-1 signature polymorphism + Maybe (§17, §18, §41).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("polymorphic identity function typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "id :: a -> a",
      "id x = x",
      "",
      "main :: Int",
      "main = id 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("identity function used at Text also typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "id :: a -> a",
      "id x = x",
      "",
      "main :: Text",
      "main = id \"hi\"",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("Some and None type at Maybe Int", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "someOne :: Maybe Int",
      "someOne = Some 1",
      "",
      "nothing :: Maybe Int",
      "nothing = None",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("body may not commit a rigid type variable to Int", async () => {
  // signature promises `id :: a -> a` but body returns concrete Int
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "id :: a -> a",
      "id x = 1",
      "",
      "main :: Int",
      "main = id 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "signature promising `a -> a` must reject body returning Int");
  } finally {
    await o.cleanup();
  }
});
