// Contract: preview operator typing rules (§43, §44).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("Int + Int returns Int", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 1 + 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("Float + Float returns Float", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Float",
      "main = 1.5 + 2.5",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("mixing Int + Float is rejected (no implicit conversion)", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 1 + 2.5",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok);
  } finally {
    await o.cleanup();
  }
});

test("comparison Int < Int returns Bool", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Bool",
      "main = 1 < 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("equality on same-type scalars returns Bool", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Bool",
      "main = 1 == 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});
