#!/usr/bin/env node
// PreToolUse hook backing up the removed tool list: any call that reaches a
// sub-agent or publishing tool is denied without asking anyone.

import { readFileSync } from "node:fs";

let name = "unknown";
try {
  name = JSON.parse(readFileSync(0, "utf8"))?.tool_name ?? name;
} catch {}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `Experiment policy: the ${name} tool is disabled in this experiment (no sub-agents).`,
  },
}));
