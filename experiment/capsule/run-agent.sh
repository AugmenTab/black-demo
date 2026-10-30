#!/bin/sh
# Runs one interactive Claude Code session inside a detached tmux session
# named "agent" (tmux supplies the terminal; no host keyboard is connected to
# it). Operators watch with a read-only attach. The session ends when the
# managed Stop hook reports that Claude finished its final response; the
# final screen stays up for EXPERIMENT_STOP_GRACE seconds first.
#
# usage: run-agent.sh <prompt>
set -eu

LOG=/var/log/experiment
GRACE=${EXPERIMENT_STOP_GRACE:-20}
MAX=${EXPERIMENT_MAX_SECONDS:-21600}

printf '%s' "$1" > "$HOME/.experiment-prompt"
node /opt/experiment/seed-claude-config.mjs

tmux -f /opt/experiment/tmux.conf new-session -d -s agent \
  "/opt/experiment/claude-session.sh interactive $HOME/.experiment-prompt"
tmux pipe-pane -t agent -o "cat >> $LOG/terminal.log"
printf '{"utc":"%s","monotonic_uptime_s":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" "$(cut -d ' ' -f 1 /proc/uptime)" > "$LOG/session-start.json"

started=$(date +%s)
reason=claude-exited
while tmux has-session -t agent 2>/dev/null; do
  if [ -f "$LOG/stop.json" ]; then
    reason=final-response
    sleep "$GRACE"
    break
  fi
  if [ $(( $(date +%s) - started )) -ge "$MAX" ]; then
    reason=max-duration
    break
  fi
  sleep 1
done
tmux capture-pane -p -t agent -S - > "$LOG/final-screen.txt" 2>/dev/null || true
tmux kill-session -t agent 2>/dev/null || true
printf '{"utc":"%s","reason":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" "$reason" > "$LOG/session-end.json"
