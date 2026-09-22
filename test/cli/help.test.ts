import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../helpers/cli.js";

test("white --help exits 0 and lists the required commands", async () => {
  const { code, stdout } = await runCli(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /White — Black preview toolchain/);
  assert.match(stdout, /Profile: preview-web-1/);
  for (const cmd of ["capabilities", "check", "build", "run", "test", "docs", "query"]) {
    assert.match(stdout, new RegExp(`\\b${cmd}\\b`));
  }
});

// phase-03_5.md §§15, 18 — the help text must reflect actual current stage.
// A stale "name resolution unimplemented" claim regressed the demo contract.
test("white --help identifies the preview-web-1 stage and current compiler status", async () => {
  const { code, stdout } = await runCli(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /preview-web-1/);
  assert.match(stdout, /source parsing\s+implemented/);
  assert.match(stdout, /name resolution\s+implemented/);
  assert.match(stdout, /typechecking\s+not yet implemented/);
  assert.match(stdout, /real code generation\s+not yet implemented/);
  assert.doesNotMatch(
    stdout,
    /name resolution.*(?:unimplemented|not implemented)/i,
    "help must not still claim name resolution is unimplemented",
  );
  assert.doesNotMatch(stdout, /\bphase-2\b/i, "help must not reference the stale phase-2 label");
});

// phase-03_5.md §§16, 18 — --version reveals profile and truthful stage,
// and drops the stale phase-2 label.
test("white --version identifies preview-web-1 and the phase-3 stage", async () => {
  const { code, stdout } = await runCli(["--version"]);
  assert.equal(code, 0);
  assert.match(stdout, /^white \S+ \(preview-web-1, phase-3-name-resolution\)\s*$/);
  assert.doesNotMatch(stdout, /phase-2/);
});

test("unknown command exits with usage error code 2", async () => {
  const { code, stderr } = await runCli(["nonsense-command"]);
  assert.equal(code, 2);
  assert.match(stderr, /Unknown command/);
});

test("no arguments prints help and exits 0", async () => {
  const { code, stdout } = await runCli([]);
  assert.equal(code, 0);
  assert.match(stdout, /White — Black preview toolchain/);
});
