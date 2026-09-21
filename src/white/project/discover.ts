import { existsSync } from "node:fs";
import path from "node:path";

export const CONFIG_FILENAME = "white.toml";

export interface DiscoveryResult {
  found: boolean;
  projectRoot?: string;
  configPath?: string;
}

export function discoverProject(startDir: string): DiscoveryResult {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return { found: true, projectRoot: dir, configPath: candidate };
    }
    if (dir === root) {
      return { found: false };
    }
    dir = path.dirname(dir);
  }
}
