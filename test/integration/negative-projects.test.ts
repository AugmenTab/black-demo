// Contract: for each rejection scenario listed in phase-03.md §102, White's
// `check`, `build`, and `run` must all fail and produce structured
// diagnostics. `run` must never execute a stale artifact (phase-03_5.md §20).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runCli } from "../helpers/cli.js";

async function makeProject(files: Record<string, string>): Promise<{ cwd: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "black-neg-"));
  await writeFile(
    path.join(root, "white.toml"),
    `[project]\nname = "neg"\nprofile = "preview-web-1"\n\n[target]\nkind = "node"\nentry = "src/Main.blk"\n`,
    "utf8",
  );
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, "src", rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  return {
    cwd: root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

async function expectFail(files: Record<string, string>, expectedCode: string): Promise<void> {
  const p = await makeProject(files);
  try {
    const check = await runCli(["check", "--json"], { cwd: p.cwd });
    assert.equal(check.code, 1, `check should fail for ${expectedCode}`);
    const env = JSON.parse(check.stdout);
    assert.equal(env.ok, false);
    assert.ok(
      env.diagnostics.some((d: { code: string }) => d.code === expectedCode),
      `expected diagnostic ${expectedCode}; got ${env.diagnostics.map((d: { code: string }) => d.code).join(", ")}`,
    );
    const build = await runCli(["build", "--json"], { cwd: p.cwd });
    assert.equal(build.code, 1, `build should fail for ${expectedCode}`);
    // §18: `white run` must also fail, and the placeholder program output
    // must not appear (protects against stale-artifact execution).
    const run = await runCli(["run", "--json"], { cwd: p.cwd });
    assert.equal(run.code, 1, `run should fail for ${expectedCode}`);
    assert.ok(
      !run.stdout.includes("Black preview pipeline alive."),
      `run must not emit the placeholder program output for ${expectedCode}`,
    );
    assert.ok(
      !run.stderr.includes("Black preview pipeline alive."),
      `run must not emit the placeholder program output for ${expectedCode}`,
    );
  } finally {
    await p.cleanup();
  }
}

test("negative: unknown module → BLACK_MODULE_NOT_FOUND", async () => {
  await expectFail(
    { "Main.blk": "module Main (main)\n\nimport Absent (x)\n\nmain = x\n" },
    "BLACK_MODULE_NOT_FOUND",
  );
});

test("negative: module/path mismatch → BLACK_MODULE_PATH_MISMATCH", async () => {
  await expectFail(
    { "Main.blk": "module Something.Else (main)\n\nmain = ()\n" },
    "BLACK_MODULE_PATH_MISMATCH",
  );
});

test("negative: import cycle → BLACK_MODULE_CYCLE", async () => {
  await expectFail(
    {
      "Main.blk": "module Main (main)\n\nimport A (a)\n\nmain = a\n",
      "A.blk": "module A (a)\n\nimport Main (main)\n\na = main\n",
    },
    "BLACK_MODULE_CYCLE",
  );
});

test("negative: unknown imported name → BLACK_IMPORT_UNKNOWN_NAME", async () => {
  await expectFail(
    {
      "Main.blk": "module Main (main)\n\nimport A (nope)\n\nmain = nope\n",
      "A.blk": "module A (x)\n\nx = ()\n",
    },
    "BLACK_IMPORT_UNKNOWN_NAME",
  );
});

test("negative: unknown local name → BLACK_NAME_UNKNOWN", async () => {
  await expectFail(
    { "Main.blk": "module Main (main)\n\nmain = ghost\n" },
    "BLACK_NAME_UNKNOWN",
  );
});

test("negative: ambiguous import use → BLACK_NAME_AMBIGUOUS", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "import A (x)",
        "import B (x)",
        "",
        "main = x",
      ].join("\n") + "\n",
      "A.blk": "module A (x)\n\nx = ()\n",
      "B.blk": "module B (x)\n\nx = ()\n",
    },
    "BLACK_NAME_AMBIGUOUS",
  );
});

test("negative: hidden constructor use → BLACK_IMPORT_NOT_EXPORTED", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "import Colors (Red)",
        "",
        "main = Red",
      ].join("\n") + "\n",
      "Colors.blk": [
        "module Colors (Color)",
        "",
        "type Color =",
        "  | Red",
      ].join("\n") + "\n",
    },
    "BLACK_IMPORT_NOT_EXPORTED",
  );
});

test("negative: duplicate declaration → BLACK_NAME_DUPLICATE", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "main :: ()",
        "main :: ()",
        "main = ()",
      ].join("\n") + "\n",
    },
    "BLACK_NAME_DUPLICATE",
  );
});

// Phase 3.3 §34: an unselected export must not become visible under the
// canonical qualifier when only a selected import of siblings exists.
test("negative: selected import does not expose unselected canonical → BLACK_QUALIFIED_NAME_UNKNOWN", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "import Game.Model (Shape (..), area)",
        "",
        "main = Game.Model.hiddenFromSelection",
      ].join("\n") + "\n",
      "Game/Model.blk": [
        "module Game.Model (Shape (..), area, hiddenFromSelection)",
        "",
        "type Shape =",
        "  | Circle",
        "",
        "area :: Shape -> Int",
        "area s = 0",
        "",
        "hiddenFromSelection :: Int",
        "hiddenFromSelection = 42",
      ].join("\n") + "\n",
    },
    "BLACK_QUALIFIED_NAME_UNKNOWN",
  );
});

// Phase 3.3 §34: same fixture — unqualified use of the unselected export
// must not resolve either.
test("negative: selected import does not expose unselected unqualified → BLACK_NAME_UNKNOWN", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "import Game.Model (Shape (..), area)",
        "",
        "main = hiddenFromSelection",
      ].join("\n") + "\n",
      "Game/Model.blk": [
        "module Game.Model (Shape (..), area, hiddenFromSelection)",
        "",
        "type Shape =",
        "  | Circle",
        "",
        "area :: Shape -> Int",
        "area s = 0",
        "",
        "hiddenFromSelection :: Int",
        "hiddenFromSelection = 42",
      ].join("\n") + "\n",
    },
    "BLACK_NAME_UNKNOWN",
  );
});

// Phase 3.3 §34: an alias-only import does not register the canonical dotted
// path — `Game.Model.area` falls through to structural on the expression
// side, so the leading `Game` is a plain unknown term.
test("negative: alias-only import does not register canonical path → BLACK_NAME_UNKNOWN", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "import Game.Model as Model",
        "",
        "main = Game.Model.area (Model.Circle)",
      ].join("\n") + "\n",
      "Game/Model.blk": [
        "module Game.Model (Shape (..), area)",
        "",
        "type Shape =",
        "  | Circle",
        "",
        "area :: Shape -> Int",
        "area s = 0",
      ].join("\n") + "\n",
    },
    "BLACK_NAME_UNKNOWN",
  );
});

// Phase 3.4 §27 + phase-03_5.md §§5-6, 12: a qualifier spelling bound to two
// different module identities must fail check/build/run with
// BLACK_MODULE_QUALIFIER_AMBIGUOUS. The pre-fix regression fabricated a
// spurious BLACK_NAME_UNKNOWN for the head of the qualifier because the
// resolver reinterpreted the ambiguous qualifier as structural field access
// — this test guards against its return by asserting BLACK_NAME_UNKNOWN is
// NEVER present alongside the ambiguity, on every White surface
// (check/build/run --json). The stale-artifact placeholder must not appear.
test("negative: alias/canonical qualifier collision → BLACK_MODULE_QUALIFIER_AMBIGUOUS", async () => {
  const files = {
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
  };
  const p = await makeProject(files);
  try {
    for (const surface of ["check", "build", "run"] as const) {
      const r = await runCli([surface, "--json"], { cwd: p.cwd });
      assert.equal(r.code, 1, `${surface} should fail`);
      const env = JSON.parse(r.stdout);
      assert.equal(env.ok, false);
      const codes = env.diagnostics.map((d: { code: string }) => d.code);
      assert.ok(
        codes.includes("BLACK_MODULE_QUALIFIER_AMBIGUOUS"),
        `${surface}: expected BLACK_MODULE_QUALIFIER_AMBIGUOUS; got ${codes.join(", ")}`,
      );
      assert.ok(
        !codes.includes("BLACK_NAME_UNKNOWN"),
        `${surface}: BLACK_NAME_UNKNOWN must not accompany the ambiguity (pre-fix regression); got ${codes.join(", ")}`,
      );
      assert.ok(
        !codes.includes("BLACK_QUALIFIED_NAME_UNKNOWN"),
        `${surface}: BLACK_QUALIFIED_NAME_UNKNOWN must not accompany the ambiguity; got ${codes.join(", ")}`,
      );
      assert.ok(
        !r.stdout.includes("Black preview pipeline alive."),
        `${surface}: placeholder marker must not appear`,
      );
      assert.ok(
        !r.stderr.includes("Black preview pipeline alive."),
        `${surface}: placeholder marker must not appear on stderr`,
      );
    }
  } finally {
    await p.cleanup();
  }
});

// phase-04_1.md §44: project-level failures for typecheck errors. All must
// fail on check/build/run and never execute a stale placeholder.

test("negative: genuinely ambiguous numeric operator → BLACK_TYPE_AMBIGUOUS", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "add :: Int",
        "add =",
        "  let f x y = x + y",
        "  in 0",
        "",
        "main :: ()",
        "main = ()",
      ].join("\n") + "\n",
    },
    "BLACK_TYPE_AMBIGUOUS",
  );
});

test("negative: conditional-guard-only partial function → BLACK_NON_EXHAUSTIVE_FUNCTION", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "f :: Bool -> Int",
        "f x",
        "  | x = 1",
        "",
        "main :: ()",
        "main = ()",
      ].join("\n") + "\n",
    },
    "BLACK_NON_EXHAUSTIVE_FUNCTION",
  );
});

test("negative: missing required record field → BLACK_MISSING_FIELD", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "type Point = { x :: Int, y :: Int }",
        "",
        "p :: Point",
        "p = { x = 1 }",
        "",
        "main :: ()",
        "main = ()",
      ].join("\n") + "\n",
    },
    "BLACK_MISSING_FIELD",
  );
});

test("negative: wrong constructor payload → BLACK_BAD_CONSTRUCTOR_PAYLOAD", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "type Box = | Box Int",
        "",
        "bad :: Box",
        "bad = Box \"hello\"",
        "",
        "main :: ()",
        "main = ()",
      ].join("\n") + "\n",
    },
    "BLACK_BAD_CONSTRUCTOR_PAYLOAD",
  );
});

test("negative: refutable local-function pattern → BLACK_NON_EXHAUSTIVE_FUNCTION", async () => {
  await expectFail(
    {
      "Main.blk": [
        "module Main (main)",
        "",
        "type Choice = | A Int | B Int",
        "",
        "extract :: Choice -> Int",
        "extract c =",
        "  let go (A x) = x",
        "  in go c",
        "",
        "main :: ()",
        "main = ()",
      ].join("\n") + "\n",
    },
    "BLACK_NON_EXHAUSTIVE_FUNCTION",
  );
});

// §20 — stale-artifact guard. If a project builds successfully, then the
// source is edited into an unresolvable state, `white run` must NOT reuse the
// previously-built `dist/main.mjs`; the placeholder marker from the stale
// build must not appear on run's stdout.
test("negative: stale artifact is not executed when subsequent build fails", async () => {
  const p = await makeProject({
    "Main.blk": "module Main (main)\n\nmain :: ()\nmain = ()\n",
  });
  try {
    const build = await runCli(["build", "--json"], { cwd: p.cwd });
    assert.equal(build.code, 0, `initial build must succeed; got ${build.stdout}${build.stderr}`);
    const artifact = path.join(p.cwd, "dist", "main.mjs");
    const s = await stat(artifact);
    assert.ok(s.isFile(), "expected dist/main.mjs to exist after the valid build");

    // Corrupt the source into an unresolvable state.
    await writeFile(
      path.join(p.cwd, "src", "Main.blk"),
      "module Main (main)\n\nmain :: ()\nmain = ghost\n",
      "utf8",
    );

    const run = await runCli(["run", "--json"], { cwd: p.cwd });
    assert.equal(run.code, 1, "run must fail when the current source is unresolvable");
    assert.ok(
      !run.stdout.includes("Black preview pipeline alive."),
      "run must not execute the stale artifact",
    );
    assert.ok(
      !run.stderr.includes("Black preview pipeline alive."),
      "run must not execute the stale artifact",
    );
    const env = JSON.parse(run.stdout);
    assert.equal(env.ok, false);
    assert.ok(
      env.diagnostics.some((d: { code: string }) => d.code === "BLACK_NAME_UNKNOWN"),
      `expected BLACK_NAME_UNKNOWN; got ${env.diagnostics.map((d: { code: string }) => d.code).join(", ")}`,
    );
  } finally {
    await p.cleanup();
  }
});
