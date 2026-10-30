#!/usr/bin/env node
// Stop hook: Claude finished responding. Records the first such moment (the
// final response of the single-prompt session) for the harness. Never blocks.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const utc = new Date().toISOString();
const uptime = Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]);
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {}

const file = "/var/log/experiment/stop.json";
if (!existsSync(file)) {
  writeFileSync(file, JSON.stringify({
    utc,
    monotonic_uptime_s: uptime,
    session_id: input.session_id ?? null,
    transcript_path: input.transcript_path ?? null,
  }) + "\n");
}
