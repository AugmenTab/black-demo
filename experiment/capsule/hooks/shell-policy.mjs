#!/usr/bin/env node
// PreToolUse hook for the Bash tool: one simple command per invocation.
//
// Reads the hook payload from stdin and inspects tool_input.command with a
// small quote-aware lexer, so punctuation inside quotes (URLs, JSON, patterns)
// is never mistaken for shell control syntax. Violations are denied with a
// structured decision; nothing here ever asks a human.

import { readFileSync } from "node:fs";

const HEADER = "Experiment policy: compound shell commands are disabled. Run one simple command at a time.";

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish", "csh", "tcsh"]);
const WRAPPERS = new Set(["eval", "source", ".", "exec", "env", "export", "sudo", "su", "doas", "xargs", "nohup", "setsid", "script", "unset", "alias"]);
const INLINE_EVAL = {
  node: ["-e", "--eval", "-p", "--print", "-"],
  python: null,
  python3: null,
  perl: null,
  ruby: null,
  php: null,
  deno: ["eval"],
  bun: ["-e", "--eval", "-p", "--print"],
};
const SUBAGENT_COMMANDS = new Set(["claude"]);

export function check(command) {
  const lex = lexCommand(command);
  if (lex.error) return lex.error;
  const words = lex.words;
  if (words.length === 0) return null;

  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
    return "environment-variable prefixes and assignments are disabled.";
  }
  const program = words[0].split("/").pop();
  if (SHELLS.has(program)) return `running a shell (${program}) is disabled.`;
  if (WRAPPERS.has(program)) return `'${program}' is disabled.`;
  if (SUBAGENT_COMMANDS.has(program)) return "launching another Claude session is disabled.";
  if (program === "npx" && words.some((w) => w.includes("claude-code"))) {
    return "launching another Claude session is disabled.";
  }
  if (program in INLINE_EVAL) {
    const flags = INLINE_EVAL[program];
    if (flags === null) return `${program} is disabled.`;
    if (words.slice(1).some((w) => flags.includes(w) || /^--(eval|print)=/.test(w))) {
      return `inline code (${program} ${words.find((w) => flags.includes(w)) ?? "-e"}) is disabled.`;
    }
  }
  return null;
}

// Splits a command into words while rejecting control operators that appear
// outside quotes. Returns { words } or { error }.
function lexCommand(command) {
  const words = [];
  let word = "";
  let inWord = false;
  let i = 0;
  const fail = (why) => ({ error: why });
  const push = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };

  const trimmed = command.trim();
  if (trimmed.startsWith("(") || trimmed.startsWith("{")) return fail("subshells and command groups are disabled.");

  while (i < command.length) {
    const c = command[i];
    const next = command[i + 1];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end < 0) return fail("unterminated quote.");
      word += command.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== '"') {
        if (command[j] === "\\") { j += 2; continue; }
        if (command[j] === "`") return fail("command substitution is disabled.");
        if (command[j] === "$" && command[j + 1] === "(") return fail("command substitution is disabled.");
        j++;
      }
      if (j >= command.length) return fail("unterminated quote.");
      word += command.slice(i + 1, j);
      inWord = true;
      i = j + 1;
      continue;
    }
    if (c === "\\") {
      if (next === "\n") return fail("multi-line commands are disabled.");
      word += next ?? "";
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (command.slice(i).trim() === "") { i++; continue; }
      return fail("multiple commands on separate lines are disabled.");
    }
    if (c === ";") return fail("';' command chaining is disabled.");
    if (c === "`") return fail("command substitution is disabled.");
    if (c === "$" && next === "(") return fail("command substitution is disabled.");
    if (c === "|") return fail(next === "|" ? "'||' is disabled." : "pipelines are disabled.");
    if (c === "&") {
      if (next === "&") return fail("'&&' is disabled.");
      if (next === ">" || command[i - 1] === ">") { word += c; inWord = true; i++; continue; }
      return fail("background '&' is disabled (use the tool's background option).");
    }
    if ((c === "<" || c === ">") && next === "(") return fail("process substitution is disabled.");
    if (c === "<" && next === "<") return fail("here-documents are disabled.");
    if (c === " " || c === "\t") { push(); i++; continue; }
    word += c;
    inWord = true;
    i++;
  }
  push();
  return { words };
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  if (payload?.tool_name !== "Bash") process.exit(0);
  const command = String(payload?.tool_input?.command ?? "");
  const why = check(command);
  if (why === null) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `${HEADER}\nRejected: ${why}`,
    },
  }));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
