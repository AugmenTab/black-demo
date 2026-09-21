import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../helpers/cli.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// dist/test/integration → repo root
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const HELLO_DIR = path.resolve(REPO_ROOT, "examples", "hello");
const HELLO_DIST = path.join(HELLO_DIR, "dist");

async function cleanDist(): Promise<void> {
  await rm(HELLO_DIST, { recursive: true, force: true });
}

test("Phase 2 end-to-end: check + build + run against examples/hello", async () => {
  await cleanDist();

  const check = await runCli(["check"], { cwd: HELLO_DIR });
  assert.equal(check.code, 0, `check failed: ${check.stdout}${check.stderr}`);
  assert.match(check.stdout, /Project configuration valid/);
  assert.match(check.stdout, /Black syntax valid/);

  const checkJson = await runCli(["check", "--json"], { cwd: HELLO_DIR });
  assert.equal(checkJson.code, 0);
  const checkEnvelope = JSON.parse(checkJson.stdout);
  assert.equal(checkEnvelope.ok, true);
  assert.equal(checkEnvelope.result.syntaxValid, true);
  assert.equal(checkEnvelope.result.semanticCheckingImplemented, false);

  const build = await runCli(["build"], { cwd: HELLO_DIR });
  assert.equal(build.code, 0, `build failed: ${build.stdout}${build.stderr}`);
  const generated = path.join(HELLO_DIST, "main.mjs");
  const s = await stat(generated);
  assert.ok(s.isFile(), "expected dist/main.mjs to exist");

  // deterministic: rebuild produces the same bytes
  const first = await readFile(generated, "utf8");
  const build2 = await runCli(["build"], { cwd: HELLO_DIR });
  assert.equal(build2.code, 0);
  const second = await readFile(generated, "utf8");
  assert.equal(second, first, "rebuild should be deterministic");

  const run = await runCli(["run"], { cwd: HELLO_DIR });
  assert.equal(run.code, 0, `run failed: ${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /Black preview pipeline alive\./);

  // JSON run captures the marker in stdout
  const runJson = await runCli(["run", "--json"], { cwd: HELLO_DIR });
  assert.equal(runJson.code, 0);
  const runEnvelope = JSON.parse(runJson.stdout);
  assert.equal(runEnvelope.ok, true);
  assert.match(runEnvelope.result.stdout, /Black preview pipeline alive\./);

  await cleanDist();
});
