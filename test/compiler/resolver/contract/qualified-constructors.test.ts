// Contract: module-qualified constructor references in expression and
// pattern positions (phase-03_5.md §9–§16). Qualification never bypasses
// the target module's export list, and qualification selects the SAME
// DefId that the constructor's declaring module assigned — it never
// fabricates a fresh identity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";
import type { ResolvedDeclDefinition, ResolvedExpr } from "../../../../src/compiler/resolver/types.js";

function bodyOf(mod: NonNullable<ReturnType<typeof getMain>>, name: string): ResolvedExpr | null {
  const d = mod.declarations.find((x) => x.kind === "DeclDefinition" && x.name === name) as
    | ResolvedDeclDefinition
    | undefined;
  return d?.body ?? null;
}

function getMain(o: Awaited<ReturnType<typeof resolveModules>>) {
  return o.result.program?.modules.get("Main");
}

test("qualified constructor expression resolves through a module alias", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main = S.Circle 5",
    ].join("\n") + "\n",
    "Shapes.blk": [
      "module Shapes (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
      "  | Square Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    // ExprApp with fn = ExprQualified { moduleId: Shapes, ref: <Circle DefId> }
    assert.equal(body.kind, "ExprApp");
    if (body.kind !== "ExprApp") return;
    assert.equal(body.fn.kind, "ExprQualified");
    if (body.fn.kind !== "ExprQualified") return;
    assert.equal(body.fn.alias, "S");
    assert.equal(body.fn.moduleId, "Shapes");
    assert.ok(!("kind" in body.fn.ref), "qualified constructor ref must be resolved");
  } finally {
    await o.cleanup();
  }
});

test("qualified nullary constructor expression resolves through a module alias", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main = S.Origin",
    ].join("\n") + "\n",
    "Shapes.blk": [
      "module Shapes (Shape (..))",
      "",
      "type Shape =",
      "  | Origin",
      "  | Square Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    assert.equal(body.kind, "ExprQualified");
    if (body.kind !== "ExprQualified") return;
    assert.equal(body.alias, "S");
    assert.equal(body.moduleId, "Shapes");
    assert.ok(!("kind" in body.ref), "nullary qualified constructor ref must be resolved");
  } finally {
    await o.cleanup();
  }
});

test("qualified constructor pattern resolves through a module alias", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main =",
      "  case S.Origin of",
      "    S.Circle r -> r",
      "    S.Origin   -> 0",
    ].join("\n") + "\n",
    "Shapes.blk": [
      "module Shapes (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
      "  | Origin",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    assert.equal(body.kind, "ExprCase");
    if (body.kind !== "ExprCase") return;
    // Both branch patterns must be resolved PatternCon with a real DefId.
    for (const br of body.branches) {
      assert.equal(br.pattern.kind, "PatternCon");
      if (br.pattern.kind !== "PatternCon") return;
      assert.ok(!("kind" in br.pattern.ref), "qualified constructor pattern must be resolved");
    }
  } finally {
    await o.cleanup();
  }
});

test("qualified constructor selects the same DefId as the declaring module (identity, not fresh)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main = S.Circle 3",
    ].join("\n") + "\n",
    "Shapes.blk": [
      "module Shapes (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const shapesIface = o.result.program!.interfaces.get("Shapes")!;
    const circleId = shapesIface.exportedTerms.get("Circle");
    assert.ok(circleId, "Shapes must export the Circle constructor");
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    assert.equal(body.kind, "ExprApp");
    if (body.kind !== "ExprApp") return;
    assert.equal(body.fn.kind, "ExprQualified");
    if (body.fn.kind !== "ExprQualified") return;
    if ("kind" in body.fn.ref) throw new Error("expected resolved ref");
    assert.equal(
      body.fn.ref.id.value,
      circleId!.value,
      "qualified use must reuse the declaring module's Circle DefId",
    );
  } finally {
    await o.cleanup();
  }
});

test("qualified access to a constructor hidden by the target module fails with BLACK_QUALIFIED_NAME_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main = S.Circle 3",
    ].join("\n") + "\n",
    "Shapes.blk": [
      // Only the type is exported, not its constructors.
      "module Shapes (Shape)",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
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

test("qualified pattern for a hidden constructor also fails with BLACK_QUALIFIED_NAME_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main =",
      "  case 0 of",
      "    S.Circle r -> r",
    ].join("\n") + "\n",
    "Shapes.blk": [
      "module Shapes (Shape)",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
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

test("record field access on a non-alias record remains a structural ExprField", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "player = { name = \"a\" }",
      "",
      "main = player.name",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    // Structural field access must NOT be reinterpreted as ExprQualified.
    assert.equal(body.kind, "ExprField");
    if (body.kind !== "ExprField") return;
    assert.equal(body.field, "name");
  } finally {
    await o.cleanup();
  }
});

test("qualified function reference still works alongside qualified constructor reference", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Shapes as S",
      "",
      "main = S.area (S.Circle 5)",
    ].join("\n") + "\n",
    "Shapes.blk": [
      "module Shapes (Shape (..), area)",
      "",
      "type Shape =",
      "  | Circle Int",
      "",
      "area s = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});
