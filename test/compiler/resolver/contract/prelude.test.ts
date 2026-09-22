// Contract: implicit Prelude scope (§55–§57).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("built-in `otherwise` resolves without an explicit import (Prelude term)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main",
      "  | otherwise = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("Prelude type `Int` is visible in signatures without an import", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("Prelude constructors `Some` / `None` resolve without an import", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main = Some 1",
      "empty = None",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("module-local declaration named `otherwise` shadows Prelude and does not raise ambiguity (§55)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "otherwise = ()",
      "main = otherwise",
    ].join("\n") + "\n",
  });
  try {
    // Should not be ambiguous. A shadowing warning is acceptable but not required.
    assert.ok(
      !o.errors.some((d) => d.code === "BLACK_NAME_AMBIGUOUS"),
      "module-local should win over Prelude without ambiguity",
    );
  } finally {
    await o.cleanup();
  }
});
