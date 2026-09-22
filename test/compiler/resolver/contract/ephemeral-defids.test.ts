// Contract: DefIds are ephemeral, per-invocation identities (§15, §67).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("DefIds are internally consistent within one invocation (self-reference matches definition)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (loop)",
      "",
      "loop = loop",
    ].join("\n") + "\n",
  });
  try {
    const main = o.result.program?.modules.get("Main");
    const loopDef = main!.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "loop",
    );
    assert.ok(loopDef && loopDef.kind === "DeclDefinition");
    const body = loopDef.body;
    assert.ok(body && body.kind === "ExprVarRef");
    if (!("kind" in body.ref)) {
      assert.equal(body.ref.id.value, loopDef.defId.value);
    }
  } finally {
    await o.cleanup();
  }
});

test("resolving the same project twice does NOT require DefId numeric stability across invocations", async () => {
  const files = {
    "Main.blk": "module Main (main)\n\nmain = ()\n",
  };
  const first = await resolveModules(files);
  const second = await resolveModules(files);
  try {
    // Structural equivalence: both succeed with the same reachable set and
    // number of definitions. Numeric DefIds may or may not collide — the
    // contract only guarantees per-invocation identity.
    assert.ok(first.result.ok && second.result.ok);
    assert.equal(
      first.result.program!.modules.size,
      second.result.program!.modules.size,
    );
    assert.equal(
      first.result.program!.definitions.size,
      second.result.program!.definitions.size,
    );
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
