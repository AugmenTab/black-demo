# Experiment harness: hermetic execution capsule

This harness gives one fresh Claude Code session a new machine, a clean copy
of the task fixture, White, a browser, Railway and nothing else, and records
the run. Its isolation is enforced by the environment, not by instructions.

```
experiment/bin/build       build the capsule image (pinned versions, sanitized White)
experiment/bin/preflight   hard gate: verify everything; writes a PASS stamp
experiment/bin/run         fresh workspace -> live interactive session -> artifacts
experiment/bin/watch       re-attach a read-only view of the current run
experiment/bin/reset       destroy disposable state before another run
```

## One-time operator setup

1. **Docker** (OrbStack or Docker Desktop) running. Host tools used by the
   harness itself: `bash`, `git`, `node` (>= 22), `curl`, `shasum`, `openssl`.
2. **White**: a checkout of the White repository at `WHITE_REPO` containing
   commit `WHITE_COMMIT` (see `config.env`). Only a `git archive` of that
   commit is used, and only its sanitized build output enters the image.
3. **White smoke fixture** (local only, never committed, unrelated to the
   task): `.local/preflight/white-smoke/` containing a minimal node-target
   project (`white.toml` with `kind = "node"`, and `src/Main.blk`).
4. **Secrets**: `cp .env.example .env` (git-ignored), then fill in:
   - `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` (Claude subscription;
     API keys are rejected because the experiment must not use API billing).
   - `RAILWAY_TOKEN`: a **project** token for project `black-demo`,
     environment `production` (Railway: project -> Settings -> Tokens).
5. **Railway target** (already provisioned for this repository; ids in
   `config.env`): project `black-demo`, service `black-demo`, service
   variable `PORT=8080`, public domain `black-demo-production.up.railway.app`
   targeting port 8080. To provision elsewhere: `railway init --name
   black-demo`, `railway add --service black-demo`, `railway domain --service
   black-demo --port 8080`, `railway variables --service black-demo --set
   PORT=8080`, then update the ids in `config.env`.

## Running

```
experiment/bin/build
experiment/bin/preflight
experiment/bin/run
```

`run` refuses to start unless the latest preflight passed for the same image
and `config.env` within the last 12 hours. It then attaches your terminal,
**read-only**, to the agent's live interactive Claude Code session (use a
terminal of at least 200x50; the session follows the most recently attached
window size). Nothing typed there reaches the agent. `Ctrl-b d` detaches;
`experiment/bin/watch` re-attaches. When Claude finishes its final response,
the final screen stays up for `STOP_GRACE_SECONDS`, the capsule stops, and the
artifacts are collected.

## Architecture

- **Capsule**: one Docker container per run (and per preflight check) on a
  user-defined bridge network. The entire Claude Code process runs inside it.
  The entrypoint runs as root only to install managed settings, apply the
  firewall, create the `agent` user and write the Railway link record, then
  drops every capability (`setpriv`, no-new-privs) and runs as `agent`.
- **Mounts**: exactly one bind mount, the fresh trial workspace at
  `/workspace/black-demo`. No host home, `~/.claude`, Docker socket, SSH
  agent, Git credentials, neighboring repositories or White source.
  (Preflight containers additionally mount `experiment/preflight` and the
  smoke fixture read-only; real runs never do.)
- **Claude state**: `HOME=/home/agent`, `CLAUDE_CONFIG_DIR`, `TMPDIR` and XDG
  directories are all inside the disposable container. The global config is
  seeded only to skip first-run dialogs.
- **Model/effort**: `claude-session.sh` launches every session with
  `--model claude-opus-5-5 --effort medium` and no fallback model. Preflight
  verifies the effective model (init event and transcript) and effort
  (interactive banner).
- **Permissions**: `--permission-mode bypassPermissions` plus managed
  `defaultMode: bypassPermissions` and `skipDangerousModePermissionPrompt`.
  The container is the security boundary.
- **Policy** (`/etc/claude-code/managed-settings.json`, root-owned, with
  `allowManagedHooksOnly`): a PreToolUse hook on Bash rejects compound and
  orchestrating commands (`|`, `||`, `&&`, `;`, `&`, substitution, subshells,
  here-docs, shells, `eval`/`source`/`env`/`export`, inline-eval interpreters,
  nested `claude`), using a quote-aware lexer over the structured command.
  Sub-agent and publishing tools are removed (`--disallowed-tools`), denied
  (managed `permissions.deny`) and backed by a deny hook. A Stop hook records
  the end of the final response.
- **White**: built in a builder stage from `git archive <commit>` (`src`,
  `std/Platform`, package files), comments stripped with esbuild, no source
  maps, tests, examples or reference material; the build fails if any remain.
  `/usr/local/bin/white` is a transparent wrapper that records the first
  invocation (UTC and monotonic) and execs the real CLI.
- **Browser**: Playwright MCP (pinned) driving Playwright's Chromium,
  headless, isolated profile, coordinate clicks enabled, clipboard
  permissions granted.
- **Network**: public internet allowed; RFC1918, link-local, CGNAT, metadata
  and host gateway addresses rejected by iptables (set before privileges are
  dropped); `BLOCKED_HOSTS` resolve to 0.0.0.0 inside the capsule.
- **Secrets**: only `CLAUDE_CODE_OAUTH_TOKEN` and `RAILWAY_TOKEN`, read from
  `.env` and passed to Docker by name. All artifacts are redacted.

## Timing

- Start (authoritative): the White wrapper's record of the first `white`
  invocation inside the capsule (`first-white-invocation.json`).
- End (authoritative): the managed Stop hook, when Claude finished its final
  response (`stop.json`).
- Cross-checks in `timing.json`: transcript timestamps, session start/end,
  container exit, and the monotonic elapsed time.

## Run artifacts (`.local/runs/<run-id>/`)

```
metadata.json           commits, fixture hashes, image id, tool/model/effort versions
preflight-report.txt    the preflight that authorized this run
workspace/              the final trial workspace (with its Git history)
transcript/claude-state Claude Code session transcript and state
events/capsule-logs/    White invocations, terminal recording, stop/session markers
events/tool-calls.jsonl every tool call, timestamped
events/policy-rejections.jsonl
timing.json  final-response.txt  result.json
```

## Known limitations

- The injected Claude token is visible to the agent's own shell inside the
  capsule (Claude Code's subprocess credential scrubbing needs bubblewrap,
  which cannot create namespaces under Docker's default seccomp profile).
  It never leaves the capsule except as redacted artifacts.
- The shell policy allows `node <file>`; scripts the agent writes and then
  runs are visible in the transcript and audited rather than blocked.
- Hostname blocking is a resolver override, not a firewall rule; web research
  rules are audited from the transcript.
- Railway keeps deployment history for the service; preflight's smoke
  deployment replaces whatever ran there before.
