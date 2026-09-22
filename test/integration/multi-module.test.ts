import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../helpers/cli.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// dist/test/integration → repo root
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const MM_DIR = path.resolve(REPO_ROOT, "examples", "multi-module");
const MM_DIST = path.join(MM_DIR, "dist");

test("Phase 3 end-to-end: multi-module project resolves and builds", async () => {
  await rm(MM_DIST, { recursive: true, force: true });

  const check = await runCli(["check"], { cwd: MM_DIR });
  assert.equal(check.code, 0, `check failed: ${check.stdout}${check.stderr}`);
  assert.match(check.stdout, /Names resolved across 3 reachable module/);

  const checkJson = await runCli(["check", "--json"], { cwd: MM_DIR });
  assert.equal(checkJson.code, 0);
  const env = JSON.parse(checkJson.stdout);
  assert.equal(env.ok, true);
  assert.equal(env.result.namesResolved, true);
  assert.equal(env.result.modulesLoaded, 3);

  const build = await runCli(["build"], { cwd: MM_DIR });
  assert.equal(build.code, 0, `build failed: ${build.stdout}${build.stderr}`);
  const generated = path.join(MM_DIST, "main.mjs");
  const s = await stat(generated);
  assert.ok(s.isFile());

  // phase-03_5.md §32: `white run` must also succeed for the qualified-
  // constructor + local-let fixture.
  const run = await runCli(["run"], { cwd: MM_DIR });
  assert.equal(run.code, 0, `run failed: ${run.stdout}${run.stderr}`);

  await rm(MM_DIST, { recursive: true, force: true });
});
