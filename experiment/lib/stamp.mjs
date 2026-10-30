#!/usr/bin/env node
// Reads Claude Code stream-json from stdin and writes one JSON object per
// line to the output file: { host_utc, host_mono_ms, event } (or { raw } for
// non-JSON lines). Host timestamps are taken as each line arrives, so the
// timing does not depend on the agent. A one-line summary of each event is
// printed to stderr so the operator can follow along.

import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";

const out = createWriteStream(process.argv[2], { flags: "a" });
const quiet = process.argv.includes("--quiet");

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  const host_utc = new Date().toISOString();
  const host_mono_ms = Number(process.hrtime.bigint() / 1000000n);
  let record;
  try {
    record = { host_utc, host_mono_ms, event: JSON.parse(line) };
  } catch {
    record = { host_utc, host_mono_ms, raw: line };
  }
  out.write(JSON.stringify(record) + "\n");
  if (!quiet) process.stderr.write(summary(record) + "\n");
}
out.end();

function summary(r) {
  const t = r.host_utc.slice(11, 19);
  if (r.raw !== undefined) return `${t} | ${r.raw.slice(0, 160)}`;
  const e = r.event;
  if (e.type === "assistant") {
    const parts = (e.message?.content ?? []).map((c) => {
      if (c.type === "text") return `text: ${c.text.replace(/\s+/g, " ").slice(0, 120)}`;
      if (c.type === "tool_use") {
        const arg = c.input?.command ?? c.input?.file_path ?? c.input?.url ?? c.input?.query ?? "";
        return `tool ${c.name} ${String(arg).replace(/\s+/g, " ").slice(0, 100)}`;
      }
      return c.type;
    });
    return `${t} | assistant | ${parts.join(" ; ")}`;
  }
  if (e.type === "result") return `${t} | result | ${e.subtype} turns=${e.num_turns} error=${e.is_error}`;
  if (e.type === "system") return `${t} | system | ${e.subtype ?? ""}`;
  return `${t} | ${e.type}`;
}
