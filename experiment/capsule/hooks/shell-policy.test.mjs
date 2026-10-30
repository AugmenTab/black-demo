// Host-side tests for the shell policy (run by experiment/bin/preflight with
// `node --test`). This file is not used inside the capsule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "./shell-policy.mjs";

const allowed = [
  "white --help",
  "white capabilities",
  "white docs Platform.Server",
  "white query Main.update",
  "white check",
  "white build",
  "white run --port 4000",
  "git status",
  "git commit -m 'feat: add a; b && c | d'",
  'curl -s "https://example.com/?a=1&b=2"',
  "curl -s -o /dev/null -w '%{http_code}' https://example.com/",
  "railway up --detach",
  "railway status --json",
  "ls -la src",
  "white build 2>&1",
  "grep -rn 'x|y' src",
  "node dist/main.mjs",
  "date -u",
  "echo $HOME",
];

const rejected = [
  "echo a && echo b",
  "echo a || echo b",
  "echo a; echo b",
  "ls | wc -l",
  "echo $(whoami)",
  "echo `whoami`",
  'echo "$(whoami)"',
  "sleep 5 &",
  "bash -c 'ls'",
  "sh script.sh",
  "bash",
  "python3 -c 'print(1)'",
  "python script.py",
  "node -e 'console.log(1)'",
  "node --eval=1",
  "eval ls",
  "source env.sh",
  ". env.sh",
  "env FOO=1 white build",
  "FOO=1 white build",
  "export FOO=1",
  "(cd src && ls)",
  "{ ls; }",
  "cat <<EOF",
  "diff <(ls a) <(ls b)",
  "echo a\necho b",
  "xargs rm",
  "sudo ls",
  "claude -p hi",
  "npx @anthropic-ai/claude-code -p hi",
];

for (const cmd of allowed) {
  test(`allows: ${cmd}`, () => assert.equal(check(cmd), null));
}
for (const cmd of rejected) {
  test(`rejects: ${JSON.stringify(cmd)}`, () => assert.notEqual(check(cmd), null));
}
