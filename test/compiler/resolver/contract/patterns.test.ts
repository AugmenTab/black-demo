// Contract: pattern resolution — constructors resolve, binders scope,
// wildcards allocate no identity (§47, §49).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("constructor pattern in a case branch resolves the constructor reference", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Shape =",
      "  | Circle",
      "  | Square",
      "",
      "main =",
      "  case Circle of",
      "    Circle -> 0",
      "    Square -> 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("using an unknown constructor in a pattern fails with BLACK_NAME_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main =",
      "  case () of",
      "    NoSuchCtor -> 0",
      "    _          -> 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected unknown; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("duplicate pattern binder in the same branch fails with BLACK_NAME_DUPLICATE_BINDING", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Pair =",
      "  | Pair Int Int",
      "",
      "main =",
      "  case Pair 1 2 of",
      "    Pair x x -> x",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_DUPLICATE_BINDING"),
      `expected duplicate binding; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
