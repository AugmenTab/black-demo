# Shared helpers for experiment/bin/*. Sourced, not executed.
set -euo pipefail

EXP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_DIR=$(cd "$EXP_DIR/.." && pwd)
LOCAL_DIR="$REPO_DIR/.local"
BUILD_DIR="$LOCAL_DIR/build"
PREFLIGHT_DIR="$LOCAL_DIR/preflight"
RUNS_DIR="$LOCAL_DIR/runs"

# Secrets: .env at the repository root (git-ignored; template .env.example).
# Only the names below are read; they are passed to Docker by name only, so
# values never appear in argv, and they are redacted from all artifacts.
SECRETS_FILE="$REPO_DIR/.env"
SECRET_NAMES="CLAUDE_CODE_OAUTH_TOKEN RAILWAY_TOKEN"

# shellcheck source=../config.env
. "$EXP_DIR/config.env"

IMAGE_TAG="$IMAGE_NAME:claude-$CLAUDE_CODE_VERSION-white-${WHITE_COMMIT:0:12}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

image_id() { docker image inspect --format '{{.Id}}' "$IMAGE_TAG" 2>/dev/null || true; }

# Loads the named secrets from $SECRETS_FILE into the environment (KEY=VALUE
# lines; the file is parsed, never sourced). Returns 1 if any is missing.
load_secrets() {
  local name value missing=""
  [ -f "$SECRETS_FILE" ] || { log "missing $SECRETS_FILE (copy .env.example)"; return 1; }
  for name in $SECRET_NAMES; do
    value=$({ grep -E "^$name=" "$SECRETS_FILE" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')
    if [ -n "$value" ]; then export "$name=$value"; else missing="$missing $name"; fi
  done
  if [ -n "$missing" ]; then
    log "missing values in $SECRETS_FILE:$missing"
    return 1
  fi
}

require_secrets() {
  load_secrets || die "secrets unavailable; see experiment/README.md (one-time setup)"
}

# Secret values, one per line, for redaction. Never printed.
secret_values() {
  local name
  for name in $SECRET_NAMES; do
    eval "printf '%s\n' \"\${$name:-}\""
  done
}

ensure_network() {
  docker network inspect "$CAPSULE_NETWORK" >/dev/null 2>&1 \
    || docker network create --driver bridge "$CAPSULE_NETWORK" >/dev/null
}

# Common `docker run` flags for every capsule container. The only bind mount
# is the workspace passed as $1; no home, ~/.claude, docker socket, SSH agent
# or credential store is ever mounted.
capsule_run_flags() {
  local workspace=$1
  local flags=(
    --network "$CAPSULE_NETWORK"
    --cap-add NET_ADMIN
    --security-opt no-new-privileges
    --pids-limit 4096
    --shm-size 1g
    --label experiment=black-demo
    --mount "type=bind,source=$workspace,target=/workspace/black-demo"
    -e CLAUDE_CODE_OAUTH_TOKEN
    -e RAILWAY_TOKEN
    -e EXPERIMENT_MODEL="$CLAUDE_MODEL"
    -e EXPERIMENT_EFFORT="$CLAUDE_EFFORT"
    -e EXPERIMENT_DISALLOWED_TOOLS="$DISALLOWED_TOOLS"
    -e EXPERIMENT_CLAUDE_VERSION="$CLAUDE_CODE_VERSION"
    -e EXPERIMENT_STOP_GRACE="$STOP_GRACE_SECONDS"
    -e EXPERIMENT_MAX_SECONDS="$MAX_RUN_SECONDS"
    -e RAILWAY_PROJECT_ID="$RAILWAY_PROJECT_ID"
    -e RAILWAY_ENVIRONMENT_ID="$RAILWAY_ENVIRONMENT_ID"
    -e RAILWAY_SERVICE="$RAILWAY_SERVICE"
    -e RAILWAY_SERVICE_ID="$RAILWAY_SERVICE_ID"
  )
  local host
  for host in $BLOCKED_HOSTS; do
    flags+=(--add-host "$host:0.0.0.0")
  done
  printf '%s\n' "${flags[@]}"
}

# Fills the global array FLAGS with capsule_run_flags for workspace $1
# (bash 3.2 compatible; macOS has no mapfile).
load_flags() {
  FLAGS=()
  local line
  while IFS= read -r line; do FLAGS+=("$line"); done < <(capsule_run_flags "$1")
}

# Copies a stopped capsule's Claude state and capsule logs into $2, then
# removes the container.
collect_capsule() {
  local name=$1 dest=$2
  mkdir -p "$dest"
  docker cp "$name:/home/agent/.claude" "$dest/claude-state" >/dev/null 2>&1 || log "no Claude state in $name"
  docker cp "$name:/var/log/experiment" "$dest/capsule-logs" >/dev/null 2>&1 || log "no capsule logs in $name"
  docker rm -f "$name" >/dev/null 2>&1 || true
}

# Waits up to $2 seconds for container $1 to exit; returns 1 on timeout.
wait_for_exit() {
  local name=$1 limit=$2 waited=0
  while [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = "true" ]; do
    [ "$waited" -ge "$limit" ] && return 1
    sleep 5
    waited=$((waited + 5))
  done
}

# Replace every secret value in the given files with [REDACTED].
redact_tree() {
  local dir=$1
  local values
  values=$(secret_values)
  [ -n "$values" ] || return 0
  SECRET_VALUES="$values" node "$EXP_DIR/lib/redact.mjs" "$dir"
}
