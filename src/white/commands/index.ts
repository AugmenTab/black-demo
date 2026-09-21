import type { CommandDefinition } from "./shared.js";
import { buildCommand } from "./build.js";
import { capabilitiesCommand } from "./capabilities.js";
import { checkCommand } from "./check.js";
import { docsCommand } from "./docs.js";
import { queryCommand } from "./query.js";
import { runCommand } from "./run.js";
import { testCommand } from "./test.js";

export const COMMANDS: Record<string, CommandDefinition> = {
  capabilities: capabilitiesCommand,
  check: checkCommand,
  build: buildCommand,
  run: runCommand,
  test: testCommand,
  docs: docsCommand,
  query: queryCommand,
};

export const COMMAND_ORDER: readonly string[] = [
  "capabilities",
  "check",
  "build",
  "run",
  "test",
  "docs",
  "query",
];
