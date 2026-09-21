import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { discoverProject } from "../../src/white/project/discover.js";
import { makeTempProject } from "../helpers/tmp.js";

test("discovers white.toml in the current directory", async () => {
  const project = await makeTempProject();
  try {
    const result = discoverProject(project.root);
    assert.equal(result.found, true);
    assert.equal(result.projectRoot, project.root);
    assert.equal(result.configPath, project.configPath);
  } finally {
    await project.cleanup();
  }
});

test("discovers white.toml from a nested directory", async () => {
  const project = await makeTempProject();
  try {
    const nested = path.join(project.root, "src", "deeply", "nested");
    await mkdir(nested, { recursive: true });
    const result = discoverProject(nested);
    assert.equal(result.found, true);
    assert.equal(result.projectRoot, project.root);
  } finally {
    await project.cleanup();
  }
});

test("returns not-found when no white.toml exists", () => {
  const result = discoverProject("/");
  assert.equal(result.found, false);
});
