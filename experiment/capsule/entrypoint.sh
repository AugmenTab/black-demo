#!/bin/sh
# Capsule entrypoint. Runs as root only long enough to:
#   1. install root-owned Claude Code managed settings (policy hooks),
#   2. block private/host networks while keeping public internet,
#   3. create the unprivileged agent user matching the workspace owner,
#   4. link the workspace to the Railway project when a token is present,
# then drops every capability and runs the requested command as the agent.
set -eu

WORKSPACE=${EXPERIMENT_WORKSPACE:-/workspace/black-demo}

node /opt/experiment/write-managed-settings.mjs

# --- network: public internet only -----------------------------------------
if [ "${EXPERIMENT_NETWORK_POLICY:-on}" = "on" ]; then
  iptables -F OUTPUT
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 198.18.0.0/15 0.0.0.0/8 224.0.0.0/4 240.0.0.0/4; do
    iptables -A OUTPUT -d "$net" -j REJECT --reject-with icmp-admin-prohibited
  done
  ip6tables -F OUTPUT 2>/dev/null || true
  ip6tables -A OUTPUT -o lo -j ACCEPT 2>/dev/null || true
  ip6tables -A OUTPUT -j REJECT 2>/dev/null || true
fi

# --- agent user --------------------------------------------------------------
owner_uid=$(stat -c %u "$WORKSPACE")
owner_gid=$(stat -c %g "$WORKSPACE")
[ "$owner_uid" = 0 ] && owner_uid=1000
[ "$owner_gid" = 0 ] && owner_gid=1000
getent group "$owner_gid" >/dev/null || groupadd -g "$owner_gid" agent
useradd -m -u "$owner_uid" -g "$owner_gid" -s /bin/bash agent 2>/dev/null || true
AGENT_HOME=$(getent passwd "$owner_uid" | cut -d: -f6)

mkdir -p /var/log/experiment "$AGENT_HOME/.cache" "$AGENT_HOME/.config" "$AGENT_HOME/tmp"
chown -R "$owner_uid:$owner_gid" /var/log/experiment "$AGENT_HOME"

as_agent() {
  setpriv --reuid "$owner_uid" --regid "$owner_gid" --init-groups \
    --inh-caps=-all --ambient-caps=-all --bounding-set=-all --no-new-privs \
    env -i \
      PATH=/usr/local/bin:/usr/bin:/bin \
      HOME="$AGENT_HOME" \
      USER=agent \
      LANG=C.UTF-8 \
      TERM=xterm-256color \
      TMPDIR="$AGENT_HOME/tmp" \
      XDG_CONFIG_HOME="$AGENT_HOME/.config" \
      XDG_CACHE_HOME="$AGENT_HOME/.cache" \
      CLAUDE_CONFIG_DIR="$AGENT_HOME/.claude" \
      PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
      DISABLE_AUTOUPDATER=1 \
      ENABLE_CLAUDEAI_MCP_SERVERS=false \
      ${CLAUDE_CODE_OAUTH_TOKEN:+CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN"} \
      ${RAILWAY_TOKEN:+RAILWAY_TOKEN="$RAILWAY_TOKEN"} \
      ${EXPERIMENT_MODEL:+EXPERIMENT_MODEL="$EXPERIMENT_MODEL"} \
      ${EXPERIMENT_EFFORT:+EXPERIMENT_EFFORT="$EXPERIMENT_EFFORT"} \
      ${EXPERIMENT_DISALLOWED_TOOLS:+EXPERIMENT_DISALLOWED_TOOLS="$EXPERIMENT_DISALLOWED_TOOLS"} \
      ${EXPERIMENT_CLAUDE_VERSION:+EXPERIMENT_CLAUDE_VERSION="$EXPERIMENT_CLAUDE_VERSION"} \
      ${EXPERIMENT_STOP_GRACE:+EXPERIMENT_STOP_GRACE="$EXPERIMENT_STOP_GRACE"} \
      ${EXPERIMENT_MAX_SECONDS:+EXPERIMENT_MAX_SECONDS="$EXPERIMENT_MAX_SECONDS"} \
      "$@"
}

# --- Railway linkage (stored in the capsule-local home only) ----------------
# A project token cannot run `railway link`, so write the CLI's link record
# (no credentials in it) for the workspace directly; plain `railway up` then
# targets the black-demo service.
if [ -n "${RAILWAY_PROJECT_ID:-}" ]; then
  mkdir -p "$AGENT_HOME/.railway"
  WORKSPACE="$WORKSPACE" node -e '
    const e = process.env;
    const link = { projectPath: e.WORKSPACE, name: e.RAILWAY_SERVICE, project: e.RAILWAY_PROJECT_ID,
      environment: e.RAILWAY_ENVIRONMENT_ID, environmentName: "production", service: e.RAILWAY_SERVICE_ID };
    require("fs").writeFileSync(process.argv[1], JSON.stringify({ projects: { [e.WORKSPACE]: link }, user: { token: null } }, null, 2) + "\n");
  ' "$AGENT_HOME/.railway/config.json"
  chown -R "$owner_uid:$owner_gid" "$AGENT_HOME/.railway"
fi

cd "$WORKSPACE"
case "${1:-agent}" in
  agent)
    shift || true
    as_agent /opt/experiment/run-agent.sh "$@"
    ;;
  *)
    as_agent "$@"
    ;;
esac
