#!/usr/bin/env node
// Writes /etc/claude-code/managed-settings.json (root-owned, read-only for the
// agent). Managed settings outrank user and project settings, and
// allowManagedHooksOnly prevents the agent from replacing or disabling hooks.

import { mkdirSync, writeFileSync, chmodSync } from "node:fs";

const denied = (process.env.EXPERIMENT_DISALLOWED_TOOLS ?? "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const settings = {
  permissions: {
    defaultMode: "bypassPermissions",
    deny: denied,
  },
  allowManagedHooksOnly: true,
  skipDangerousModePermissionPrompt: true,
  hooks: {
    Stop: [
      {
        hooks: [{ type: "command", command: "node /opt/experiment/hooks/on-stop.mjs" }],
      },
    ],
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [{ type: "command", command: "node /opt/experiment/hooks/shell-policy.mjs" }],
      },
      {
        matcher: denied.join("|"),
        hooks: [{ type: "command", command: "node /opt/experiment/hooks/deny-tool.mjs" }],
      },
    ],
  },
};

mkdirSync("/etc/claude-code", { recursive: true });
writeFileSync("/etc/claude-code/managed-settings.json", JSON.stringify(settings, null, 2) + "\n");
chmodSync("/etc/claude-code/managed-settings.json", 0o644);
