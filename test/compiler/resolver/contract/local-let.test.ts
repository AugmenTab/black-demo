// Contract: sequential non-recursive local `let` (phase-03_5.md §3–§6).
//
// A binding's RHS may reference:
//   * the enclosing lexical scope;
//   * bindings introduced earlier in the same `let` block.
//
// A RHS may NOT reference:
//   * itself;
//   * bindings introduced later in the same block.
//
// The `in` body sees all bindings in the block.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModules } from "../helpers/resolve.js";
import type {
  ResolvedExpr,
  ResolvedDeclDefinition,
} from "../../../../src/compiler/resolver/types.js";

function bodyOf(o: { result: { program: unknown } }, name: string): ResolvedExpr {
  const prog = (o.result as { program: { modules: Map<string, { declarations: unknown[] }> } })
    .program;
  const modMain = prog.modules.get("Main")!;
  const decl = modMain.declarations.find(
    (d) => (d as ResolvedDeclDefinition).kind === "DeclDefinition" &&
           (d as ResolvedDeclDefinition).name === name,
  ) as ResolvedDeclDefinition;
  return decl.body!;
}

test("earlier sibling is visible to a later binding's RHS", async () => {
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
    const body = bodyOf(o, "foo");
    assert.equal(body.kind, "ExprLet");
    if (body.kind !== "ExprLet") return;
    const a = body.bindings[0]!;
    const b = body.bindings[1]!;
    // b's RHS references 'a' — that reference must resolve to a's binder DefId.
    assert.equal(b.body.kind, "ExprVarRef");
    if (b.body.kind !== "ExprVarRef") return;
    assert.ok(!("kind" in b.body.ref), "b's RHS must be a resolved reference");
    if ("kind" in b.body.ref) return;
    assert.equal(b.body.ref.id.value, a.binder.id.value, "b's RHS must resolve to a's DefId");
  } finally {
    await o.cleanup();
  }
});

test("chained earlier-sibling visibility resolves through a chain", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = 1",
      "    b = a",
      "    c = b",
      "  in",
      "    c",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const body = bodyOf(o, "foo");
    if (body.kind !== "ExprLet") return assert.fail("expected ExprLet");
    const a = body.bindings[0]!;
    const b = body.bindings[1]!;
    const c = body.bindings[2]!;
    // c's RHS references b — should resolve to b's binder.
    if (c.body.kind !== "ExprVarRef" || "kind" in c.body.ref) return assert.fail("c ref unresolved");
    assert.equal(c.body.ref.id.value, b.binder.id.value);
    // b's RHS references a — should resolve to a's binder.
    if (b.body.kind !== "ExprVarRef" || "kind" in b.body.ref) return assert.fail("b ref unresolved");
    assert.equal(b.body.ref.id.value, a.binder.id.value);
  } finally {
    await o.cleanup();
  }
});

test("self-reference in a let binding does NOT resolve to that binding", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = a",
      "  in",
      "    a",
    ].join("\n") + "\n",
  });
  try {
    // 'a' on the RHS is unknown; the binder 'a' being defined is NOT in scope.
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected BLACK_NAME_UNKNOWN; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("forward reference to a later sibling does NOT resolve", async () => {
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
      `expected BLACK_NAME_UNKNOWN for forward reference; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("the `in` body sees every binding in the let block", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = 1",
      "    b = 2",
      "  in",
      "    a + b",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.errors.length, 0, `unexpected errors: ${JSON.stringify(o.errors)}`);
    const body = bodyOf(o, "foo");
    if (body.kind !== "ExprLet") return assert.fail("expected ExprLet");
    const a = body.bindings[0]!;
    const b = body.bindings[1]!;
    const bod = body.body;
    if (bod.kind !== "ExprInfix") return assert.fail("expected ExprInfix");
    const left = bod.left;
    const right = bod.right;
    if (left.kind !== "ExprVarRef" || "kind" in left.ref) return assert.fail("left unresolved");
    if (right.kind !== "ExprVarRef" || "kind" in right.ref) return assert.fail("right unresolved");
    assert.equal(left.ref.id.value, a.binder.id.value);
    assert.equal(right.ref.id.value, b.binder.id.value);
  } finally {
    await o.cleanup();
  }
});

test("inner let shadowing an outer parameter resolves to the inner binder and emits BLACK_NAME_SHADOWING", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo x =",
      "  let",
      "    x = 1",
      "  in",
      "    x",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(
      o.errors.length,
      0,
      `unexpected errors: ${JSON.stringify(o.errors)}`,
    );
    assert.ok(
      o.warnings.some((d) => d.code === "BLACK_NAME_SHADOWING"),
      `expected BLACK_NAME_SHADOWING warning; got ${o.warnings.map((e) => e.code).join(", ")}`,
    );
    const body = bodyOf(o, "foo");
    if (body.kind !== "ExprLet") return assert.fail("expected ExprLet");
    const innerX = body.bindings[0]!;
    const bod = body.body;
    if (bod.kind !== "ExprVarRef" || "kind" in bod.ref) return assert.fail("body unresolved");
    assert.equal(bod.ref.id.value, innerX.binder.id.value, "body 'x' must resolve to inner let binder");
  } finally {
    await o.cleanup();
  }
});

test("nested let: inner block's RHS can see the outer block's binding", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = 1",
      "    b =",
      "      let",
      "        c = a",
      "      in",
      "        c",
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

test("duplicate binding in one let block is BLACK_NAME_DUPLICATE_BINDING (§30 matrix, §6 trailing case)", async () => {
  const o = await resolveModules({
    "Main.blk": [
      "module Main (foo)",
      "",
      "foo =",
      "  let",
      "    a = 1",
      "    a = 2",
      "  in",
      "    a",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errors.some((d) => d.code === "BLACK_NAME_DUPLICATE_BINDING"),
      `expected BLACK_NAME_DUPLICATE_BINDING; got ${o.errors.map((e) => e.code).join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
