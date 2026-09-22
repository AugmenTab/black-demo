// Contract: module/path identity and reachable-module loader (§7–§11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("entry-only trivial module resolves successfully", async () => {
  const o = await resolveModules({
    "Main.blk": "module Main (main)\n\nmain = ()\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${o.errors.map((e) => e.code).join(", ")}`);
    assert.ok(o.result.ok);
    assert.equal(o.result.program?.entryModule, "Main");
  } finally {
    await o.cleanup();
  }
});

test("module declared with dotted name resolves when path matches", async () => {
  const o = await resolveModules(
    {
      "Main.blk": "module Main (main)\n\nimport Game.Model (t)\n\nmain = t\n",
      "Game/Model.blk": "module Game.Model (t)\n\nt = ()\n",
    },
  );
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    assert.ok(o.result.program?.modules.has("Game.Model"));
  } finally {
    await o.cleanup();
  }
});

test("declared module name that disagrees with its path is rejected with BLACK_MODULE_PATH_MISMATCH", async () => {
  const o = await resolveModules(
    {
      "Main.blk": "module Main (main)\n\nimport Game.Model (t)\n\nmain = t\n",
      "Game/Model.blk": "module Game.Different (t)\n\nt = ()\n",
    },
  );
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_PATH_MISMATCH"),
      `expected BLACK_MODULE_PATH_MISMATCH; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("import of missing module fails with BLACK_MODULE_NOT_FOUND", async () => {
  const o = await resolveModules(
    {
      "Main.blk": "module Main (main)\n\nimport Absent.Module (x)\n\nmain = x\n",
    },
  );
  try {
    assert.ok(o.errors.some((d) => d.code === "BLACK_MODULE_NOT_FOUND"));
  } finally {
    await o.cleanup();
  }
});

test("reachable loader does NOT parse unrelated .blk files that are not imported (§9)", async () => {
  const o = await resolveModules(
    {
      "Main.blk": "module Main (main)\n\nmain = ()\n",
      "Orphan.blk": "this is not valid Black source at all @@@ ###",
    },
  );
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    assert.ok(!o.result.program?.modules.has("Orphan"));
  } finally {
    await o.cleanup();
  }
});
