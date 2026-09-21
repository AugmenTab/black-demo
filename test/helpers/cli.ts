import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// test files live under dist/test/<subdir>/*.test.js; the CLI lives at dist/src/white/cli.js
export const CLI_PATH = path.resolve(HERE, "..", "..", "src", "white", "cli.js");

export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], options: { cwd?: string } = {}): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const outChunks: string[] = [];
    const errChunks: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => outChunks.push(c));
    child.stderr.on("data", (c: string) => errChunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout: outChunks.join(""), stderr: errChunks.join("") });
    });
  });
}
