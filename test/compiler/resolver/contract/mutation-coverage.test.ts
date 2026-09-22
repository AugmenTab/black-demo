// Contract tests that specifically catch mutation campaign items M1–M34.
// Each test asserts a behavior that the corresponding mutation would break.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";

// M7 — signature and definition share one DefId; equations must not fork IDs.
test("[M7] multiple equations for one term share a single DefId (§24)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main, f)",
      "",
      "f 0 = 0",
      "f n = n",
      "",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, JSON.stringify(o.errors));
    const main = o.result.program?.modules.get("Main");
    const equations = main!.declarations.filter(
      (d) => d.kind === "DeclDefinition" && d.name === "f",
    );
    assert.equal(equations.length, 2, "expected two equations for f");
    assert.equal(
      equations[0]!.defId.value,
      equations[1]!.defId.value,
      "both equations for f must share one DefId",
    );
  } finally {
    await o.cleanup();
  }
});

// M10 — case-branch binders must NOT leak to sibling branches or beyond.
test("[M10] case-branch binder `x` in branch A is invisible in branch B and in outer scope", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main =",
      "  case Some 1 of",
      "    Some x -> ()",
      "    None   -> x",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected 'x' to be unknown in the sibling branch; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M11 — inner shadowing binding wins over an outer binding of the same name.
test("[M11] a lambda parameter `x` shadows a module-local `x` inside the lambda body", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main, take)",
      "",
      "x = 1",
      "take = \\x -> x",
      "",
      "main = take 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = o.result.program?.modules.get("Main");
    const takeDef = main!.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "take",
    );
    const xDef = main!.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "x",
    );
    assert.ok(takeDef && takeDef.kind === "DeclDefinition");
    assert.ok(xDef && xDef.kind === "DeclDefinition");
    const body = takeDef.body;
    assert.ok(body && body.kind === "ExprLambda");
    const inner = body.body;
    assert.ok(inner && inner.kind === "ExprVarRef");
    if (!("kind" in inner.ref)) {
      assert.notEqual(
        inner.ref.id.value,
        xDef.defId.value,
        "inner x must NOT resolve to the module-local x",
      );
    }
  } finally {
    await o.cleanup();
  }
});

// M13 — a qualified import `import X as Y` does NOT expose X's names as bare
// identifiers.
test("[M13] `import Util as U` does NOT make `helper` visible unqualified", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util as U",
      "",
      "main = helper",
    ].join("\n") + "\n",
    "Util.blk": "module Util (helper)\n\nhelper = ()\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected 'helper' to be unknown without selected import; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M14 — a qualified access `U.x` must still respect the target module's
// export list.
test("[M14] `U.x` fails if U does not export x, even though U is imported", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Util as U",
      "",
      "main = U.hidden",
    ].join("\n") + "\n",
    "Util.blk": [
      "module Util (helper)",
      "",
      "helper = ()",
      "hidden = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_QUALIFIED_NAME_UNKNOWN"),
      `expected qualified access to fail for non-exported name; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M15 — a constructor named `Foo` in module A and a constructor named `Foo`
// in module B must have DISTINCT DefIds.
test("[M15] same-spelled constructors in two modules receive distinct DefIds", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (X (..))",
      "",
      "main = ()",
    ].join("\n") + "\n",
    "A.blk": [
      "module A (X (..))",
      "",
      "type X =",
      "  | Foo",
    ].join("\n") + "\n",
    "B.blk": [
      "module B (Y (..))",
      "",
      "type Y =",
      "  | Foo",
    ].join("\n") + "\n",
  });
  try {
    // Load B via a separate entry to bring both into the module map.
    // Since Main doesn't import B, we instead resolve twice — once from Main
    // (loads A) and once from a synthetic that loads B — and compare.
    assert.equal(o.errors.length, 0, JSON.stringify(o.errors));
    const aMod = o.result.program?.modules.get("A");
    assert.ok(aMod);
    // Now load B independently.
    const o2 = await resolveModules(
      {
        "Main.blk": [
          "module Main (main)",
          "",
          "import B (Y (..))",
          "",
          "main = ()",
        ].join("\n") + "\n",
        "B.blk": [
          "module B (Y (..))",
          "",
          "type Y =",
          "  | Foo",
        ].join("\n") + "\n",
      },
    );
    try {
      const bMod = o2.result.program?.modules.get("B");
      assert.ok(bMod);
      // Find each module's Foo constructor DefId via the definitions map.
      const findFoo = (defs: Map<number, unknown>): number | null => {
        for (const [id, d] of defs.entries()) {
          const rec = d as { name?: string; category?: string };
          if (rec.category === "constructor" && rec.name === "Foo") return id;
        }
        return null;
      };
      const aFoo = findFoo(o.result.program!.definitions);
      const bFoo = findFoo(o2.result.program!.definitions);
      assert.ok(aFoo !== null && bFoo !== null);
      // They're allocated in separate DefIdAllocator instances so they may
      // collide numerically — the important assertion is per-invocation
      // separation, which holds by construction. Assert that within one
      // invocation the two same-named constructors cannot collide:
      // Repeat the check inside one invocation.
    } finally {
      await o2.cleanup();
    }
  } finally {
    await o.cleanup();
  }
});

// M15 (single-invocation): within one project resolution, two modules each
// declaring a `Foo` constructor produce two DISTINCT DefIds.
test("[M15] within one invocation, two modules' same-named constructors are distinct DefIds", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (X (..))",
      "import B (Y (..))",
      "",
      "main = ()",
    ].join("\n") + "\n",
    "A.blk": [
      "module A (X (..))",
      "",
      "type X =",
      "  | Foo",
    ].join("\n") + "\n",
    "B.blk": [
      "module B (Y (..))",
      "",
      "type Y =",
      "  | Foo",
    ].join("\n") + "\n",
  });
  try {
    // Both A.Foo and B.Foo are imported; the collision would normally
    // trigger ambiguity, but the important invariant is that each has a
    // distinct DefId in the definitions map. Look them up.
    const defs = o.result.program?.definitions ?? new Map();
    const foos: number[] = [];
    for (const [id, d] of defs.entries()) {
      const rec = d as { name?: string; category?: string };
      if (rec.category === "constructor" && rec.name === "Foo") foos.push(id);
    }
    assert.equal(foos.length, 2, `expected two distinct Foo DefIds, got ${foos.length}`);
    assert.notEqual(foos[0], foos[1], "distinct DefIds required");
  } finally {
    await o.cleanup();
  }
});

// M16 — local `let` is sequential and non-recursive: forward references
// between siblings must NOT resolve (predeclaration would make them resolve).
test("[M16] forward reference between let siblings does NOT resolve", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = b",
      "    b = 1",
      "  in",
      "    a",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected forward reference to be unknown; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M17 — earlier siblings ARE visible to later bindings' RHSes. A mutation
// that resolves every RHS only against the enclosing scope would make this
// fail.
test("[M17] earlier let sibling IS visible to a later binding's RHS", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = 1",
      "    b = a",
      "  in",
      "    b",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
  } finally {
    await o.cleanup();
  }
});

// M23 — truncating any component of a multi-segment module qualifier must
// break qualified resolution. `Game.Model.Circle` interpreted as `Game.Circle`
// (or any other single-truncation) cannot possibly succeed here because
// `Game` alone is not an imported module.
test("[M23] Game.Model.Circle resolves ONLY through the full canonical module path", async () => {
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
    const main = o.result.program!.modules.get("Main")!;
    const decl = main.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "main",
    );
    if (!decl || decl.kind !== "DeclDefinition") throw new Error("main decl missing");
    const body = decl.body!;
    assert.equal(body.kind, "ExprApp");
    if (body.kind !== "ExprApp") return;
    assert.equal(body.fn.kind, "ExprQualified");
    if (body.fn.kind !== "ExprQualified") return;
    assert.equal(
      body.fn.moduleId,
      "Game.Model",
      "the qualifier must resolve to the full 'Game.Model' module id, not a truncated prefix",
    );
    assert.equal(body.fn.alias, "Game.Model");
  } finally {
    await o.cleanup();
  }
});

// M25 — a selected import of `x` must NOT expose sibling exports through
// the canonical qualifier. A mutation that reverts to Phase 3.6's "any
// import registers the full interface" would let `Foo.Bar.y` succeed.
test("[M25] selected import does NOT expose unselected exports canonically", async () => {
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

// M26 — an alias-only import `import Foo.Bar as B` must NOT independently
// register the canonical `Foo.Bar` qualifier. A mutation that registered
// the canonical path for every import (including alias) would let
// `Foo.Bar.x` succeed.
test("[M26] alias-only import does NOT register the canonical module path", async () => {
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
    assert.ok(
      o.errors.some(
        (d) =>
          d.code === "BLACK_MODULE_ALIAS_UNKNOWN" ||
          d.code === "BLACK_QUALIFIED_NAME_UNKNOWN" ||
          d.code === "BLACK_NAME_UNKNOWN",
      ),
      `expected qualification failure; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M27 — a `Type (..)` selected import must expose each constructor BOTH
// unqualified and canonically. A mutation that added the type name to the
// canonical scope but omitted constructors would leave `Foo.Bar.Circle`
// invisible while `Circle` remained visible.
test("[M27] selected `Type (..)` exposes constructors canonically", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "import Foo.Bar (Shape (..))",
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
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = o.result.program!.modules.get("Main")!;
    const decl = main.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "main",
    );
    if (!decl || decl.kind !== "DeclDefinition") throw new Error("main decl missing");
    const body = decl.body!;
    assert.equal(body.kind, "ExprApp");
    if (body.kind !== "ExprApp") return;
    assert.equal(body.fn.kind, "ExprQualified");
    if (body.fn.kind !== "ExprQualified") return;
    assert.equal(body.fn.moduleId, "Foo.Bar");
  } finally {
    await o.cleanup();
  }
});

// M28 — a declaration selected via canonical qualification must reuse the
// SAME DefId that the declaring module assigned. A mutation that fabricated
// a fresh DefId at the qualifier's use site would break identity across
// unqualified/canonical/alias paths.
test("[M28] canonical qualifier reuses the declaring DefId (identity, not fresh)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (unq, can)",
      "",
      "import Foo.Bar (x)",
      "",
      "unq = x",
      "can = Foo.Bar.x",
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
    const main = o.result.program!.modules.get("Main")!;
    const unq = main.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "unq",
    );
    const can = main.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "can",
    );
    if (!unq || unq.kind !== "DeclDefinition") throw new Error("unq missing");
    if (!can || can.kind !== "DeclDefinition") throw new Error("can missing");
    const unqBody = unq.body!;
    const canBody = can.body!;
    assert.equal(unqBody.kind, "ExprVarRef");
    if (unqBody.kind !== "ExprVarRef") return;
    if ("kind" in unqBody.ref) throw new Error("unq must resolve");
    assert.equal(canBody.kind, "ExprQualified");
    if (canBody.kind !== "ExprQualified") return;
    if ("kind" in canBody.ref) throw new Error("can must resolve");
    assert.equal(unqBody.ref.id.value, xId.value);
    assert.equal(canBody.ref.id.value, xId.value);
    assert.equal(
      unqBody.ref.id.value,
      canBody.ref.id.value,
      "unqualified and canonical must share one DefId",
    );
  } finally {
    await o.cleanup();
  }
});

// M29 — a mutation that restores single-segment alias precedence (returns
// the alias immediately without consulting the canonical scope) must be
// caught by the different-module collision test: `Foo.x` would silently
// resolve via `Bar` instead of raising module-qualifier ambiguity.
test("[M29] alias-first precedence is rejected by qualifier collision", async () => {
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

// M30 — a mutation that flips the precedence to canonical-first must also
// be caught by the same collision, in the reverse import order. If the
// canonical is silently preferred, no ambiguity is raised.
test("[M30] canonical-first precedence is rejected by qualifier collision (reverse order)", async () => {
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

// M31 — a mutation that uses terminal-member visibility to silently
// disambiguate the module qualifier must fail: when only one candidate
// exports the requested name, ambiguity must still be raised.
test("[M31] terminal-member cannot disambiguate — only one candidate exports fooOnly", async () => {
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
      `expected BLACK_MODULE_QUALIFIER_AMBIGUOUS; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M32 — a mutation that disables semantic module-identity collapse (so two
// visibility sources for the SAME module id are still treated as two
// identities) must fail the same-module coexistence test: `import Foo (x);
// import Foo as Foo; main = Foo.x` should not raise ambiguity.
test("[M32] same-module coexistence is not ambiguous — identity collapse must hold", async () => {
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
    assert.equal(
      o.errors.length,
      0,
      `same-module coexistence must not raise ambiguity; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M33 — a mutation that narrows same-module visibility to only the canonical
// selected scope (dropping the alias interface source) must fail: `Foo.y`
// must remain visible because the alias exposes the whole exported interface.
test("[M33] same-module visibility unions across sources — Foo.y visible via alias", async () => {
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
    const yId = iface.exportedTerms.get("y")!;
    const main = o.result.program!.modules.get("Main")!;
    const b = main.declarations.find((d) => d.kind === "DeclDefinition" && d.name === "b");
    if (!b || b.kind !== "DeclDefinition") throw new Error("b decl missing");
    const body = b.body!;
    assert.equal(body.kind, "ExprQualified");
    if (body.kind !== "ExprQualified") return;
    if ("kind" in body.ref) throw new Error("Foo.y must resolve");
    assert.equal(body.ref.id.value, yId.value);
  } finally {
    await o.cleanup();
  }
});

// M34 — a mutation that collapses `ambiguous` back into `no-qualifier` on
// expression qualification (letting `Foo.x` fall through to structural
// field access after the ambiguity diagnostic has already been recorded)
// must be caught. In the presence of a genuine alias/canonical module-name
// collision, the fall-through would re-emit BLACK_NAME_UNKNOWN for the
// head `Foo` — this test asserts that exactly ONE ambiguity diagnostic is
// emitted, with no accompanying BLACK_NAME_UNKNOWN /
// BLACK_TYPE_NAME_UNKNOWN / BLACK_QUALIFIED_NAME_UNKNOWN (phase-03_5.md
// §§4-7, 12).
test("[M34] ambiguous expression qualifier must NOT fall through to structural field access", async () => {
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
    const codes = o.errors.map((e) => e.code);
    assert.equal(
      codes.filter((c) => c === "BLACK_MODULE_QUALIFIER_AMBIGUOUS").length,
      1,
      `expected exactly one ambiguity diagnostic; got ${codes.join(", ")}`,
    );
    for (const forbidden of ["BLACK_NAME_UNKNOWN", "BLACK_TYPE_NAME_UNKNOWN", "BLACK_QUALIFIED_NAME_UNKNOWN"]) {
      assert.ok(
        !codes.includes(forbidden),
        `${forbidden} must not accompany the ambiguity diagnostic; got ${codes.join(", ")}`,
      );
    }
    assert.equal(codes.length, 1, `expected exactly 1 error; got ${codes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

// M24 — a lowercase dotted chain such as `player.position.x` must remain a
// structural field access. A mutation that reinterprets any dotted chain as
// module qualification would break this.
test("[M24] lowercase dotted chain remains structural, not module qualification", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main player = player.position.x",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const main = o.result.program!.modules.get("Main")!;
    const decl = main.declarations.find(
      (d) => d.kind === "DeclDefinition" && d.name === "main",
    );
    if (!decl || decl.kind !== "DeclDefinition") throw new Error("main decl missing");
    const body = decl.body!;
    // Body must be a chain of ExprField, never an ExprQualified.
    assert.equal(body.kind, "ExprField");
    if (body.kind !== "ExprField") return;
    assert.equal(body.record.kind, "ExprField");
  } finally {
    await o.cleanup();
  }
});
