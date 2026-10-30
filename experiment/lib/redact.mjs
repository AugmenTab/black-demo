#!/usr/bin/env node
// Replaces every secret value (newline-separated in $SECRET_VALUES) with
// [REDACTED] in all regular files under the given directory.

import { readdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { join } from "node:path";

const secrets = (process.env.SECRET_VALUES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s.length >= 8);

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isDirectory()) walk(path);
    else if (st.isFile()) redactFile(path);
  }
}

function redactFile(path) {
  const buf = readFileSync(path);
  let text = buf.toString("utf8");
  let changed = false;
  for (const s of secrets) {
    if (text.includes(s)) {
      text = text.split(s).join("[REDACTED]");
      changed = true;
    }
  }
  if (changed) writeFileSync(path, text);
}

walk(process.argv[2]);
