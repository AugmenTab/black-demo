import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../helpers/cli.js";

test("capabilities runs without a project and reports the walking-skeleton stage", async () => {
  const { code, stdout } = await runCli(["capabilities"], { cwd: "/tmp" });
  assert.equal(code, 0);
  assert.match(stdout, /preview-web-1/);
  assert.match(stdout, /placeholder|Placeholder|walking skeleton/);
});

// phase-04.md — human capabilities output must convey the same truths as the
// JSON payload: Phase 4/typechecking stage, parsing + resolution +
// typechecking implemented, real codegen still unavailable.
test("capabilities human output describes the phase-4 typechecking stage truthfully", async () => {
  const { code, stdout } = await runCli(["capabilities"], { cwd: "/tmp" });
  assert.equal(code, 0);
  assert.match(stdout, /phase-4-typechecking/);
  assert.match(stdout, /source parsing implemented/);
  assert.match(stdout, /name resolution implemented/);
  assert.match(stdout, /typechecking implemented/);
  assert.match(stdout, /real code generation not yet implemented/);
  assert.doesNotMatch(
    stdout,
    /source parsing.*not implemented/,
    "human capabilities must not still claim source parsing is not implemented",
  );
  assert.doesNotMatch(
    stdout,
    /typechecking not yet implemented/,
    "human capabilities must not still claim typechecking is not implemented",
  );
});

test("docs is a deliberate placeholder", async () => {
  const { code, stdout } = await runCli(["docs"], { cwd: "/tmp" });
  assert.equal(code, 0);
  assert.match(stdout, /not implemented/i);
});

test("query is a deliberate placeholder", async () => {
  const { code, stdout } = await runCli(["query"], { cwd: "/tmp" });
  assert.equal(code, 0);
  assert.match(stdout, /not implemented|unavailable/i);
});

test("test is a deliberate placeholder", async () => {
  const { code, stdout } = await runCli(["test"], { cwd: "/tmp" });
  assert.equal(code, 0);
  assert.match(stdout, /not implemented/i);
});

test("check outside a project fails with a project diagnostic", async () => {
  const { code, stdout } = await runCli(["check"], { cwd: "/tmp" });
  assert.equal(code, 1);
  assert.match(stdout, /WHITE_PROJECT_NOT_FOUND/);
});
