#!/usr/bin/env node
import { parseArgs } from "node:util";
import { COMMAND_ORDER, COMMANDS } from "./commands/index.js";
import { renderHuman } from "./output/render-human.js";
import { renderJson } from "./output/render-json.js";
import { PROFILE, fail, makeDiagnostic } from "./output/diagnostics.js";
import type { CommandDefinition } from "./commands/shared.js";

const USAGE_TEXT = buildHelp();

function buildHelp(): string {
  const lines: string[] = [];
  lines.push("White — Black preview toolchain");
  lines.push("");
  lines.push(`Profile: ${PROFILE}`);
  lines.push("");
  lines.push("Commands:");
  const width = Math.max(...COMMAND_ORDER.map((n) => n.length));
  for (const name of COMMAND_ORDER) {
    const cmd = COMMANDS[name];
    if (!cmd) continue;
    lines.push(`  ${name.padEnd(width)}  ${cmd.summary}`);
  }
  lines.push("");
  lines.push("Use:");
  lines.push("  white <command> --help");
  lines.push("  white <command> --json");
  lines.push("");
  lines.push("Phase 2 status: real lexer + parser; name resolution, typechecking, and codegen still unimplemented.");
  return lines.join("\n");
}

function commandHelp(cmd: CommandDefinition): string {
  const lines: string[] = [];
  lines.push(`white ${cmd.name} — ${cmd.summary}`);
  lines.push("");
  lines.push("Usage:");
  const jsonNote = cmd.supportsJson ? " [--json]" : "";
  lines.push(`  white ${cmd.name}${jsonNote}`);
  if (cmd.supportsJson) {
    lines.push("");
    lines.push("Flags:");
    lines.push("  --json    emit machine-readable JSON to stdout");
  }
  return lines.join("\n");
}

async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;

  if (!first || first === "--help" || first === "-h") {
    process.stdout.write(USAGE_TEXT + "\n");
    return 0;
  }

  if (first === "--version" || first === "-v") {
    process.stdout.write("white 0.2.0 (preview-web-1, phase-2)\n");
    return 0;
  }

  const cmd = COMMANDS[first];
  if (!cmd) {
    process.stderr.write(`Unknown command: ${first}\n`);
    process.stderr.write("Run `white --help` for the list of commands.\n");
    return 2;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 2;
  }

  const jsonFlag = Boolean(parsed.values.json);
  const helpFlag = Boolean(parsed.values.help);

  if (helpFlag) {
    process.stdout.write(commandHelp(cmd) + "\n");
    return 0;
  }

  if (jsonFlag && !cmd.supportsJson) {
    const result = fail(cmd.name, [
      makeDiagnostic({
        code: "WHITE_CLI_USAGE",
        kind: "cli",
        message: `command "${cmd.name}" does not support --json`,
      }),
    ]);
    process.stdout.write(renderJson(result) + "\n");
    return 2;
  }

  try {
    const result = await cmd.run({
      cwd: process.cwd(),
      json: jsonFlag,
      positional: parsed.positionals,
    });

    if (jsonFlag) {
      process.stdout.write(renderJson(result) + "\n");
    } else {
      const rendered = renderHuman(result, humanSummary(cmd.name, result.ok, result.result));
      if (rendered.length > 0) process.stdout.write(rendered + "\n");
    }
    return result.ok ? 0 : 1;
  } catch (err) {
    const result = fail(cmd.name, [
      makeDiagnostic({
        code: "WHITE_INTERNAL_ERROR",
        kind: "internal",
        message: (err as Error).message,
      }),
    ]);
    if (jsonFlag) process.stdout.write(renderJson(result) + "\n");
    else process.stderr.write(`internal error: ${(err as Error).message}\n`);
    return 1;
  }
}

function humanSummary(name: string, okStatus: boolean, result: unknown): string {
  if (!okStatus) return "";
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    switch (name) {
      case "check":
        return [
          `Project configuration valid.`,
          `  project: ${str(r["projectRoot"])}`,
          `  entry:   ${str(r["entry"])}`,
          `  profile: ${str(r["profile"])} (target: ${str(r["target"])})`,
          `Black syntax valid. Semantic checking is not yet implemented in this phase.`,
        ].join("\n");
      case "build": {
        const artifacts = Array.isArray(r["artifacts"]) ? (r["artifacts"] as Array<{ path: string }>) : [];
        const paths = artifacts.map((a) => `  - ${a.path}`).join("\n");
        return [
          `Placeholder build completed.`,
          paths,
          `Source parsed successfully; JavaScript emission is still a placeholder.`,
        ].join("\n");
      }
      case "run":
        return `Ran ${str(r["entry"])} (exit ${String(r["exitCode"])}).`;
      case "capabilities":
        return [
          `Language: Black`,
          `Profile: ${str(r["profile"])}`,
          `Backend: ${str(r["backend"])}`,
          `Stage: ${str(r["implementation_stage"])}`,
          `Targets: node=available, browser=not-yet-implemented`,
          `Compiler: source parsing/typechecking/codegen not implemented; placeholder build only.`,
        ].join("\n");
      case "docs":
      case "query":
      case "test":
        return str(r["message"]) ?? "";
    }
  }
  return "";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
