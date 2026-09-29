// Contract: BLACK_TYPE_AMBIGUOUS on operator sites where no concrete
// numeric context resolves the operand type. Without typeclasses, a local
// `let f x y = x + y` cannot be safely generalized to `forall a. a -> a -> a`
// — the operator constrains the type to Int or Float, so this must reject
// even when the callsite would later pin down the type (Repair A + J, §21,
// §43, §44).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("arithmetic on two ambiguous metas is rejected as BLACK_TYPE_AMBIGUOUS", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: ()",
      "main =",
      "  let combine x y = x + y",
      "  in ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected typecheck failure");
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_AMBIGUOUS"),
      `expected BLACK_TYPE_AMBIGUOUS, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("comparison on two ambiguous metas is rejected as BLACK_TYPE_AMBIGUOUS", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: ()",
      "main =",
      "  let cmp x y = x < y",
      "  in ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected typecheck failure");
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_AMBIGUOUS"),
      `expected BLACK_TYPE_AMBIGUOUS, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("equality on two ambiguous metas is rejected as BLACK_TYPE_AMBIGUOUS", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: ()",
      "main =",
      "  let same x y = x == y",
      "  in ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected typecheck failure");
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_AMBIGUOUS"),
      `expected BLACK_TYPE_AMBIGUOUS, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("arithmetic on ambiguous metas still rejects even when callsite pins Int", async () => {
  // The local body `x + y` has no concrete numeric context. HM without
  // typeclasses cannot generalize `+ :: a -> a -> a`. Reject at the
  // operator site regardless of downstream usage.
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  let combine x y = x + y",
      "  in combine 1 2",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected typecheck failure");
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_AMBIGUOUS"),
      `expected BLACK_TYPE_AMBIGUOUS, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("arithmetic works when at least one operand is a concrete literal", async () => {
  // Positive control — `x + 1` gives `+` a concrete Int side, so no
  // deferred meta remains.
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  let inc x = x + 1",
      "  in inc 3",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("comparison works when at least one operand is a concrete Float", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Bool",
      "main =",
      "  let less x = x < 1.0",
      "  in less 0.5",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});
