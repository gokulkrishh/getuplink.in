#!/usr/bin/env bash
# Read-only: is the verification instance on this port ours, up, and in demo mode?
# Usage: doctor.sh [port]   (default 3210). Exit 0 only when every check passes.
set -uo pipefail

PORT="${1:-3210}"
STATE="${UPLINK_VERIFY_STATE:-${TMPDIR:-/tmp}/uplink-verify-$PORT}"
ok=1
say() { printf '%-8s %s\n' "$1" "$2"; }

if [ -f "$STATE/server.pid" ] && kill -0 "$(cat "$STATE/server.pid")" 2>/dev/null; then
  say ok "process $(cat "$STATE/server.pid") is running"
else
  say FAIL "no running server started by launch.sh (state: $STATE)"; ok=0
fi

listener="$(lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P -t 2>/dev/null | head -1)"
if [ -n "$listener" ] && [ -f "$STATE/server.pid" ] && pgrep -P "$(cat "$STATE/server.pid")" >/dev/null 2>&1 || [ "$listener" = "$(cat "$STATE/server.pid" 2>/dev/null)" ]; then
  say ok "port $PORT is served by our process tree"
elif [ -n "$listener" ]; then
  # bunx wraps next; the listener may be a grandchild. Accept it when its cwd is our copy.
  if lsof -a -p "$listener" -d cwd -Fn 2>/dev/null | grep -q "$STATE/app"; then
    say ok "port $PORT is served from $STATE/app"
  else
    say FAIL "port $PORT is served by pid $listener, not by this skill's copy"; ok=0
  fi
else
  say FAIL "nothing listens on port $PORT"; ok=0
fi

code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/")"
if [ "$code" = "200" ]; then say ok "GET / returned 200"; else say FAIL "GET / returned $code"; ok=0; fi

# Demo mode signs in by itself, so Settings renders instead of redirecting to the sign-in page.
settings="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/settings")"
if [ "$settings" = "200" ]; then say ok "signed in as the demo owner (/settings 200)"; else say FAIL "/settings returned $settings: not demo mode?"; ok=0; fi

[ "$ok" = 1 ] && echo "Healthy." || { echo "Not healthy: run cleanup.sh $PORT, then launch.sh $PORT."; exit 1; }
