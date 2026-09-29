// Contract: selective record patterns (§17–§19). A pattern that names a
// subset of the expected record's fields is accepted; omitted fields behave
// as wildcards. Unknown fields still emit BLACK_UNKNOWN_FIELD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { typecheckModules } from "../helpers/check.js";
import type { TypedPattern, TypedDecl } from "../../../../src/compiler/typecheck/typed-ast.js";

test("selective record pattern accepts omitted fields", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "getName :: { name :: Text, lives :: Int } -> Text",
      "getName { name = n } = n",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("nested selective record pattern accepts omitted fields at every level", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "getCity",
      "  :: { address :: { city :: Text, zip :: Int }",
      "     , name :: Text",
      "     }",
      "  -> Text",
      "getCity { address = { city = c } } = c",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

test("[source-fidelity §15] selective record pattern's TypedPattern contains only the fields the programmer wrote", async () => {
  // Phase-04_2 §13-15: TypedPattern must preserve source-written structure —
  // omitted fields must NOT be materialized as synthetic wildcards on the
  // public Typed AST. Coverage normalization is a separate concern handled by
  // the exhaustiveness engine and must not leak into the Typed AST.
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "f :: { x :: Int, y :: Text } -> Int",
      "f { x = a } = a",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
    // Both properties must hold simultaneously:
    // (1) typecheck succeeds — exhaustiveness treats omitted `y` as wildcard.
    // (2) the public TypedPattern lists only `x`, not a synthetic `y`.
    const mod = o.program!.modules.get(o.program!.entryModule)!;
    const fDef = mod.declarations.find(
      (d): d is Extract<TypedDecl, { kind: "Definition" }> =>
        d.kind === "Definition" && d.name === "f",
    );
    assert.ok(fDef, "expected typed definition `f`");
    const param = fDef.equations[0]!.params[0]!;
    assert.equal(param.kind, "PatternRecord", "expected a record pattern");
    const rec = param as Extract<TypedPattern, { kind: "PatternRecord" }>;
    const names = rec.fields.map((f) => f.name);
    assert.deepEqual(names, ["x"], `expected only ['x']; got ${JSON.stringify(names)}`);
  } finally {
    await o.cleanup();
  }
});

test("record pattern with an unknown field reports BLACK_UNKNOWN_FIELD", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "bad :: { name :: Text } -> Text",
      "bad { nombre = n } = n",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, "expected failure");
    assert.ok(
      o.errorCodes.includes("BLACK_UNKNOWN_FIELD"),
      `expected BLACK_UNKNOWN_FIELD, got: ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
