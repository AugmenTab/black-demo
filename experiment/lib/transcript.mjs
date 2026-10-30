// Reads a Claude Code session transcript collected from the capsule
// (<claude-state>/projects/<project>/<session-id>.jsonl) into a simple shape
// used by the run summarizer and the preflight probe evaluator.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export function findTranscript(claudeStateDir, sessionId) {
  const projects = join(claudeStateDir, "projects");
  if (!existsSync(projects)) return null;
  const files = [];
  for (const p of readdirSync(projects)) {
    const d = join(projects, p);
    if (!statSync(d).isDirectory()) continue;
    for (const f of readdirSync(d)) if (f.endsWith(".jsonl")) files.push(join(d, f));
  }
  const exact = sessionId ? files.find((f) => f.endsWith(`${sessionId}.jsonl`)) : null;
  return exact ?? files.sort((a, b) => statSync(b).size - statSync(a).size)[0] ?? null;
}

export function readTranscript(file) {
  const entries = readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
  const assistant = entries.filter((e) => e.type === "assistant" && e.message);
  const toolUses = assistant.flatMap((e) =>
    (e.message.content ?? []).filter((c) => c.type === "tool_use").map((c) => ({ ...c, timestamp: e.timestamp })),
  );
  const toolResults = entries
    .filter((e) => e.type === "user" && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content.filter((c) => c.type === "tool_result").map((c) => ({ ...c, timestamp: e.timestamp })));
  const textOf = (c) => (typeof c.content === "string" ? c.content : (c.content ?? []).map((p) => p.text ?? "").join("\n"));
  const resultFor = (id) => {
    const r = toolResults.find((t) => t.tool_use_id === id);
    return r ? { text: textOf(r), isError: Boolean(r.is_error), timestamp: r.timestamp } : null;
  };
  const lastText = [...assistant].reverse().find((e) => (e.message.content ?? []).some((c) => c.type === "text"));
  const finalResponse = lastText ? lastText.message.content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : "";
  const models = [...new Set(assistant.map((e) => e.message.model).filter(Boolean))];
  return { entries, assistant, toolUses, toolResults, textOf, resultFor, finalResponse, finalResponseAt: lastText?.timestamp ?? null, models };
}
