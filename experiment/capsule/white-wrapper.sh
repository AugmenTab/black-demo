#!/bin/sh
# Transparent timing wrapper installed as /usr/local/bin/white.
# Records when White is invoked (the first invocation marks the experiment
# start), then executes the real White CLI with the original arguments.
# It prints nothing and does not change White's output or exit status.

log_dir=/var/log/experiment
utc=$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)
mono=$(cut -d ' ' -f 1 /proc/uptime)

if [ -d "$log_dir" ] && [ -w "$log_dir" ]; then
  if mkdir "$log_dir/.first-white" 2>/dev/null; then
    is_help=false
    if [ "$#" -eq 1 ] && [ "$1" = "--help" ]; then
      is_help=true
    fi
    printf '{"utc":"%s","monotonic_uptime_s":%s,"is_white_help":%s,"argc":%s}\n' \
      "$utc" "$mono" "$is_help" "$#" > "$log_dir/first-white-invocation.json"
  fi
  printf '%s\t%s\twhite %s\n' "$utc" "$mono" "$*" >> "$log_dir/white-invocations.log"
fi

exec node /opt/white/dist/src/white/cli.js "$@"
