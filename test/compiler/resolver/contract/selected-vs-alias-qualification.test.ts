// Contract: Phase 3.7 selected-import vs. alias-import qualification
// visibility (phase-03_3.md §§13-20). Selected imports expose the selected
// declarations both unqualified and through the canonical dotted path,
// but not other exports. Alias imports expose the module's whole exported
// interface through the alias only — never through the canonical path.

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

// -------- §13: selected term visibility matrix --------

test("§13 selected term is visible both unqualified and canonically", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (mainA, mainB)",
      "",
      "import Foo.Bar (x)",
      "",
      "mainA = x",
      "mainB = Foo.Bar.x",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const xId = iface.exportedTerms.get("x")!;
    const main = getMain(o)!;
    const aBody = bodyOf(main, "mainA")!;
    const bBody = bodyOf(main, "mainB")!;
    assert.equal(aBody.kind, "ExprVarRef");
    if (aBody.kind !== "ExprVarRef") return;
    if ("kind" in aBody.ref) throw new Error("unqualified x must resolve");
    assert.equal(aBody.ref.id.value, xId.value);
    assert.equal(bBody.kind, "ExprQualified");
    if (bBody.kind !== "ExprQualified") return;
    assert.equal(bBody.moduleId, "Foo.Bar");
    if ("kind" in bBody.ref) throw new Error("canonical x must resolve");
    assert.equal(bBody.ref.id.value, xId.value, "canonical must reuse selected DefId");
  } finally {
    await o.cleanup();
  }
});

test("§13 selected import does NOT expose an unselected export unqualified", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "",
      "main = y",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected 'y' unknown; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("§13 selected import does NOT expose an unselected export via canonical qualifier", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "",
      "main = Foo.Bar.y",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected BLACK_QUALIFIED_NAME_UNKNOWN for Foo.Bar.y; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §14: selected Type (..) visibility --------

test("§14 selected `Type (..)` exposes the type and its constructors both ways with matching DefIds", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (mkShape, mkQualifiedShape)",
      "",
      "import Foo.Bar (Shape (..))",
      "",
      "mkShape = Circle 1",
      "mkQualifiedShape = Foo.Bar.Circle 2",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
      "  | Square Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const circleId = iface.exportedTerms.get("Circle")!;
    const main = getMain(o)!;
    const unqBody = bodyOf(main, "mkShape")!;
    const qBody = bodyOf(main, "mkQualifiedShape")!;

    // Unqualified: ExprApp(ExprConRef Circle, 1)
    assert.equal(unqBody.kind, "ExprApp");
    if (unqBody.kind !== "ExprApp") return;
    assert.equal(unqBody.fn.kind, "ExprConRef");
    if (unqBody.fn.kind !== "ExprConRef") return;
    if ("kind" in unqBody.fn.ref) throw new Error("unqualified Circle must resolve");
    assert.equal(unqBody.fn.ref.id.value, circleId.value);

    // Canonical: ExprApp(ExprQualified{Foo.Bar, Circle}, 2)
    assert.equal(qBody.kind, "ExprApp");
    if (qBody.kind !== "ExprApp") return;
    assert.equal(qBody.fn.kind, "ExprQualified");
    if (qBody.fn.kind !== "ExprQualified") return;
    assert.equal(qBody.fn.moduleId, "Foo.Bar");
    if ("kind" in qBody.fn.ref) throw new Error("canonical Circle must resolve");
    assert.equal(qBody.fn.ref.id.value, circleId.value, "canonical must reuse constructor DefId");
  } finally {
    await o.cleanup();
  }
});

test("§14 selected `Type (..)` also exposes the type name canonically", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (identity)",
      "",
      "import Foo.Bar (Shape (..))",
      "",
      "identity :: Foo.Bar.Shape -> Foo.Bar.Shape",
      "identity s = s",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

// -------- §15: plain selected type hides constructors --------

test("§15 selected plain type (no `(..)`) exposes the type both ways but NOT its constructors", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (identity)",
      "",
      "import Foo.Bar (Shape)",
      "",
      "identity :: Shape -> Foo.Bar.Shape",
      "identity s = s",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("§15 selected plain type does NOT expose constructors unqualified", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (Shape)",
      "",
      "main = Circle 1",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected 'Circle' unknown unqualified; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("§15 selected plain type does NOT expose constructors canonically", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (Shape)",
      "",
      "main = Foo.Bar.Circle 1",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected BLACK_QUALIFIED_NAME_UNKNOWN for Foo.Bar.Circle; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §16: alias-only import --------

test("§16 alias-only import exposes the whole exported interface through the alias", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b)",
      "",
      "import Foo.Bar as B",
      "",
      "a = B.x",
      "b = B.Circle 1",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..), x)",
      "",
      "type Shape =",
      "  | Circle Int",
      "",
      "x = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

test("§16 alias-only import does NOT expose names unqualified", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar as B",
      "",
      "main = x",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x)",
      "",
      "x = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected 'x' unknown; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("§16 alias-only import does NOT expose the canonical module path as a qualifier", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar as B",
      "",
      "main = Foo.Bar.x",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x)",
      "",
      "x = 0",
    ].join("\n") + "\n",
  });
  try {
    // The canonical path is not a registered qualifier here. It falls through
    // to structural, where the `Foo` head fails as an unknown term. Any of
    // those diagnostic codes proves the qualification did not resolve.
    assert.ok(
      o.errors.some(
        (d) =>
          d.code === "BLACK_MODULE_ALIAS_UNKNOWN" ||
          d.code === "BLACK_QUALIFIED_NAME_UNKNOWN" ||
          d.code === "BLACK_NAME_UNKNOWN",
      ),
      `expected qualification/alias/name failure; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("§16 alias-only import does NOT expose constructors canonically", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar as B",
      "",
      "main = Foo.Bar.Circle 1",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some(
        (d) =>
          d.code === "BLACK_MODULE_ALIAS_UNKNOWN" ||
          d.code === "BLACK_QUALIFIED_NAME_UNKNOWN" ||
          d.code === "BLACK_NAME_UNKNOWN",
      ),
      `expected qualification/alias/name failure; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §17: both imports coexist with identity preservation --------

test("§17 both selected and alias imports give the SAME DefId across x, Foo.Bar.x, B.x", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b, c)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar as B",
      "",
      "a = x",
      "b = Foo.Bar.x",
      "c = B.x",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const xId = iface.exportedTerms.get("x")!;
    const main = getMain(o)!;
    const aBody = bodyOf(main, "a")!;
    const bBody = bodyOf(main, "b")!;
    const cBody = bodyOf(main, "c")!;

    // a = x — ExprVarRef → x DefId
    assert.equal(aBody.kind, "ExprVarRef");
    if (aBody.kind !== "ExprVarRef") return;
    if ("kind" in aBody.ref) throw new Error("x must resolve");
    assert.equal(aBody.ref.id.value, xId.value);

    // b = Foo.Bar.x — ExprQualified{Foo.Bar} → x DefId
    assert.equal(bBody.kind, "ExprQualified");
    if (bBody.kind !== "ExprQualified") return;
    assert.equal(bBody.moduleId, "Foo.Bar");
    if ("kind" in bBody.ref) throw new Error("Foo.Bar.x must resolve");
    assert.equal(bBody.ref.id.value, xId.value);

    // c = B.x — ExprQualified{Foo.Bar via B} → x DefId
    assert.equal(cBody.kind, "ExprQualified");
    if (cBody.kind !== "ExprQualified") return;
    assert.equal(cBody.moduleId, "Foo.Bar");
    if ("kind" in cBody.ref) throw new Error("B.x must resolve");
    assert.equal(cBody.ref.id.value, xId.value);
  } finally {
    await o.cleanup();
  }
});

test("§17 constructors selected via Type (..) unify across unqualified, canonical, alias", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b, c)",
      "",
      "import Foo.Bar (Shape (..))",
      "import Foo.Bar as B",
      "",
      "a = Circle 1",
      "b = Foo.Bar.Circle 2",
      "c = B.Circle 3",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (Shape (..))",
      "",
      "type Shape =",
      "  | Circle Int",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const circleId = iface.exportedTerms.get("Circle")!;
    const main = getMain(o)!;
    const bodies = ["a", "b", "c"].map((n) => bodyOf(main, n)!);
    const refs: number[] = [];
    for (const body of bodies) {
      assert.equal(body.kind, "ExprApp");
      if (body.kind !== "ExprApp") return;
      const fn = body.fn;
      if (fn.kind === "ExprConRef") {
        if ("kind" in fn.ref) throw new Error("ctor must resolve");
        refs.push(fn.ref.id.value);
      } else if (fn.kind === "ExprQualified") {
        if ("kind" in fn.ref) throw new Error("qualified ctor must resolve");
        refs.push(fn.ref.id.value);
      } else {
        throw new Error(`unexpected fn kind ${fn.kind}`);
      }
    }
    for (const r of refs) assert.equal(r, circleId.value);
  } finally {
    await o.cleanup();
  }
});

test("§17 unselected export y is visible ONLY through the alias, not unqualified, not canonically", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (viaAlias)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar as B",
      "",
      "viaAlias = B.y",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const yId = iface.exportedTerms.get("y")!;
    const main = getMain(o)!;
    const body = bodyOf(main, "viaAlias")!;
    assert.equal(body.kind, "ExprQualified");
    if (body.kind !== "ExprQualified") return;
    assert.equal(body.moduleId, "Foo.Bar");
    if ("kind" in body.ref) throw new Error("B.y must resolve");
    assert.equal(body.ref.id.value, yId.value);
  } finally {
    await o.cleanup();
  }
});

test("§17 unselected y is unknown unqualified even with alias in scope", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar as B",
      "",
      "main = y",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected 'y' unknown; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("§17 unselected y is not visible via canonical Foo.Bar even with alias in scope", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar as B",
      "",
      "main = Foo.Bar.y",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected BLACK_QUALIFIED_NAME_UNKNOWN for Foo.Bar.y; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §18: import-order invariance --------

test("§18 alias-then-selected produces identical visibility as selected-then-alias", async () => {
  const sources = (order: "selected-first" | "alias-first") => ({
    "Main.blk":
      (order === "selected-first"
        ? [
            "module Main (a, b, c)",
            "",
            "import Foo.Bar (x)",
            "import Foo.Bar as B",
          ]
        : [
            "module Main (a, b, c)",
            "",
            "import Foo.Bar as B",
            "import Foo.Bar (x)",
          ]
      ).concat(["", "a = x", "b = Foo.Bar.x", "c = B.x"]).join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y)",
      "",
      "x = 1",
      "y = 2",
    ].join("\n") + "\n",
  });

  const oA = await resolveModules(sources("selected-first"));
  const oB = await resolveModules(sources("alias-first"));
  try {
    assert.equal(oA.errors.length, 0, `errors in selected-first: ${JSON.stringify(oA.errors)}`);
    assert.equal(oB.errors.length, 0, `errors in alias-first: ${JSON.stringify(oB.errors)}`);
    const ifaceA = oA.result.program!.interfaces.get("Foo.Bar")!;
    const ifaceB = oB.result.program!.interfaces.get("Foo.Bar")!;
    const xIdA = ifaceA.exportedTerms.get("x")!.value;
    const xIdB = ifaceB.exportedTerms.get("x")!.value;
    for (const [outcome, xId] of [
      [oA, xIdA],
      [oB, xIdB],
    ] as const) {
      const main = outcome.result.program!.modules.get("Main")!;
      for (const name of ["a", "b", "c"]) {
        const body = bodyOf(main, name)!;
        let refValue: number;
        if (body.kind === "ExprVarRef") {
          if ("kind" in body.ref) throw new Error(`${name} must resolve`);
          refValue = body.ref.id.value;
        } else if (body.kind === "ExprQualified") {
          if ("kind" in body.ref) throw new Error(`${name} qualified must resolve`);
          refValue = body.ref.id.value;
        } else {
          throw new Error(`${name}: unexpected ${body.kind}`);
        }
        assert.equal(refValue, xId, `${name} must resolve to the shared x DefId`);
      }
    }
  } finally {
    await oA.cleanup();
    await oB.cleanup();
  }
});

// -------- §19: duplicate selected imports of same identity --------

test("§19 two selected imports of the same declaration do not manufacture ambiguity", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar (x)",
      "",
      "main = x",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x)",
      "",
      "x = 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const xId = iface.exportedTerms.get("x")!;
    const body = bodyOf(getMain(o)!, "main")!;
    assert.equal(body.kind, "ExprVarRef");
    if (body.kind !== "ExprVarRef") return;
    if ("kind" in body.ref) throw new Error("x must resolve");
    assert.equal(body.ref.id.value, xId.value);
  } finally {
    await o.cleanup();
  }
});

// -------- §20: canonical qualifier merging --------

test("§20 canonical qualifier scope merges across separate selected imports of the same module", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (a, b)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar (y)",
      "",
      "a = Foo.Bar.x",
      "b = Foo.Bar.y",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y, z)",
      "",
      "x = 1",
      "y = 2",
      "z = 3",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const iface = o.result.program!.interfaces.get("Foo.Bar")!;
    const xId = iface.exportedTerms.get("x")!;
    const yId = iface.exportedTerms.get("y")!;
    const main = getMain(o)!;
    const aBody = bodyOf(main, "a")!;
    const bBody = bodyOf(main, "b")!;
    assert.equal(aBody.kind, "ExprQualified");
    if (aBody.kind !== "ExprQualified") return;
    if ("kind" in aBody.ref) throw new Error("Foo.Bar.x must resolve");
    assert.equal(aBody.ref.id.value, xId.value);
    assert.equal(bBody.kind, "ExprQualified");
    if (bBody.kind !== "ExprQualified") return;
    if ("kind" in bBody.ref) throw new Error("Foo.Bar.y must resolve");
    assert.equal(bBody.ref.id.value, yId.value);
  } finally {
    await o.cleanup();
  }
});

test("§20 canonical merging still refuses unselected exports (z remains unqualified-invisible)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "import Foo.Bar (y)",
      "",
      "main = Foo.Bar.z",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x, y, z)",
      "",
      "x = 1",
      "y = 2",
      "z = 3",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected BLACK_QUALIFIED_NAME_UNKNOWN for Foo.Bar.z; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// -------- §25: no heuristic shortened alias --------

test("§25 selected import does NOT introduce a shortened alias like `Bar`", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (x)",
      "",
      "main = Bar.x",
    ].join("\n") + "\n",
    "Foo/Bar.blk": [
      "module Foo.Bar (x)",
      "",
      "x = 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some(
        (d) => d.code === "BLACK_MODULE_ALIAS_UNKNOWN" || d.code === "BLACK_NAME_UNKNOWN",
      ),
      `expected alias-unknown/name-unknown failure; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
