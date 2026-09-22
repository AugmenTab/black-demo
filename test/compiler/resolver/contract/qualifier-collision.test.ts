// Contract: Phase 3.4 module-qualifier collision semantics
// (phase-03_4.md §§3-11, 13-22, 25, 26).
//
// A qualifier spelling that names two *different* module identities is a
// module-namespace ambiguity — reported once, at the use site — regardless
// of whether the terminal member happens to live in only one candidate and
// regardless of import order. A qualifier spelling that names the *same*
// module identity via multiple visibility sources is not ambiguous; the
// visibility surfaces combine. Longer canonical paths are never made
// ambiguous by unrelated single-segment aliases.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";
import type { ResolvedDeclDefinition, ResolvedExpr } from "../../../../src/compiler/resolver/types.js";

function getMain(o: Awaited<ReturnType<typeof resolveModules>>) {
  return o.result.program?.modules.get("Main");
}

function bodyOf(mod: NonNullable<ReturnType<typeof getMain>>, name: string): ResolvedExpr | null {
  const d = mod.declarations.find((x) => x.kind === "DeclDefinition" && x.name === name) as
    | ResolvedDeclDefinition
    | undefined;
  return d?.body ?? null;
}

// -------- §13: alias vs canonical, different modules --------

test("§13 alias and canonical qualifier bound to different modules is ambiguous", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo (x)",
      "import Bar as Foo",
      "",
      "main = Foo.x",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x)\n\nx = 1\n",
    "Bar.blk": "module Bar (x)\n\nx = 2\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      `expected BLACK_MODULE_QUALIFIER_AMBIGUOUS; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §13 reverse: import order must not matter --------

test("§13 reverse import order produces identical ambiguity", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Bar as Foo",
      "import Foo (x)",
      "",
      "main = Foo.x",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x)\n\nx = 1\n",
    "Bar.blk": "module Bar (x)\n\nx = 2\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      `expected BLACK_MODULE_QUALIFIER_AMBIGUOUS; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §13 member exists only on canonical target --------

test("§13 member existing only on canonical target does not disambiguate", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo (fooOnly)",
      "import Bar as Foo",
      "",
      "main = Foo.fooOnly",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (fooOnly)\n\nfooOnly = 1\n",
    "Bar.blk": "module Bar (barOnly)\n\nbarOnly = 2\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      `expected BLACK_MODULE_QUALIFIER_AMBIGUOUS even though only Foo exports fooOnly; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §13 member exists only on alias target --------

test("§13 member existing only on alias target does not disambiguate", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo (fooOnly)",
      "import Bar as Foo",
      "",
      "main = Foo.barOnly",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (fooOnly)\n\nfooOnly = 1\n",
    "Bar.blk": "module Bar (barOnly)\n\nbarOnly = 2\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      `expected BLACK_MODULE_QUALIFIER_AMBIGUOUS even though only Bar exports barOnly; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §14: same module through alias + canonical is NOT ambiguous --------

test("§14 same module through alias + canonical resolves without ambiguity", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo (x)",
      "import Foo as Foo",
      "",
      "main = Foo.x",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x)\n\nx = 1\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo")!;
    const xId = iface.exportedTerms.get("x")!;
    const body = bodyOf(getMain(o)!, "main")!;
    assert.equal(body.kind, "ExprQualified");
    if (body.kind !== "ExprQualified") return;
    assert.equal(body.moduleId, "Foo");
    if ("kind" in body.ref) throw new Error("Foo.x must resolve");
    assert.equal(body.ref.id.value, xId.value);
  } finally {
    await o.cleanup();
  }
});

// -------- §15: same module visibility union --------

test("§15 same-module alias + canonical unions visibility surfaces (Foo.y visible via alias)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b)",
      "",
      "import Foo (x)",
      "import Foo as Foo",
      "",
      "a = Foo.x",
      "b = Foo.y",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x, y)\n\nx = 1\ny = 2\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo")!;
    const xId = iface.exportedTerms.get("x")!;
    const yId = iface.exportedTerms.get("y")!;
    const main = getMain(o)!;
    const aBody = bodyOf(main, "a")!;
    const bBody = bodyOf(main, "b")!;
    assert.equal(aBody.kind, "ExprQualified");
    if (aBody.kind !== "ExprQualified") return;
    if ("kind" in aBody.ref) throw new Error("Foo.x must resolve");
    assert.equal(aBody.ref.id.value, xId.value);
    assert.equal(bBody.kind, "ExprQualified");
    if (bBody.kind !== "ExprQualified") return;
    if ("kind" in bBody.ref) throw new Error("Foo.y must resolve via aliased surface");
    assert.equal(bBody.ref.id.value, yId.value);
  } finally {
    await o.cleanup();
  }
});

// -------- §16: canonical-only stays selected --------

test("§16 canonical-only import still exposes selected only, not siblings", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (ok, bad)",
      "",
      "import Foo (x)",
      "",
      "ok = Foo.x",
      "bad = Foo.y",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x, y)\n\nx = 1\ny = 2\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected BLACK_QUALIFIED_NAME_UNKNOWN for Foo.y; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
    assert.ok(
      !o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      "single-source qualifier must not raise ambiguity",
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §17: alias-only stays whole-module through alias only --------

test("§17 alias-only import exposes whole interface via alias, canonical path unavailable", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (via, canon)",
      "",
      "import Foo as F",
      "",
      "via = F.y",
      "canon = Foo.y",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x, y)\n\nx = 1\ny = 2\n",
  });
  try {
    // F.y must resolve; Foo.y must not. The current chain rule reports the
    // Foo head as an unknown term / alias.
    assert.ok(
      o.errors.some(
        (d) =>
          d.code === "BLACK_MODULE_ALIAS_UNKNOWN" ||
          d.code === "BLACK_NAME_UNKNOWN" ||
          d.code === "BLACK_QUALIFIED_NAME_UNKNOWN",
      ),
      `expected Foo.y unresolved; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
    // And critically, this must NOT be qualifier-ambiguous — there is no
    // canonical `Foo` registered.
    assert.ok(
      !o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      "alias-only import must not raise qualifier ambiguity for the canonical path",
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §18: no prefix collision --------

test("§18 alias sharing a prefix with a canonical dotted path is not a collision", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Game.Model (Circle)",
      "import Other as Game",
      "",
      "main = Game.Model.Circle",
    ].join("\n") + "\n",
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle",
    ].join("\n") + "\n",
    "Other.blk": "module Other (o)\n\no = 1\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Game.Model")!;
    const circleId = iface.exportedTerms.get("Circle")!;
    const body = bodyOf(getMain(o)!, "main")!;
    assert.equal(body.kind, "ExprQualified");
    if (body.kind !== "ExprQualified") return;
    assert.equal(body.moduleId, "Game.Model");
    if ("kind" in body.ref) throw new Error("Game.Model.Circle must resolve");
    assert.equal(body.ref.id.value, circleId.value);
  } finally {
    await o.cleanup();
  }
});

test("§18 single-segment alias `Game` still resolves independently of `Game.Model` canonical", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b)",
      "",
      "import Game.Model (Circle)",
      "import Other as Game",
      "",
      "a = Game.Model.Circle",
      "b = Game.o",
    ].join("\n") + "\n",
    "Game/Model.blk": [
      "module Game.Model (Shape (..))",
      "",
      "type Shape =",
      "  | Circle",
    ].join("\n") + "\n",
    "Other.blk": "module Other (o)\n\no = 1\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const otherIface = o.result.program!.interfaces.get("Other")!;
    const oId = otherIface.exportedTerms.get("o")!;
    const b = bodyOf(getMain(o)!, "b")!;
    assert.equal(b.kind, "ExprQualified");
    if (b.kind !== "ExprQualified") return;
    assert.equal(b.moduleId, "Other");
    if ("kind" in b.ref) throw new Error("Game.o must resolve via alias to Other");
    assert.equal(b.ref.id.value, oId.value);
  } finally {
    await o.cleanup();
  }
});

// -------- §20: type qualification obeys the same rule --------

test("§20 type qualifier collision across different modules is qualifier-ambiguous", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (identity)",
      "",
      "import Foo (T)",
      "import Bar as Foo",
      "",
      "identity :: Foo.T -> Foo.T",
      "identity s = s",
    ].join("\n") + "\n",
    "Foo.blk": [
      "module Foo (T)",
      "",
      "type T =",
      "  | MkT",
    ].join("\n") + "\n",
    "Bar.blk": [
      "module Bar (T)",
      "",
      "type T =",
      "  | MkT",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      `expected type qualifier ambiguity; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §21: constructor patterns obey the same rule --------

test("§21 pattern qualifier collision across different modules is qualifier-ambiguous", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (unwrap)",
      "",
      "import Foo (Shape (..))",
      "import Bar as Foo",
      "",
      "unwrap =",
      "  case 1 of",
      "    Foo.Circle -> 1",
    ].join("\n") + "\n",
    "Foo.blk": [
      "module Foo (Shape (..))",
      "",
      "type Shape =",
      "  | Circle",
    ].join("\n") + "\n",
    "Bar.blk": [
      "module Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
      `expected pattern qualifier ambiguity; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §22: existing selected/alias semantics stay green (spot check) --------

test("§22 selected + alias into the same module still preserves DefId identity across paths", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b, c)",
      "",
      "import Foo (x)",
      "import Foo as B",
      "",
      "a = x",
      "b = Foo.x",
      "c = B.x",
    ].join("\n") + "\n",
    "Foo.blk": "module Foo (x)\n\nx = 1\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo")!;
    const xId = iface.exportedTerms.get("x")!;
    const main = getMain(o)!;
    for (const [name, expected] of [
      ["a", "ExprVarRef"],
      ["b", "ExprQualified"],
      ["c", "ExprQualified"],
    ] as const) {
      const body = bodyOf(main, name)!;
      assert.equal(body.kind, expected);
      const ref = "ref" in body ? body.ref : null;
      if (!ref || "kind" in ref) throw new Error(`${name} must resolve`);
      assert.equal(ref.id.value, xId.value, `${name} must share x's DefId`);
    }
  } finally {
    await o.cleanup();
  }
});

// -------- §26: multi-segment canonical still unaffected --------

test("§26 multi-segment canonical qualification remains intact when no collision exists", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Data.Text (trim)",
      "",
      "main = Data.Text.trim",
    ].join("\n") + "\n",
    "Data/Text.blk": "module Data.Text (trim)\n\ntrim = 1\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Data.Text")!;
    const trimId = iface.exportedTerms.get("trim")!;
    const body = bodyOf(getMain(o)!, "main")!;
    assert.equal(body.kind, "ExprQualified");
    if (body.kind !== "ExprQualified") return;
    assert.equal(body.moduleId, "Data.Text");
    if ("kind" in body.ref) throw new Error("Data.Text.trim must resolve");
    assert.equal(body.ref.id.value, trimId.value);
  } finally {
    await o.cleanup();
  }
});
