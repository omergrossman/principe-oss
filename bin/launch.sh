#!/usr/bin/env bash
# Príncipe desktop launcher  ·  macOS & Linux  (Windows: see launch.cmd)
# Ensure the stack is up, then open the app in the browser. This is what the
# desktop icon (created by the installer) invokes.
cd "$(dirname "$0")/.." || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

PORT="$(grep -E '^WEB_PORT=' .env.runtime 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

# Best-effort: bring Docker + the stack up so a click "just works" even if the
# machine rebooted and containers aren't running yet.
if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    [ "$(uname -s)" = "Darwin" ] && open -a Docker >/dev/null 2>&1 || true
    # give the daemon a moment to come up
    for _ in 1 2 3 4 5 6 7 8 9 10; do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
  docker compose --env-file .env.runtime up -d >/dev/null 2>&1 || true
fi

case "$(uname -s)" in
  Darwin) open "$URL" ;;
  Linux)  command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" || true ;;
esac
