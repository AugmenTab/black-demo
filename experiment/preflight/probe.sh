#!/bin/sh
# Starts the trivial probe page, then runs one unattended interactive Claude
# session through the same launcher as a real run (tmux, managed hooks, MCP).
set -eu
node /preflight/probe-server.mjs &
sleep 1
exec /opt/experiment/run-agent.sh "$(cat /preflight/probe-prompt.txt)"
