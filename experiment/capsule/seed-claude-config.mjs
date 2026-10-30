#!/usr/bin/env node
// Seeds the capsule-local Claude Code global config so an unattended
// interactive session starts without first-run dialogs (onboarding, theme,
// workspace trust, bypass-mode acknowledgement). Contains no credentials.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.CLAUDE_CONFIG_DIR;
const workspace = process.cwd();
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, ".claude.json"), JSON.stringify({
  hasCompletedOnboarding: true,
  theme: "dark",
  bypassPermissionsModeAccepted: true,
  autoUpdates: false,
  lastReleaseNotesSeen: process.env.EXPERIMENT_CLAUDE_VERSION ?? "",
  projects: {
    [workspace]: {
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
      allowedTools: [],
    },
  },
}, null, 2) + "\n");
