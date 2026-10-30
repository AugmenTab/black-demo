#!/usr/bin/env node
// Evaluates the preflight Claude checks and prints { checks: [...] }.
//   1. Config check: a headless call with the run's exact flags; its init
//      event shows the effective model, tools, MCP servers and permission mode.
//   2. Interactive probe: an unattended interactive session in tmux, exactly
//      like a real run; verified from its transcript, capsule logs and the
//      answer file it was asked to write.
//
// usage: evaluate-probe.mjs <init-events.jsonl> <probe-dir> <model> <effort> <disallowed,csv>
//   <probe-dir> contains claude-state/, capsule-logs/, workspace/

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findTranscript, readTranscript } from "./transcript.mjs";

const [initFile, probeDir, expectedModel, expectedEffort, disallowedCsv] = process.argv.slice(2);
const disallowed = disallowedCsv.split(",").filter(Boolean);
const checks = [];
const record = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: String(detail ?? "").slice(0, 400) });
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

// --- 1. effective configuration ---------------------------------------------------
const initEvents = existsSync(initFile)
  ? readFileSync(initFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).event).filter(Boolean)
  : [];
const init = initEvents.find((e) => e.type === "system" && e.subtype === "init");
const initResult = initEvents.findLast((e) => e.type === "result");
record("config check: session started", Boolean(init), init ? `claude_code_version=${init.claude_code_version ?? "?"}` : "no init event");
const tools = init?.tools ?? [];
record("model is the pinned model", init?.model === expectedModel, `init.model=${init?.model}`);
record("no API key in use (OAuth subscription token)", init?.apiKeySource === "none", `apiKeySource=${init?.apiKeySource}`);
record("permission mode bypassPermissions", init?.permissionMode === "bypassPermissions", `permissionMode=${init?.permissionMode}`);
const presentDisallowed = tools.filter((t) => disallowed.includes(t));
record("sub-agent/publishing tools absent", presentDisallowed.length === 0, presentDisallowed.join(",") || "none present");
record("no claude.ai connector tools", !tools.some((t) => t.startsWith("mcp__claude_ai")), tools.filter((t) => t.startsWith("mcp__claude_ai")).join(",") || "none");
const pwTools = tools.filter((t) => t.startsWith("mcp__playwright__"));
record("browser tools visible to Claude", pwTools.length > 0, `${pwTools.length} playwright tools`);
const pwServer = (init?.mcp_servers ?? []).find((s) => s.name === "playwright");
record("playwright MCP server connected", pwServer?.status === "connected", JSON.stringify(init?.mcp_servers ?? []));
record("config check: headless call completed", initResult?.subtype === "success", `${initResult?.subtype ?? "no result"}`);

// --- 2. interactive probe ------------------------------------------------------------
const logs = join(probeDir, "capsule-logs");
const stop = readJson(join(logs, "stop.json"));
const end = readJson(join(logs, "session-end.json"));
record("interactive session started unattended and finished (Stop hook fired)", Boolean(stop), stop ? stop.utc : `no stop.json; session end reason=${end?.reason ?? "none"} (see probe-screen.txt)`);
record("session ended by final response, not timeout", end?.reason === "final-response", end?.reason);
record("terminal recording captured", existsSync(join(logs, "terminal.log")));
// The interactive banner states the effective model, effort and billing.
const screen = existsSync(join(logs, "terminal.log")) ? readFileSync(join(logs, "terminal.log"), "utf8").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "") : "";
const banner = screen.match(/Opus[^\n·]*with [a-z]+ effort[^\n]*/)?.[0] ?? "";
const bannerShort = banner.split("·").slice(0, 2).join("·").trim().slice(0, 80);
record("effective model and effort (interactive banner)", banner.includes(`with ${expectedEffort} effort`) && /Opus 5\.5/.test(banner), bannerShort || "banner not found");
record("banner does not report API usage billing", banner !== "" && !/API Usage Billing/.test(banner), bannerShort);

const tFile = findTranscript(join(probeDir, "claude-state"), stop?.session_id);
record("session transcript captured", Boolean(tFile), tFile ?? "none");
if (tFile) {
  const t = readTranscript(tFile);
  record("interactive session used the pinned model", t.models.length > 0 && t.models.every((m) => m === expectedModel), t.models.join(","));
  const bash = t.toolUses.filter((u) => u.name === "Bash");
  const simple = bash.find((u) => /^echo capsule-ok\s*$/.test(u.input?.command ?? ""));
  const simpleRes = simple ? t.resultFor(simple.id) : null;
  record("simple shell command executed without a prompt", simpleRes && !simpleRes.isError && simpleRes.text.includes("capsule-ok"), simpleRes?.text.slice(0, 120) ?? "not attempted");
  const compound = bash.find((u) => (u.input?.command ?? "").includes("&&"));
  const compoundRes = compound ? t.resultFor(compound.id) : null;
  record("compound shell command rejected by policy hook (despite adversarial project settings)", compoundRes?.text.includes("Experiment policy"), compoundRes?.text.slice(0, 160) ?? "not attempted");
  record("no sub-agent tool calls", !t.toolUses.some((u) => disallowed.includes(u.name)));
  const used = new Set(t.toolUses.map((u) => u.name));
  for (const name of ["browser_navigate", "browser_click", "browser_resize", "browser_tabs"]) {
    record(`browser tool used: ${name}`, used.has(`mcp__playwright__${name}`));
  }
  record("WebFetch used", used.has("WebFetch"));
}

const answer = readJson(join(probeDir, "workspace", "probe-answer.json"));
record("probe answer written to workspace", Boolean(answer));
if (answer) {
  record("page read: main heading", answer.main_heading === "Probe main page", answer.main_heading);
  record("page interaction: counter after two clicks", Number(answer.counter_after_two_clicks) === 2, answer.counter_after_two_clicks);
  record("phone-sized viewport", Number(answer.width_after_phone_resize) === 390, answer.width_after_phone_resize);
  record("desktop viewport", Number(answer.width_after_desktop_resize) === 1280, answer.width_after_desktop_resize);
  record("multiple pages: second tab", answer.second_tab_heading === "Probe second page" && Number(answer.open_tab_count) >= 2, `${answer.second_tab_heading} tabs=${answer.open_tab_count}`);
  record("public web research (WebFetch)", /example domain/i.test(answer.example_com_title ?? ""), answer.example_com_title);
}

process.stdout.write(JSON.stringify({ checks }, null, 2) + "\n");
