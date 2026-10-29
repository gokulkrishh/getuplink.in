#!/usr/bin/env bash
# Stop the verification instance this skill started on a port, and remove its copy of the app.
# Evidence (screenshots, text) lives elsewhere and is never touched.
# Usage: cleanup.sh [port]   (default 3210). Add --keep-copy to keep the app copy for a faster relaunch.
set -uo pipefail

PORT="${1:-3210}"
STATE="${UPLINK_VERIFY_STATE:-${TMPDIR:-/tmp}/uplink-verify-$PORT}"

if [ -f "$STATE/server.pid" ]; then
  pid="$(cat "$STATE/server.pid")"
  # Kill only the process tree we started: bunx, then next and its workers.
  kids="$(pgrep -P "$pid" 2>/dev/null || true)"
  grandkids=""
  for k in $kids; do grandkids="$grandkids $(pgrep -P "$k" 2>/dev/null || true)"; done
  kill $grandkids $kids "$pid" 2>/dev/null || true
  sleep 1
  kill -9 $grandkids $kids "$pid" 2>/dev/null || true
  rm -f "$STATE/server.pid"
  echo "Stopped pid $pid and its children."
else
  echo "No server.pid in $STATE: nothing of ours to stop."
fi

if [ "${2:-}" != "--keep-copy" ] && [ -d "$STATE" ]; then
  /bin/rm -r "$STATE"
  echo "Removed $STATE."
fi
