#!/usr/bin/env bash
# Start a demo-mode Uplink for verification, from a copy of the current checkout.
# Usage: launch.sh [port]   (default 3210)
#
# Why a copy: Next.js allows one `next dev` per folder, and the owner's own dev server usually holds the
# checkout on port 3000. The copy holds tracked and untracked-but-not-ignored files only, so .env*, keys/
# and .next never come along: demo mode can't reach the database or Tesla.
set -euo pipefail

PORT="${1:-3210}"
SRC="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
STATE="${UPLINK_VERIFY_STATE:-${TMPDIR:-/tmp}/uplink-verify-$PORT}"
APP="$STATE/app"

if [ -f "$STATE/server.pid" ] && kill -0 "$(cat "$STATE/server.pid")" 2>/dev/null; then
  echo "Already running: pid $(cat "$STATE/server.pid"), http://localhost:$PORT (run cleanup.sh $PORT first to relaunch)"
  exit 0
fi
if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Port $PORT is taken by a process this skill didn't start. Pick another port." >&2
  exit 1
fi

mkdir -p "$APP"
# Sync the checkout's files, deleting files that no longer exist, but keep the copy's node_modules and .next.
(cd "$SRC" && git ls-files -z --cached --others --exclude-standard) |
  rsync -a --delete --from0 --files-from=- "$SRC/" "$APP/" 2>/dev/null ||
  (cd "$SRC" && git ls-files -z --cached --others --exclude-standard) | rsync -a --from0 --files-from=- "$SRC/" "$APP/"
(cd "$APP" && bun install --frozen-lockfile >"$STATE/install.log" 2>&1) || {
  echo "bun install failed; see $STATE/install.log" >&2
  exit 1
}

cd "$APP"
UPLINK_DEMO=1 nohup bunx next dev -p "$PORT" >"$STATE/server.log" 2>&1 &
echo $! >"$STATE/server.pid"

# Ready when the home page answers 200 (the first compile takes a while).
for _ in $(seq 1 120); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" || true)"
  if [ "$code" = "200" ]; then
    echo "Ready: http://localhost:$PORT (pid $(cat "$STATE/server.pid"), log $STATE/server.log)"
    exit 0
  fi
  if ! kill -0 "$(cat "$STATE/server.pid")" 2>/dev/null; then
    echo "Server exited; last log lines:" >&2
    tail -20 "$STATE/server.log" >&2
    exit 1
  fi
  sleep 1
done
echo "Not ready after 120s; see $STATE/server.log" >&2
exit 1
