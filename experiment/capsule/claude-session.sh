#!/bin/sh
# Starts Claude Code with the pinned model, effort, MCP servers and tool
# removals. Every launch path uses this file so the flags cannot drift.
#
#   claude-session.sh interactive <prompt-file>   normal interactive UI
#   claude-session.sh print <prompt>              headless (preflight config check)
set -eu

mode=$1
shift

if [ "$mode" = interactive ]; then
  prompt=$(cat "$1")
  shift
  exec claude "$prompt" \
    --model "$EXPERIMENT_MODEL" \
    --effort "$EXPERIMENT_EFFORT" \
    --permission-mode bypassPermissions \
    --disallowed-tools "$EXPERIMENT_DISALLOWED_TOOLS" \
    --mcp-config /opt/experiment/mcp.json \
    --strict-mcp-config \
    --no-chrome \
    "$@"
fi

prompt=$1
shift
exec claude -p "$prompt" \
  --model "$EXPERIMENT_MODEL" \
  --effort "$EXPERIMENT_EFFORT" \
  --permission-mode bypassPermissions \
  --permission-prompts none \
  --disallowed-tools "$EXPERIMENT_DISALLOWED_TOOLS" \
  --mcp-config /opt/experiment/mcp.json \
  --strict-mcp-config \
  --no-chrome \
  --output-format stream-json \
  --verbose \
  "$@"
