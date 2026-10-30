#!/usr/bin/env node
// Builds timing.json, final-response.txt, events/policy-rejections.jsonl,
// events/tool-calls.jsonl and result.json for a finished run directory.
//
// usage: summarize-run.mjs <run-dir> <process-exit-utc> <exit-code> <expected-url>
//
// Timing (authoritative):
//   start = capsule White wrapper's record of the first `white` invocation
//   end   = managed Stop hook: the moment Claude finished its final response
// Cross-checks: transcript timestamps, session start/end, container exit.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findTranscript, readTranscript } from "./transcript.mjs";

const [dir, exitUtc, exitCode, expectedUrl] = process.argv.slice(2);
const logs = join(dir, "events", "capsule-logs");
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

const firstWhite = readJson(join(logs, "first-white-invocation.json"));
const stop = readJson(join(logs, "stop.json"));
const sessionStart = readJson(join(logs, "session-start.json"));
const sessionEnd = readJson(join(logs, "session-end.json"));

const tFile = findTranscript(join(dir, "transcript", "claude-state"), stop?.session_id);
const t = tFile ? readTranscript(tFile) : null;

const rejections = (t?.toolResults ?? []).filter((r) => t.textOf(r).includes("Experiment policy"));
writeFileSync(
  join(dir, "events", "policy-rejections.jsonl"),
  rejections.map((r) => JSON.stringify({ timestamp: r.timestamp, input: t.toolUses.find((u) => u.id === r.tool_use_id)?.input, message: t.textOf(r) })).join("\n") + (rejections.length ? "\n" : ""),
);
writeFileSync(
  join(dir, "events", "tool-calls.jsonl"),
  (t?.toolUses ?? []).map((u) => JSON.stringify({ timestamp: u.timestamp, tool: u.name, input: u.input, is_error: t.resultFor(u.id)?.isError ?? null })).join("\n") + "\n",
);

const finalText = t?.finalResponse ?? "";
writeFileSync(join(dir, "final-response.txt"), finalText + "\n");
const urls = [...finalText.matchAll(/https:\/\/[^\s)<>"'`\]]+/g)].map((m) => m[0].replace(/[.,;:*]+$/, ""));
const finalUrl = urls.find((u) => u.startsWith(expectedUrl)) ?? urls.find((u) => u.includes(".up.railway.app")) ?? null;

const firstHelp = t?.toolUses.find((u) => u.name === "Bash" && /^\s*white\s+--help\s*$/.test(u.input?.command ?? ""));
const elapsed = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : null);
const monoElapsed = firstWhite && stop ? stop.monotonic_uptime_s - firstWhite.monotonic_uptime_s : null;

const timing = {
  authoritative: {
    start_utc: firstWhite?.utc ?? null,
    start_source: "capsule White wrapper: first white invocation",
    start_was_white_help: firstWhite?.is_white_help ?? null,
    end_utc: stop?.utc ?? null,
    end_source: "managed Stop hook: Claude finished its final response",
    elapsed_seconds: elapsed(firstWhite?.utc, stop?.utc),
    elapsed_monotonic_seconds: monoElapsed,
  },
  cross_checks: {
    session_start_utc: sessionStart?.utc ?? null,
    first_white_help_tool_call_utc: firstHelp?.timestamp ?? null,
    final_response_transcript_utc: t?.finalResponseAt ?? null,
    session_end_utc: sessionEnd?.utc ?? null,
    session_end_reason: sessionEnd?.reason ?? null,
    container_exit_utc: exitUtc,
    elapsed_to_container_exit_seconds: elapsed(firstWhite?.utc, exitUtc),
  },
};
writeFileSync(join(dir, "timing.json"), JSON.stringify(timing, null, 2) + "\n");

const counts = {};
for (const u of t?.toolUses ?? []) counts[u.name] = (counts[u.name] ?? 0) + 1;
const summary = {
  exit_code: Number(exitCode),
  session_end_reason: sessionEnd?.reason ?? null,
  session_id: stop?.session_id ?? null,
  transcript: tFile,
  models_used: t?.models ?? [],
  assistant_messages: t?.assistant.length ?? 0,
  tool_calls: t?.toolUses.length ?? 0,
  tool_call_counts: counts,
  policy_rejections: rejections.length,
  final_url: finalUrl,
  elapsed_seconds: timing.authoritative.elapsed_seconds,
};
writeFileSync(join(dir, "result.json"), JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
