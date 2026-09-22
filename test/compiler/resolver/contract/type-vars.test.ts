// Contract: type variable scoping (§53–§54).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("type variables in a signature resolve without an error", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main, ident)",
      "",
      "ident :: a -> a",
      "ident x = x",
      "",
      "main = ident ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("type variables in two different signatures are distinct (fresh per signature)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main, first, second)",
      "",
      "first :: a -> a",
      "first x = x",
      "",
      "second :: a -> a",
      "second x = x",
      "",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});
