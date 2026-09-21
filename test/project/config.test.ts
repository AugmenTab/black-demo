import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loadProjectConfig } from "../../src/white/project/config.js";
import { codes } from "../../src/white/output/diagnostics.js";
import { makeTempProject } from "../helpers/tmp.js";

test("accepts a valid minimal config", async () => {
  const project = await makeTempProject();
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, true);
    if (load.ok) {
      assert.equal(load.loaded.config.project.profile, "preview-web-1");
      assert.equal(load.loaded.config.target.kind, "node");
      assert.equal(load.loaded.absoluteEntry, project.entryPath);
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects malformed TOML", async () => {
  const project = await makeTempProject({ configContent: "this is not toml = = =\n" });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      assert.equal(load.diagnostics[0]?.code, codes.configParseError);
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects missing required fields", async () => {
  const project = await makeTempProject({
    configContent: `[project]\nname = "x"\n`,
  });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      const codesSeen = load.diagnostics.map((d) => d.code);
      assert.ok(codesSeen.includes(codes.configMissingField));
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects an unsupported profile", async () => {
  const project = await makeTempProject({
    configContent: `[project]\nname = "x"\nprofile = "future-web-2"\n\n[target]\nkind = "node"\nentry = "src/Main.blk"\n`,
  });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      assert.equal(load.diagnostics[0]?.code, codes.unsupportedProfile);
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects an unsupported target kind", async () => {
  const project = await makeTempProject({
    configContent: `[project]\nname = "x"\nprofile = "preview-web-1"\n\n[target]\nkind = "browser"\nentry = "src/Main.blk"\n`,
  });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      assert.equal(load.diagnostics[0]?.code, codes.unsupportedTarget);
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects a missing entry file", async () => {
  const project = await makeTempProject({ writeEntry: false });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      assert.equal(load.diagnostics[0]?.code, codes.entryNotFound);
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects a non-.blk entry", async () => {
  const project = await makeTempProject({
    configContent: `[project]\nname = "x"\nprofile = "preview-web-1"\n\n[target]\nkind = "node"\nentry = "src/Main.txt"\n`,
    entryRelative: "src/Main.txt",
  });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      assert.equal(load.diagnostics[0]?.code, codes.entryNotBlack);
    }
  } finally {
    await project.cleanup();
  }
});

test("rejects an entry that escapes the project root", async () => {
  const project = await makeTempProject({
    configContent: `[project]\nname = "x"\nprofile = "preview-web-1"\n\n[target]\nkind = "node"\nentry = "../escape.blk"\n`,
    writeEntry: false,
  });
  try {
    const load = await loadProjectConfig(project.configPath, project.root);
    assert.equal(load.ok, false);
    if (!load.ok) {
      assert.equal(load.diagnostics[0]?.code, codes.entryNotFound);
    }
  } finally {
    await project.cleanup();
    // best-effort in case a sibling was written accidentally
    await rm(path.join(project.root, "..", "escape.blk"), { force: true });
  }
});
