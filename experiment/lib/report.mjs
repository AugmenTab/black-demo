#!/usr/bin/env node
// Collects PASS/FAIL checks into a JSON-lines file and prints the summary.
//   report.mjs add     <checks.jsonl> <section> <name> <ok:0|1> [detail]
//   report.mjs merge   <checks.jsonl> <section> <report.json>   ({ checks: [...] })
//   report.mjs summary <checks.jsonl>                            (exit 1 on any FAIL)

import { appendFileSync, readFileSync, existsSync } from "node:fs";

const [mode, file, ...rest] = process.argv.slice(2);
const write = (section, name, ok, detail) =>
  appendFileSync(file, JSON.stringify({ section, name, ok: Boolean(ok), detail: String(detail ?? "") }) + "\n");

if (mode === "add") {
  const [section, name, ok, detail] = rest;
  write(section, name, ok === "1", detail);
} else if (mode === "merge") {
  const [section, reportFile] = rest;
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(reportFile, "utf8"));
  } catch (err) {
    write(section, "report readable", false, `${reportFile}: ${err.message}`);
  }
  for (const c of parsed?.checks ?? []) write(section, c.name, c.ok, c.detail);
} else if (mode === "summary") {
  const rows = existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  let section = "";
  for (const r of rows) {
    if (r.section !== section) {
      section = r.section;
      console.log(`\n== ${section}`);
    }
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
  }
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 && rows.length > 0 ? "PREFLIGHT: PASS" : "PREFLIGHT: FAIL"} (${rows.length - failed}/${rows.length} checks passed)`);
  process.exit(failed === 0 && rows.length > 0 ? 0 : 1);
}
