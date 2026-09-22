// Contract: export list validation (§27–§30).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

test("exporting a term that is not declared in the module fails with BLACK_EXPORT_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": "module Main (main, missing)\n\nmain = ()\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_EXPORT_UNKNOWN"),
      `expected BLACK_EXPORT_UNKNOWN; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("exporting a type that is not declared fails with BLACK_EXPORT_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": "module Main (main, NoSuch)\n\nmain = ()\n",
  });
  try {
    assert.ok(o.errors.some((d) => d.code === "BLACK_EXPORT_UNKNOWN"));
  } finally {
    await o.cleanup();
  }
});

test("`Type (..)` on a variant exports every constructor", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Colors (Color (..), red)",
      "",
      "main = red",
    ].join("\n") + "\n",
    "Colors.blk": [
      "module Colors (Color (..), red)",
      "",
      "type Color =",
      "  | Red",
      "  | Green",
      "  | Blue",
      "",
      "red = Red",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, JSON.stringify(o.errors));
    const iface = o.result.program?.interfaces.get("Colors");
    assert.ok(iface, "expected Colors interface");
    assert.ok(iface!.exportedTypes.has("Color"));
    assert.ok(iface!.exportedTerms.has("Red"));
    assert.ok(iface!.exportedTerms.has("Green"));
    assert.ok(iface!.exportedTerms.has("Blue"));
  } finally {
    await o.cleanup();
  }
});

test("`Type (..)` on a type alias is rejected with BLACK_EXPORT_INVALID_CONSTRUCTORS (§30)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (Name (..), main)",
      "",
      "type Name = Text",
      "",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_EXPORT_INVALID_CONSTRUCTORS"),
      `expected BLACK_EXPORT_INVALID_CONSTRUCTORS; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("plain type export (without (..)) exposes the type but not its constructors", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Colors (Color, red)",
      "",
      "main = red",
    ].join("\n") + "\n",
    "Colors.blk": [
      "module Colors (Color, red)",
      "",
      "type Color =",
      "  | Red",
      "  | Green",
      "",
      "red = Red",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, JSON.stringify(o.errors));
    const iface = o.result.program?.interfaces.get("Colors");
    assert.ok(iface);
    assert.ok(iface!.exportedTypes.has("Color"));
    assert.ok(!iface!.exportedTerms.has("Red"), "Red must not be exported without (..)");
    assert.ok(!iface!.exportedTerms.has("Green"), "Green must not be exported without (..)");
  } finally {
    await o.cleanup();
  }
});
