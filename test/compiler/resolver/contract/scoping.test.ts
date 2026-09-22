// Contract: lexical scoping, shadowing, duplicate binders (§39–§50).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("top-level names are predeclared: forward reference resolves (§44)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main = later",
      "later = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("top-level self-recursion resolves (§44)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (loop)",
      "",
      "loop = loop",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = o.result.program?.modules.get("Main");
    const def = main!.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "loop");
    assert.ok(def && def.kind === "DeclDefinition");
    const body = def.body;
    assert.ok(body && body.kind === "ExprVarRef");
    if (!("kind" in body.ref)) {
      assert.equal(body.ref.id.value, def.defId.value, "self-reference must share DefId");
    }
  } finally {
    await o.cleanup();
  }
});

test("signature and definition share a single DefId (§24)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = o.result.program?.modules.get("Main");
    const sig = main!.declarations.find((d) => d.kind === "DeclSignature" && d.name === "main");
    const def = main!.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "main");
    assert.ok(sig && def);
    assert.equal(sig!.defId.value, def!.defId.value);
  } finally {
    await o.cleanup();
  }
});

test("duplicate top-level signature fails with BLACK_NAME_DUPLICATE (§26)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: ()",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_DUPLICATE"),
      `expected duplicate signature; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("duplicate lambda parameter emits BLACK_NAME_DUPLICATE_BINDING (§50)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main = \\x x -> x",
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

test("case-branch pattern binders scope only within the branch body (§48)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main =",
      "  case Some 1 of",
      "    Some x -> x",
      "    None   -> 0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("undefined identifier fails with BLACK_NAME_UNKNOWN (§40)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main = ghost",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected unknown name; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("wildcard `_` in a pattern allocates no binder and does not conflict with a second `_`", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main =",
      "  case Some 1 of",
      "    Some _ -> ()",
      "    _      -> ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("undefined type in a signature fails with BLACK_TYPE_NAME_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: NoSuchType",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_TYPE_NAME_UNKNOWN"),
      `expected type unknown; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
