// Contract: module-qualified references whose module path itself has more
// than one component (phase-03_6.md §§9–17). Covers expression and pattern
// positions, DefId reuse, export visibility, and the parallel structural
// chain that must remain structural.

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

test("multi-segment qualified term resolves through the canonical module path", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Data.Text (trim)",
      "",
      "value = \"hello\"",
      "",
      "main = Data.Text.trim value",
    ].join("\n") + "\n",
    "Data/Text.blk": [
      "module Data.Text (trim)",
      "",
      "trim x = x",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const dataTextIface = o.result.program!.interfaces.get("Data.Text")!;
    const trimId = dataTextIface.exportedTerms.get("trim");
    assert.ok(trimId, "Data.Text must export trim");
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    assert.equal(body.kind, "ExprApp");
    if (body.kind !== "ExprApp") return;
    assert.equal(body.fn.kind, "ExprQualified");
    if (body.fn.kind !== "ExprQualified") return;
    assert.equal(body.fn.alias, "Data.Text");
    assert.equal(body.fn.moduleId, "Data.Text");
    if ("kind" in body.fn.ref) throw new Error("expected resolved ref");
    assert.equal(
      body.fn.ref.id.value,
      trimId!.value,
      "canonical multi-segment use must reuse the declaring module's trim DefId",
    );
  } finally {
    await o.cleanup();
  }
});

test("multi-segment qualified constructor expression resolves and reuses the declaring DefId", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Shape (..))",
      "",
      "main = Game.Model.Circle 5",
    ].join("\n") + "\n",
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
      "  | Square Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const gmIface = o.result.program!.interfaces.get("Game.Model")!;
    const circleId = gmIface.exportedTerms.get("Circle");
    assert.ok(circleId, "Game.Model must export Circle");
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    assert.equal(body.kind, "ExprApp");
    if (body.kind !== "ExprApp") return;
    assert.equal(body.fn.kind, "ExprQualified");
    if (body.fn.kind !== "ExprQualified") return;
    assert.equal(body.fn.alias, "Game.Model");
    assert.equal(body.fn.moduleId, "Game.Model");
    if ("kind" in body.fn.ref) throw new Error("expected resolved ref");
    assert.equal(body.fn.ref.id.value, circleId!.value);
  } finally {
    await o.cleanup();
  }
});

test("multi-segment qualified constructor pattern resolves and reuses the declaring DefId", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Shape (..))",
      "",
      "shape = Game.Model.Circle 3",
      "",
      "main =",
      "  case shape of",
      "    Game.Model.Circle r -> r",
      "    Game.Model.Square s -> s",
    ].join("\n") + "\n",
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
      "  | Square Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const gmIface = o.result.program!.interfaces.get("Game.Model")!;
    const circleId = gmIface.exportedTerms.get("Circle")!;
    const squareId = gmIface.exportedTerms.get("Square")!;
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    assert.equal(body.kind, "ExprCase");
    if (body.kind !== "ExprCase") return;
    const [b1, b2] = body.branches;
    assert.equal(b1!.pattern.kind, "PatternCon");
    assert.equal(b2!.pattern.kind, "PatternCon");
    if (b1!.pattern.kind !== "PatternCon" || b2!.pattern.kind !== "PatternCon") return;
    if ("kind" in b1!.pattern.ref) throw new Error("expected resolved ref");
    if ("kind" in b2!.pattern.ref) throw new Error("expected resolved ref");
    assert.equal(b1!.pattern.ref.id.value, circleId.value);
    assert.equal(b2!.pattern.ref.id.value, squareId.value);
  } finally {
    await o.cleanup();
  }
});

test("multi-segment qualified access to a hidden constructor fails with BLACK_QUALIFIED_NAME_UNKNOWN", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      // Only the type is imported, not `(..)`, so constructors are hidden.
      "import Game.Model (Shape)",
      "",
      "main = Game.Model.Circle 5",
    ].join("\n") + "\n",
    "Game/Model.blk": [
      // Type exported without constructors.
      "module Game.Model (Shape)",
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

test("lowercase dotted chain (`player.position.x`) remains a structural field chain", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main player = player.position.x",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = getMain(o)!;
    const body = bodyOf(main, "main")!;
    // Outer must remain ExprField (structural), not ExprQualified.
    assert.equal(body.kind, "ExprField");
    if (body.kind !== "ExprField") return;
    assert.equal(body.field, "x");
    assert.equal(body.record.kind, "ExprField");
    if (body.record.kind !== "ExprField") return;
    assert.equal(body.record.field, "position");
  } finally {
    await o.cleanup();
  }
});
