#!/bin/bash
# Príncipe — stop the running stack.
#
# Run this BEFORE pulling updates / rebuilding, so the web port is free and
# `bin/start.sh` can rebuild cleanly instead of hitting "port already in use".
# It stops and removes the containers but ALWAYS PRESERVES your data — the
# Postgres volume is kept (this script never passes `-v`, so nothing is wiped).
#
#   ./bin/stop.sh           Stop the stack; report if the web port is still held.
#   ./bin/stop.sh --force   Also kill any stray non-Docker server on the port
#                           (a node/next dev server — never the Docker/Colima
#                           port-forward).
#
# (Windows users: stop the stack from Docker Desktop, or `docker compose down`.)

set -uo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.runtime"
FORCE="${1:-}"

# Web port — mirrors docker-compose's ${WEB_PORT:-3000}; read from .env.runtime.
WEB_PORT=3000
if [[ -f "$ENV_FILE" ]]; then
  parsed="$(grep -E '^WEB_PORT=' "$ENV_FILE" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1 || true)"
  [[ -n "${parsed:-}" ]] && WEB_PORT="$parsed"
fi

# --- Stop the containers (data volume preserved; we never pass -v) ---
if docker info >/dev/null 2>&1; then
  echo "[stop] Stopping the Príncipe stack (your data is preserved)…"
  if [[ -f "$ENV_FILE" ]]; then
    docker compose --env-file "$ENV_FILE" down --remove-orphans \
      || echo "[stop] (compose down reported an issue — continuing to the port check.)"
  else
    docker compose down --remove-orphans 2>/dev/null || true
  fi
  echo "[stop] Containers stopped."
else
  echo "[stop] Docker engine isn't running — no containers to stop."
  echo "[stop] (Colima users: 'colima start' to boot the engine.)"
fi

# --- Is the web port STILL held? ---
# After `down`, Docker/Colima releases the port-forward (it can lag a second or
# two). A *node/next* listener means a server started OUTSIDE Docker is squatting
# the port — that's the usual "port already in use" culprit.
port_pids() { lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN -t 2>/dev/null || true; }

sleep 1
PIDS="$(port_pids)"
if [[ -z "${PIDS:-}" ]]; then
  echo "[stop] Port $WEB_PORT is free ✓  — pull your updates, then ./bin/start.sh"
  exit 0
fi

echo ""
echo "[stop] Port $WEB_PORT is still held:"
lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null || true

# Classify holders: stray app server (killable) vs Docker/Colima forwarder (leave it).
stray="" infra=""
for pid in $PIDS; do
  cmd="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
  case "$cmd" in
    *ssh*|*docker*|*colima*|*vpnkit*|*qemu*|*com.docker*) infra="$infra $pid" ;;
    *) stray="$stray $pid" ;;  # node/next/pnpm/unknown → treat as a stray server
  esac
done

[[ -n "${infra// /}" ]] && \
  echo "[stop] → That's the Docker/Colima port-forward still releasing — give it a few seconds and re-run; don't kill it."

if [[ -n "${stray// /}" ]]; then
  echo "[stop] → A non-Docker server is squatting the port (PID(s):${stray} )."
  if [[ "$FORCE" == "--force" ]]; then
    echo "[stop] --force: stopping${stray} …"
    # shellcheck disable=SC2086
    kill ${stray} 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -9 ${stray} 2>/dev/null || true
    echo "[stop] Port $WEB_PORT freed ✓"
  else
    echo "[stop]   Free it with: kill${stray}     (or re-run: ./bin/stop.sh --force)"
  fi
fi
