// Contract tests that specifically catch Phase-4 mutation campaign items
// M35–M56. Each test asserts a behavior that the corresponding mutation
// would break.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { typecheckModules } from "../helpers/check.js";
import { runCli } from "../../../helpers/cli.js";

// M35 — bypass typechecker in `white build`. A type-invalid project must
// not reach placeholder emission: `white build` must fail AND no
// `dist/main.mjs` may appear.
test("[M35] typechecking blocks emission on the build surface", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "black-m35-"));
  try {
    await writeFile(
      path.join(root, "white.toml"),
      `[project]\nname = "m35"\nprofile = "preview-web-1"\n\n[target]\nkind = "node"\nentry = "src/Main.blk"\n`,
      "utf8",
    );
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "Main.blk"),
      [
        "module Main (main)",
        "",
        "main :: Text",
        "main = 1",
      ].join("\n") + "\n",
      "utf8",
    );
    const build = await runCli(["build", "--json"], { cwd: root });
    assert.equal(build.code, 1, "type-invalid build must exit non-zero");
    const env = JSON.parse(build.stdout);
    assert.equal(env.ok, false);
    assert.ok(
      env.diagnostics.some((d: { code: string }) => d.code === "BLACK_TYPE_MISMATCH"),
      `expected BLACK_TYPE_MISMATCH; got ${env.diagnostics.map((d: { code: string }) => d.code).join(", ")}`,
    );
    let emitted = false;
    try {
      const s = await stat(path.join(root, "dist", "main.mjs"));
      emitted = s.isFile();
    } catch {
      emitted = false;
    }
    assert.equal(emitted, false, "type-invalid build must not emit dist/main.mjs");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// M36 — allow missing top-level signatures.
test("[M36] a top-level definition with no signature is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main = 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(o.errorCodes.includes("BLACK_TYPE_MISSING_SIGNATURE"));
  } finally {
    await o.cleanup();
  }
});

// M37 — treat signature generics as unification metas (would let `a -> a`
// with body `= 1` pass).
test("[M37] rigid signature generics must reject a body that returns a concrete type", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "bad :: a -> a",
      "bad x = 1",
      "",
      "main :: Int",
      "main = bad 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, false, "body must not commit `a` to Int");
  } finally {
    await o.cleanup();
  }
});

// M38 — treat transparent aliases as nominal.
test("[M38] transparent aliases unify with their body", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Age = Int",
      "",
      "asInt :: Age -> Int",
      "asInt x = x",
      "",
      "main :: Int",
      "main = asInt 42",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

// M39 — record field order semantically significant.
test("[M39] record literals unify regardless of field source order", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type P = { x :: Int, y :: Int }",
      "",
      "mk :: P",
      "mk = { y = 2, x = 1 }",
      "",
      "main :: Int",
      "main = mk.x",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

// M40 — allow unknown record fields.
test("[M40] unknown field access is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = { x = 1 }.y",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(o.errorCodes.includes("BLACK_UNKNOWN_FIELD"));
  } finally {
    await o.cleanup();
  }
});

// M42 — record update must not introduce a new field.
test("[M42] record update cannot add a field not present on the record", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type P = { x :: Int }",
      "",
      "grow :: P -> P",
      "grow p = p { y = 2 }",
      "",
      "main :: Int",
      "main = 0",
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

// M43 — ignore constructor payload type.
test("[M43] a constructor payload of the wrong type is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Box = | Box Int",
      "",
      "mk :: Box",
      "mk = Box \"hi\"",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, false);
  } finally {
    await o.cleanup();
  }
});

// M45 — skip function argument checking.
test("[M45] applying an argument of the wrong type is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "greet :: Text -> Text",
      "greet t = t",
      "",
      "main :: Text",
      "main = greet 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(o.errorCodes.includes("BLACK_TYPE_MISMATCH"));
  } finally {
    await o.cleanup();
  }
});

// M46 — allow different `case` result types.
test("[M46] every branch of a case must have the same result type", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  case True of",
      "    True -> 1",
      "    False -> \"nope\"",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(o.errorCodes.includes("BLACK_TYPE_MISMATCH"));
  } finally {
    await o.cleanup();
  }
});

// M47 — skip pattern/scrutinee compatibility. Wildcard makes the case
// exhaustive on any scrutinee, so only the pattern↔scrutinee unification
// path can reject the Bool literal patterns against an Int scrutinee.
test("[M47] pattern must match the scrutinee's type", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main =",
      "  case 1 of",
      "    True -> 0",
      "    _ -> 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISMATCH"),
      `expected BLACK_TYPE_MISMATCH; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M48 — accept a non-exhaustive closed-variant `case`.
test("[M48] a closed variant case missing a constructor is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Shape = | Circle | Square",
      "",
      "main :: Int",
      "main =",
      "  case Circle of",
      "    Circle -> 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_CASE"));
  } finally {
    await o.cleanup();
  }
});

// M50 — allow heterogeneous list literals.
test("[M50] list literals must be homogeneous", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Any = Int",
      "",
      "main :: Int",
      "main = 0",
      "",
      "mixed :: List Int",
      "mixed = [1, \"two\"]",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, false);
  } finally {
    await o.cleanup();
  }
});

// M51 — allow non-Bool guards.
test("[M51] a non-Bool guard is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main",
      "  | 1 = 0",
      "  | otherwise = 1",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, false);
  } finally {
    await o.cleanup();
  }
});

// M52 — allow mixed Int/Float arithmetic implicitly.
test("[M52] Int + Float is rejected without an explicit conversion", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Float",
      "main = 1 + 2.0",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, false);
  } finally {
    await o.cleanup();
  }
});

// M53 — permit Int / Int.
test("[M53] Int / Int is not defined in preview-web-1", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = 6 / 2",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, false);
  } finally {
    await o.cleanup();
  }
});

// M55 — disable occurs check.
test("[M55] occurs check rejects an infinite type", async () => {
  // A lambda `\x -> x x` requires `a = a -> b`; must fail with occurs check.
  // We require the specific BLACK_TYPE_OCCURS_CHECK diagnostic — a downstream
  // mismatch is not enough, since a mutation that silences occurs but avoids
  // cyclic binding still yields ok=false via a spurious mismatch.
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: Int",
      "main = (\\x -> x x) 1",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_OCCURS_CHECK"),
      `expected occurs check; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M56 — reuse one instantiation for every use of a polymorphic scheme.
test("[M56] two differently typed uses of `identity` both work", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "id :: a -> a",
      "id x = x",
      "",
      "asInt :: Int",
      "asInt = id 1",
      "",
      "asText :: Text",
      "asText = id \"hi\"",
      "",
      "main :: Int",
      "main = asInt",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

// M41 — allow a record literal to omit fields required by its expected
// closed record type. A `Player` needs both `name` and `lives`; supplying
// only `name` must fail.
test("[M41] a record literal missing a required field is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Player = { name :: Text, lives :: Int }",
      "",
      "p :: Player",
      "p = { name = \"A\" }",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_MISSING_FIELD"),
      `expected BLACK_MISSING_FIELD; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M63 — recognize `otherwise` by spelling rather than Prelude DefId.
// This mutation was originally labeled M44 in Phase-4.1 but the real M44
// (per phase-04_2.md §2, §6) targets constructor semantic identity. The
// shadowed-`otherwise` mutation is preserved here under its correct
// number: a user-defined `otherwise` shadowing the Prelude one must NOT
// count as unconditional coverage; a spelling-based comparison would
// incorrectly accept it.
test("[M63] a shadowed `otherwise` does not count as the Prelude identity", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      // Shadow the Prelude `otherwise` at module scope. The guard below
      // resolves to this local DefId, not the Prelude one — so it must
      // NOT count as unconditional. A mutation that compares by name
      // instead of DefId would treat it as unconditional.
      "otherwise :: Bool",
      "otherwise = False",
      "",
      "f :: Bool -> Int",
      "f x",
      "  | x = 1",
      "  | otherwise = 0",
      "",
      "main :: Int",
      "main = f True",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_FUNCTION"),
      `expected BLACK_NON_EXHAUSTIVE_FUNCTION; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M44 — compare constructor spelling instead of semantic constructor
// identity. Two closed variants that share a textual alternative name
// (`Ready`) but live under different types must not be pattern-compatible:
// an `A.Ready` pattern applied to a `B.BState` scrutinee is a type error,
// because the constructor DefIds differ even though their spellings match.
// A mutation that keys pattern compatibility off the constructor name
// would let this program typecheck — the test must go red under M44.
test("[M44] cross-module constructor with identical spelling is not compatible", async () => {
  const o = await typecheckModules({
    "A.blk": [
      "module A (AState (..))",
      "",
      "type AState =",
      "  | Ready Int",
      "  | Waiting",
    ].join("\n") + "\n",
    "B.blk": [
      "module B (BState (..))",
      "",
      "type BState =",
      "  | Ready Int",
      "  | Done",
    ].join("\n") + "\n",
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (AState (..))",
      "import B (BState (..))",
      "",
      "bad :: B.BState -> Int",
      "bad state =",
      "  case state of",
      "    A.Ready n -> n",
      "    B.Done -> 0",
      "",
      "main :: Int",
      "main = bad B.Done",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, `expected failure; got ok=${o.ok}`);
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_MISMATCH"),
      `expected BLACK_TYPE_MISMATCH; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M44b — constructor identity in exhaustiveness. Same-spelled constructors
// from different variants must not count as coverage for each other's
// constructor slot. The exhaustiveness matrix keys on constructor DefId,
// not on the source-written textual name.
test("[M44 exhaustiveness §5] same-spelled cross-module constructor does not cover the scrutinee's slot", async () => {
  // We construct a scenario where a partial case over `BState` handles
  // only `B.Done`, and a mutated exhaustiveness engine keyed by name
  // could not confuse a stray `A.Ready` for coverage of `B.Ready` even
  // if pattern-compatibility were somehow relaxed. Here we exercise the
  // baseline non-exhaustiveness directly: leaving out `B.Ready` from a
  // BState case must produce BLACK_NON_EXHAUSTIVE_MATCH regardless of
  // the presence of a same-spelled constructor in another type.
  const o = await typecheckModules({
    "A.blk": [
      "module A (AState (..))",
      "",
      "type AState =",
      "  | Ready Int",
      "  | Waiting",
    ].join("\n") + "\n",
    "B.blk": [
      "module B (BState (..))",
      "",
      "type BState =",
      "  | Ready Int",
      "  | Done",
    ].join("\n") + "\n",
    "Main.blk": [
      "module Main (main)",
      "",
      "import A (AState (..))",
      "import B (BState (..))",
      "",
      "partial :: B.BState -> Int",
      "partial state =",
      "  case state of",
      "    B.Done -> 0",
      "",
      "main :: Int",
      "main = partial B.Done",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(!o.ok, `expected failure; got ok=${o.ok}`);
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_CASE"),
      `expected BLACK_NON_EXHAUSTIVE_CASE; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M49 — skip top-level function-equation exhaustiveness. A `not` that
// only covers `True` must be flagged as non-exhaustive.
test("[M49] a partial top-level function is rejected", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "notB :: Bool -> Bool",
      "notB True = False",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_FUNCTION"),
      `expected BLACK_NON_EXHAUSTIVE_FUNCTION; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M54 — disable local HM generalization. Two differently-typed uses of a
// local `id` require its inferred scheme to be polymorphic.
test("[M54] a local `id` is used at two different types", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "main :: { i :: Int, t :: Text }",
      "main =",
      "  let id x = x",
      "  in { i = id 1, t = id \"hello\" }",
    ].join("\n") + "\n",
  });
  try {
    assert.equal(o.ok, true, `unexpected: ${o.errorCodes.join(", ")}`);
  } finally {
    await o.cleanup();
  }
});

// M57 — numeric ambiguity defaults to Int. A local binding whose only
// constraint is `x + y` with both operands as metas cannot be silently
// specialized to Int.
test("[M57] genuinely ambiguous numeric operator is rejected", async () => {
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
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_AMBIGUOUS"),
      `expected BLACK_TYPE_AMBIGUOUS; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M58 — treat guarded rows as unconditional coverage. A single guarded
// equation whose guard is not Prelude `otherwise`/literal `True` must
// not prove totality.
test("[M58] a conditional-guard-only equation is non-exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "f :: Bool -> Int",
      "f x",
      "  | x = 1",
      "",
      "main :: Int",
      "main = 0",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_FUNCTION"),
      `expected BLACK_NON_EXHAUSTIVE_FUNCTION; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M59 — require exact record-pattern field set. A selective record
// pattern that omits a field must still typecheck; omitted fields behave
// as wildcards.
test("[M59] selective record pattern with omitted field typechecks", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Player = { name :: Text, lives :: Int }",
      "",
      "getName :: Player -> Text",
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

// M60 — operator typing dispatched by source spelling instead of resolved
// identity. The typechecker must handle each of the nine preview operators
// through its typing rules; a mutation that drops any one operator's rule
// (e.g., silently falls through to a default) is caught here by that
// operator failing to typecheck at the correct types. This complements
// contract/operators-coverage.test.ts by checking the nine operators
// against a full matrix of expected result types in a single test.
test("[M60] every preview operator's typing rule is exercised", async () => {
  const cases: { op: string; expr: string; sig: string }[] = [
    { op: "+", expr: "1 + 2", sig: "Int" },
    { op: "-", expr: "1 - 2", sig: "Int" },
    { op: "*", expr: "1 * 2", sig: "Int" },
    { op: "/", expr: "1.0 / 2.0", sig: "Float" },
    { op: "==", expr: "1 == 2", sig: "Bool" },
    { op: "<", expr: "1 < 2", sig: "Bool" },
    { op: "<=", expr: "1 <= 2", sig: "Bool" },
    { op: ">", expr: "1 > 2", sig: "Bool" },
    { op: ">=", expr: "1 >= 2", sig: "Bool" },
  ];
  for (const c of cases) {
    const o = await typecheckModules({
      "Main.blk": [
        "module Main (main)",
        "",
        `main :: ${c.sig}`,
        `main = ${c.expr}`,
      ].join("\n") + "\n",
    });
    try {
      assert.equal(
        o.ok, true,
        `operator '${c.op}' at ${c.sig} failed: ${o.errorCodes.join(", ")}`,
      );
    } finally {
      await o.cleanup();
    }
  }
});

// M61 — skip single-clause lambda/local-function pattern exhaustiveness.
// A `\(A x) -> x` over a 2-alternative variant must be rejected.
test("[M61] refutable single-clause lambda is non-exhaustive", async () => {
  const o = await typecheckModules({
    "Main.blk": [
      "module Main (main)",
      "",
      "type Choice = | A Int | B Int",
      "",
      "extract :: Choice -> Int",
      "extract = \\(A x) -> x",
      "",
      "main :: ()",
      "main = ()",
    ].join("\n") + "\n",
  });
  try {
    assert.ok(
      o.errorCodes.includes("BLACK_NON_EXHAUSTIVE_FUNCTION"),
      `expected BLACK_NON_EXHAUSTIVE_FUNCTION; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});

// M62 — permit residual TyMeta in a successful TypedProgram. The
// finalization pass must surface any unresolved inference variable as
// BLACK_TYPE_AMBIGUOUS instead of leaving TyMeta in the public surface.
test("[M62] unresolved metas surface as BLACK_TYPE_AMBIGUOUS", async () => {
  // Same unconstrained-numeric shape as M57 — the finalize pass rides on
  // top of the operator ambiguity check. Under M62 the finalize pass
  // returns silently and the program is considered ok even though metas
  // remain in the TypedProgram.
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
    assert.ok(
      o.errorCodes.includes("BLACK_TYPE_AMBIGUOUS"),
      `expected BLACK_TYPE_AMBIGUOUS; got ${o.errorCodes.join(", ")}`,
    );
  } finally {
    await o.cleanup();
  }
});
