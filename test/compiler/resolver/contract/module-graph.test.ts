// Contract: module import graph and cycle detection (§12–§13).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("two-module cycle is reported with BLACK_MODULE_CYCLE naming both modules", async () => {
  const o = await resolveModules({
    "Main.blk": "module Main (main)\n\nimport Loop (x)\n\nmain = x\n",
    "Loop.blk": "module Loop (x)\n\nimport Main (main)\n\nx = main\n",
  });
  try {
    const cycle = o.errors.find((d) => d.code === "BLACK_MODULE_CYCLE");
    assert.ok(cycle, `expected BLACK_MODULE_CYCLE; got ${JSON.stringify(o.errors)}`);
    assert.match(cycle.message, /Main/);
    assert.match(cycle.message, /Loop/);
  } finally {
    await o.cleanup();
  }
});

test("three-module cycle A -> B -> C -> A produces a single BLACK_MODULE_CYCLE with full path", async () => {
  const o = await resolveModules({
    "Main.blk": "module Main (main)\n\nimport A (a)\n\nmain = a\n",
    "A.blk": "module A (a)\n\nimport B (b)\n\na = b\n",
    "B.blk": "module B (b)\n\nimport C (c)\n\nb = c\n",
    "C.blk": "module C (c)\n\nimport A (a)\n\nc = a\n",
  });
  try {
    const cycles = o.errors.filter((d) => d.code === "BLACK_MODULE_CYCLE");
    assert.equal(cycles.length, 1, `expected 1 cycle diag; got ${cycles.length}`);
    assert.match(cycles[0]!.message, /A/);
    assert.match(cycles[0]!.message, /B/);
    assert.match(cycles[0]!.message, /C/);
  } finally {
    await o.cleanup();
  }
});

test("diamond import DAG (A -> B, A -> C, B -> D, C -> D) resolves successfully — cross edges are not cycles", async () => {
  const o = await resolveModules({
    "Main.blk":
      "module Main (main)\n\nimport A (a)\nimport B (b)\nimport C (c)\nimport D (d)\n\nmain = d\n",
    "A.blk": "module A (a)\n\nimport B (b)\nimport C (c)\n\na = b\n",
    "B.blk": "module B (b)\n\nimport D (d)\n\nb = d\n",
    "C.blk": "module C (c)\n\nimport D (d)\n\nc = d\n",
    "D.blk": "module D (d)\n\nd = ()\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const loadOrder = o.result.program?.loadOrder ?? [];
    assert.ok(loadOrder.indexOf("D") < loadOrder.indexOf("B"));
    assert.ok(loadOrder.indexOf("D") < loadOrder.indexOf("C"));
    assert.ok(loadOrder.indexOf("B") < loadOrder.indexOf("A"));
  } finally {
    await o.cleanup();
  }
});

test("self-import (module imports itself) is flagged as a 1-cycle", async () => {
  const o = await resolveModules({
    "Main.blk": "module Main (main)\n\nimport Main (main)\n\nmain = ()\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_CYCLE"),
      `expected self-cycle; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
