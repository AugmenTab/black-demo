// Contract: closed structural records (§32–§37).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";

test("field access on a record literal typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = { x = 1, y = 2 }.x",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("access to a missing field fails BLACK_UNKNOWN_FIELD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = { x = 1 }.y",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_UNKNOWN_FIELD"),
      `expected unknown field; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("duplicate field label in a record literal fails BLACK_DUPLICATE_RECORD_FIELD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = { x = 1, x = 2 }.x",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_DUPLICATE_RECORD_FIELD"),
      `expected duplicate; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// Phase-04_2 §24: duplicate-field audit — all four syntactic forms.
test("[dup-field §24] duplicate field label in a record TYPE declaration fails BLACK_DUPLICATE_RECORD_FIELD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type R = { x :: Int, x :: Text }",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_DUPLICATE_RECORD_FIELD"),
      `expected duplicate in type decl; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("[dup-field §24] duplicate field label in a record UPDATE fails BLACK_DUPLICATE_RECORD_FIELD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = ({ x = 1, y = 2 } { x = 10, x = 20 }).x",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_DUPLICATE_RECORD_FIELD"),
      `expected duplicate in update; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

test("[dup-field §24] duplicate field label in a record PATTERN fails BLACK_DUPLICATE_RECORD_FIELD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "get :: { x :: Int, y :: Int } -> Int",
      "get { x = a, x = b } = a",
      "",
      "main :: Int",
      "main = get { x = 1, y = 2 }",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_DUPLICATE_RECORD_FIELD"),
      `expected duplicate in pattern; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
