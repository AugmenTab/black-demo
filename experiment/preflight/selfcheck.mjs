#!/usr/bin/env node
// Deterministic capsule self-check. Runs inside a throwaway capsule as the
// unprivileged agent user and prints one JSON report:
//   { checks: [{ name, ok, detail }] }
// Mounted read-only at /preflight for preflight containers only; it is never
// present in a real run.

import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, cpSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

const checks = [];
const record = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });

// Expectations are written by experiment/bin/preflight into the throwaway
// workspace (the capsule passes no extra environment to the agent user).
const expect = JSON.parse(readFileSync("/workspace/black-demo/.expect.json", "utf8"));

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: opts.timeout ?? 60000, input: "", ...opts });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), stdout: r.stdout ?? "" };
}

async function fetchStatus(url, timeoutMs = 10000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return { ok: true, status: res.status, text: await res.text() };
  } catch (err) {
    return { ok: false, error: String(err.cause?.code ?? err.cause?.message ?? err.message) };
  }
}

function tcpProbe(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (r) => { s.destroy(); resolve(r); };
    s.setTimeout(timeoutMs, () => done("timeout"));
    s.on("connect", () => done("connected"));
    s.on("error", (e) => done(e.code ?? e.message));
  });
}

// --- identity, versions ------------------------------------------------------
const home = process.env.HOME ?? "";
record("runs as unprivileged agent", process.getuid() !== 0, `uid=${process.getuid()}`);
record("HOME is capsule-local", home.startsWith("/home/"), home);
const claudeV = sh("claude", ["--version"]);
record("claude code version pinned", claudeV.out.includes(expect.claudeVersion), claudeV.out.trim());
const railwayV = sh("railway", ["--version"]);
record("railway cli version pinned", railwayV.out.includes(expect.railwayVersion), railwayV.out.trim());
const whichWhite = sh("which", ["white"]);
record("white on PATH", whichWhite.stdout.trim() === "/usr/local/bin/white", whichWhite.stdout.trim());

// --- no prior Claude state -----------------------------------------------------
const claudeDir = join(home, ".claude");
const prior = existsSync(claudeDir) ? readdirSync(claudeDir) : [];
record("no prior Claude state in capsule", prior.length === 0, prior.join(",") || "empty");

// --- White distribution is sanitized ----------------------------------------
const whiteFind = sh("find", ["/opt/white", "-path", "/opt/white/node_modules", "-prune", "-o", "(", "-name", "*.ts", "-o", "-name", "*.map", "-o", "-type", "d", "-name", "test", "-o", "-type", "d", "-name", "src", "-path", "/opt/white/src", ")", "-print"]);
record("White distribution has no source/tests/maps", whiteFind.stdout.trim() === "", whiteFind.stdout.trim() || "clean");
const blk = sh("find", ["/", "-xdev", "-name", "*.blk", "-not", "-path", "/opt/white/std/Platform/*", "-not", "-path", "/preflight-smoke/*", "-not", "-path", "/proc/*"], { timeout: 120000 });
record("no Black sources outside White's bundled Platform modules", blk.stdout.trim() === "", blk.stdout.trim() || "none");
const blackJs = sh("find", ["/", "-xdev", "(", "-name", "black-js", "-o", "-name", "polygon-pong*", "-o", "-iname", "*pong*.blk", ")", "-not", "-path", "/proc/*"], { timeout: 120000 });
record("no White source checkout or Pong material on disk", blackJs.stdout.trim() === "", blackJs.stdout.trim() || "none");

// --- White works (first call is --help so timing instrumentation is tested) --
const help = sh("white", ["--help"]);
record("white --help", help.code === 0 && help.out.includes("White"), `exit ${help.code}`);
const caps = sh("white", ["capabilities"]);
record("white capabilities", caps.code === 0 && caps.out.length > 200, `exit ${caps.code}`);
const docs = sh("white", ["docs"]);
record("white docs", docs.code === 0 && docs.out.length > 200, `exit ${docs.code}`);
const first = existsSync("/var/log/experiment/first-white-invocation.json")
  ? JSON.parse(readFileSync("/var/log/experiment/first-white-invocation.json", "utf8"))
  : null;
record("timing wrapper recorded first `white --help`", first?.is_white_help === true && /Z$/.test(first.utc) && first.monotonic_uptime_s > 0, JSON.stringify(first));

const smoke = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "white-smoke-"));
cpSync("/preflight-smoke", smoke, { recursive: true });
for (const step of ["check", "build", "run"]) {
  const r = sh("white", [step], { cwd: smoke, timeout: 120000 });
  record(`white ${step} (smoke project)`, r.code === 0, r.out.trim().split("\n").slice(-2).join(" | "));
}

// --- mounts, sockets, credentials -----------------------------------------------
const mountinfo = readFileSync("/proc/self/mountinfo", "utf8").trim().split("\n");
const binds = mountinfo
  .map((l) => l.split(" "))
  .map((f) => ({ root: f[3], point: f[4] }))
  .filter((m) => m.root !== "/" && !m.point.startsWith("/proc") && !m.point.startsWith("/sys") && !m.point.startsWith("/dev"));
const allowedPoints = new Set(["/workspace/black-demo", "/preflight", "/preflight-smoke", "/etc/hosts", "/etc/hostname", "/etc/resolv.conf"]);
const unexpected = binds.filter((m) => !allowedPoints.has(m.point));
record("only expected bind mounts", unexpected.length === 0, binds.map((m) => `${m.point}<=${m.root}`).join(" ; "));
const leaky = mountinfo.filter((l) => /docker\.sock|\/\.ssh|\/\.claude|\/\.gnupg|\/\.aws|\/\.config\/gh|black-js|Library\/Keychains/.test(l));
record("no host home, ~/.claude, docker socket, SSH or credential mounts", leaky.length === 0, leaky.join(" ; ") || "none");
record("docker socket absent", !existsSync("/var/run/docker.sock") && !existsSync("/run/docker.sock"));
const badEnv = Object.keys(process.env).filter((k) => /^(SSH_AUTH_SOCK|GITHUB_TOKEN|GH_TOKEN|GITLAB_TOKEN|AWS_|GOOGLE_|AZURE_|OPENAI_|ANTHROPIC_API_KEY|NPM_TOKEN|DOCKER_)/.test(k));
record("no unrelated credentials in environment", badEnv.length === 0, badEnv.join(",") || "none");
const gitCreds = sh("git", ["config", "--show-origin", "--get-all", "credential.helper"]);
record("no git credential helper", gitCreds.stdout.trim() === "" && !existsSync(join(home, ".git-credentials")), gitCreds.stdout.trim() || "none");

// --- policy files cannot be weakened -------------------------------------------
const tryWrite = (p) => { try { writeFileSync(p, "x"); return "writable"; } catch (e) { return e.code; } };
record("managed settings not writable by agent", tryWrite("/etc/claude-code/managed-settings.json") === "EACCES");
record("policy hooks not writable by agent", tryWrite("/opt/experiment/hooks/shell-policy.mjs") === "EACCES");
const ipt = sh("iptables", ["-S"]);
record("agent cannot change firewall", ipt.code !== 0, ipt.out.trim().split("\n")[0]);
const managed = JSON.parse(readFileSync("/etc/claude-code/managed-settings.json", "utf8"));
record("managed settings: managed hooks only, Bash policy hook, sub-agent denies", managed.allowManagedHooksOnly === true
  && managed.hooks?.PreToolUse?.some((h) => h.matcher === "Bash")
  && ["Agent", "Task"].every((t) => managed.permissions?.deny?.includes(t)), managed.permissions?.deny?.join(","));
const hook = (command) => spawnSync("node", ["/opt/experiment/hooks/shell-policy.mjs"], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), encoding: "utf8" }).stdout;
record("policy hook allows simple command", hook("white check") === "");
record("policy hook denies compound command", hook("white check && white build").includes('"deny"'));

// --- network ------------------------------------------------------------------
const pub = await fetchStatus("https://example.com/");
record("public internet reachable", pub.ok && pub.status === 200, pub.ok ? pub.status : pub.error);
for (const host of expect.blockedHosts.split(" ").filter(Boolean)) {
  const r = await fetchStatus(`https://${host}/`, 6000);
  record(`blocked host unreachable: ${host}`, !r.ok, r.ok ? `HTTP ${r.status}` : r.error);
}
const route = readFileSync("/proc/net/route", "utf8").split("\n").find((l) => l.split("\t")[1] === "00000000");
if (route) {
  const hex = route.split("\t")[2];
  const gw = [3, 2, 1, 0].map((i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)).join(".");
  const r = await tcpProbe(gw, 80);
  record("host/gateway network blocked", r !== "connected", `${gw}:80 -> ${r}`);
}
for (const ip of ["192.168.1.1", "10.0.0.1", "169.254.169.254"]) {
  const r = await tcpProbe(ip, 80, 3000);
  record(`private network blocked: ${ip}`, r !== "connected", r);
}

// --- Railway ------------------------------------------------------------------
if (expect.railway) {
  const st = sh("railway", ["status", "--json"], { cwd: "/workspace/black-demo", timeout: 60000, env: { ...process.env, CI: "true" } });
  let parsed = null;
  try { parsed = JSON.parse(st.stdout); } catch {}
  const svc = parsed?.environments?.edges?.[0]?.node?.serviceInstances?.edges?.map((e) => e.node.serviceName) ?? [];
  record("railway: token works without prompts, project linked", st.code === 0 && parsed?.name === expect.railwayProject, `project=${parsed?.name} exit=${st.code} ${st.code === 0 ? "" : st.out.slice(0, 200)}`);
  record("railway: service present", svc.includes(expect.railwayService), svc.join(","));
  const svcStatus = sh("railway", ["service", "status"], { cwd: "/workspace/black-demo", timeout: 60000 });
  record("railway: workspace linked to the service at capsule start (plain `railway up` targets it)", svcStatus.code === 0 && svcStatus.out.includes(`Service: ${expect.railwayService}`), svcStatus.out.trim().split("\n")[0]);
}

process.stdout.write(JSON.stringify({ checks }, null, 2) + "\n");
