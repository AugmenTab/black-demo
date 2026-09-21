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
