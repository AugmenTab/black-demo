import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../helpers/cli.js";

test("--json returns a valid envelope for capabilities", async () => {
  const { code, stdout } = await runCli(["capabilities", "--json"], { cwd: "/tmp" });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "capabilities");
  assert.equal(parsed.profile, "preview-web-1");
  assert.equal(parsed.result.compiler.source_parsing, false);
});

test("--json failure returns ok=false and structured diagnostics", async () => {
  const { code, stdout } = await runCli(["check", "--json"], { cwd: "/tmp" });
  assert.equal(code, 1);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.command, "check");
  assert.equal(parsed.diagnostics[0].code, "WHITE_PROJECT_NOT_FOUND");
  assert.equal(parsed.diagnostics[0].severity, "error");
  assert.equal(parsed.result, null);
});
