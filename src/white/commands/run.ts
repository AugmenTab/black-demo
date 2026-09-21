import { spawn } from "node:child_process";
import { buildCommand } from "./build.js";
import { codes, makeDiagnostic, ok } from "../output/diagnostics.js";
import type { CommandDefinition } from "./shared.js";
import { projectFailure } from "./shared.js";

interface BuildSuccess {
  outDir: string;
  artifacts: Array<{ path: string; kind: string }>;
}

export const runCommand: CommandDefinition = {
  name: "run",
  summary: "Build and execute the current project's generated JavaScript.",
  supportsJson: true,
  async run(ctx) {
    const buildResult = await buildCommand.run(ctx);
    if (!buildResult.ok) {
      return { ...buildResult, command: "run" };
    }

    const buildData = buildResult.result as BuildSuccess;
    const entry = buildData.artifacts.find((a) => a.kind === "module")?.path;
    if (!entry) {
      return projectFailure("run", [
        makeDiagnostic({
          code: codes.buildFailed,
          kind: "build",
          message: "build produced no module artifact",
        }),
      ]);
    }

    const capturedStdout: string[] = [];
    const capturedStderr: string[] = [];

    const child = spawn(process.execPath, [entry], {
      stdio: ctx.json ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (ctx.json && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => capturedStdout.push(chunk));
    }
    if (ctx.json && child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => capturedStderr.push(chunk));
    }

    const exitCode: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (typeof code === "number") resolve(code);
        else resolve(signal ? 1 : 0);
      });
    });

    if (exitCode !== 0) {
      return projectFailure("run", [
        makeDiagnostic({
          code: codes.runtimeFailed,
          kind: "runtime",
          message: `generated program exited with code ${exitCode}`,
          details: {
            entry,
            exitCode,
            ...(ctx.json ? { stdout: capturedStdout.join(""), stderr: capturedStderr.join("") } : {}),
          },
        }),
      ]);
    }

    return ok("run", {
      entry,
      exitCode,
      ...(ctx.json ? { stdout: capturedStdout.join(""), stderr: capturedStderr.join("") } : {}),
    });
  },
};
