import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface TempProject {
  root: string;
  configPath: string;
  entryPath: string;
  cleanup: () => Promise<void>;
}

export interface TempProjectOptions {
  configContent?: string;
  entryRelative?: string;
  entryContent?: string;
  writeEntry?: boolean;
}

const DEFAULT_CONFIG = `[project]
name = "tmp"
profile = "preview-web-1"

[target]
kind = "node"
entry = "src/Main.blk"
`;

export async function makeTempProject(opts: TempProjectOptions = {}): Promise<TempProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), "black-demo-test-"));
  const configPath = path.join(root, "white.toml");
  await writeFile(configPath, opts.configContent ?? DEFAULT_CONFIG, "utf8");

  const entryRelative = opts.entryRelative ?? "src/Main.blk";
  const entryPath = path.join(root, entryRelative);
  const writeEntry = opts.writeEntry ?? true;
  if (writeEntry) {
    await mkdir(path.dirname(entryPath), { recursive: true });
    await writeFile(
      entryPath,
      opts.entryContent ?? "module Main (main)\n\nmain :: ()\nmain =\n  ()\n",
      "utf8",
    );
  }

  return {
    root,
    configPath,
    entryPath,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
