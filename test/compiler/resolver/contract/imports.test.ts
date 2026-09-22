// Contract: import resolution (§31–§35).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("selected import of an exported term resolves the reference", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util (helper)",
      "",
      "main = helper",
    ].join("\n") + "\n",
    "Util.blk": [
      "module Util (helper)",
      "",
      "helper = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, JSON.stringify(o.errors));
    const mainMod = o.result.program?.modules.get("Main");
    const utilMod = o.result.program?.modules.get("Util");
    assert.ok(mainMod && utilMod);
    // main = helper — the ExprVarRef must point at Util.helper's DefId.
    const def = mainMod!.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "main");
    assert.ok(def && def.kind === "DeclDefinition");
    const body = def.body;
    assert.ok(body && body.kind === "ExprVarRef");
    assert.ok(!("kind" in body.ref) || body.ref.kind !== "unresolved");
    const utilDef = utilMod!.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "helper",
    );
    assert.ok(utilDef && utilDef.kind === "DeclDefinition");
    if (!("kind" in body.ref)) {
      assert.equal(body.ref.id.value, utilDef.defId.value);
    }
  } finally {
    await o.cleanup();
  }
});

test("importing a name the target module never declares fails with BLACK_IMPORT_UNKNOWN_NAME", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util (nope)",
      "",
      "main = nope",
    ].join("\n") + "\n",
    "Util.blk": [
      "module Util (helper)",
      "",
      "helper = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_IMPORT_UNKNOWN_NAME"),
      `expected BLACK_IMPORT_UNKNOWN_NAME; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("importing a name that exists in the target but is not in its export list fails with BLACK_IMPORT_NOT_EXPORTED", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util (secret)",
      "",
      "main = secret",
    ].join("\n") + "\n",
    "Util.blk": [
      "module Util (helper)",
      "",
      "helper = ()",
      "secret = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_IMPORT_NOT_EXPORTED"),
      `expected BLACK_IMPORT_NOT_EXPORTED; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("`Type (..)` selected import brings in the type and every exported constructor", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Colors (Color (..))",
      "",
      "main = Red",
    ].join("\n") + "\n",
    "Colors.blk": [
      "module Colors (Color (..))",
      "",
      "type Color =",
      "  | Red",
      "  | Green",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, JSON.stringify(o.errors));
  } finally {
    await o.cleanup();
  }
});

test("`Type (..)` selected import of an alias fails downstream even if source module has already errored", async () => {
  // Colors declares an alias but tries to expose it via (..) — the source-
  // side error takes precedence.
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Colors (Color (..))",
      "",
      "main = ()",
    ].join("\n") + "\n",
    "Colors.blk": [
      "module Colors (Color (..))",
      "",
      "type Color = Text",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_EXPORT_INVALID_CONSTRUCTORS"),
      "expected export-side rejection for alias `(..)`",
    );
  } finally {
    await o.cleanup();
  }
});

test("qualified import `import M as N` exposes M under alias N; N.x resolves", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util as U",
      "",
      "main = U.helper",
    ].join("\n") + "\n",
    "Util.blk": [
      "module Util (helper)",
      "",
      "helper = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = o.result.program?.modules.get("Main");
    assert.ok(main);
    const def = main!.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "main");
    assert.ok(def && def.kind === "DeclDefinition");
    const body = def.body;
    assert.ok(body && body.kind === "ExprQualified");
    assert.equal(body.alias, "U");
    assert.equal(body.moduleId, "Util");
  } finally {
    await o.cleanup();
  }
});

test("qualified alias collision (two `as X` bindings) fails with BLACK_MODULE_ALIAS_DUPLICATE", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util as U",
      "import Other as U",
      "",
      "main = ()",
    ].join("\n") + "\n",
    "Util.blk": "module Util (x)\n\nx = ()\n",
    "Other.blk": "module Other (x)\n\nx = ()\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_ALIAS_DUPLICATE"),
      `expected alias duplicate; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("qualified reference to a name the target module does not export fails with BLACK_QUALIFIED_NAME_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util as U",
      "",
      "main = U.nope",
    ].join("\n") + "\n",
    "Util.blk": "module Util (helper)\n\nhelper = ()\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected BLACK_QUALIFIED_NAME_UNKNOWN; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
