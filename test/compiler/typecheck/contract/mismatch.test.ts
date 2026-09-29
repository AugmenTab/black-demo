// Contract: type mismatch diagnostics — plain BLACK_TYPE_MISMATCH surfaces
// wherever inferred types disagree with an expected type.

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("returning an Int where a Text is required fails BLACK_TYPE_MISMATCH", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Text",
      "main = 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISMATCH"),
      `expected type mismatch; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("applying an Int to a function argument of Text fails BLACK_TYPE_MISMATCH", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "greet :: Text -> Text",
      "greet t = t",
      "",
      "main :: Text",
      "main = greet 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISMATCH"),
      `expected mismatch; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("preview-web-1 rejects implicit Int/Float conversion in +", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Float",
      "main = 1 + 2.0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISMATCH"),
      `expected mismatch; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("Int / Int is not defined in preview-web-1 (only Float / Float)", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 6 / 2",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "Int/Int division must be rejected");
  } finally {
    await o.cleanup();
  }
});

test("arity mismatch: too many syntactic params for the declared signature", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int -> Int",
      "main x y = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_ARITY_MISMATCH"),
      `expected arity mismatch; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
