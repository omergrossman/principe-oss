#!/bin/bash
# Principe — one-command boot.
#
# Generates required secrets on first run (idempotent: subsequent runs
# reuse the existing .env.runtime), then `docker compose up -d`s the
# stack. Use this instead of `docker compose up` directly so you don't
# have to remember to set the secret env vars yourself.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.runtime"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[start] First boot detected — generating .env.runtime with fresh secrets..."

  # 32-byte random hex strings. openssl is in coreutils on every platform
  # docker supports; if you're missing it, install openssl first.
  STATISTICIAN_SHARED_SECRET=$(openssl rand -hex 32)
  PRINCIPE_ENCRYPTION_KEY=$(openssl rand -hex 32)

  cat > "$ENV_FILE" <<EOF
# Principe runtime secrets — generated $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Do NOT commit this file. Rotate by deleting it and re-running bin/start.sh.
STATISTICIAN_SHARED_SECRET=${STATISTICIAN_SHARED_SECRET}
PRINCIPE_ENCRYPTION_KEY=${PRINCIPE_ENCRYPTION_KEY}
POSTGRES_PASSWORD=principe
WEB_PORT=3000
WEBAUTHN_ORIGIN=http://localhost:3000
EOF
  chmod 600 "$ENV_FILE"
  echo "[start] Secrets written to $ENV_FILE (chmod 600)."
else
  echo "[start] Reusing existing $ENV_FILE."
fi

echo "[start] Booting docker compose..."

# Stage the boot: bring Postgres up and wait for it to be healthy BEFORE
# the rest. On a fresh volume, initdb can take 60-90s (slower under
# qemu-backed Docker on macOS). If we boot everything at once, web's
# `depends_on: db service_healthy` races that initdb and compose aborts
# web with "dependency db is unhealthy" — even though db recovers seconds
# later. Bringing db up first makes the one-command boot deterministic.
echo "[start] Starting Postgres and waiting for it to accept connections..."
docker compose --env-file "$ENV_FILE" up -d --build db

DB_WAIT_TIMEOUT=180
elapsed=0
until [[ "$(docker compose --env-file "$ENV_FILE" ps db --format '{{.Health}}' 2>/dev/null)" == "healthy" ]]; do
  if (( elapsed >= DB_WAIT_TIMEOUT )); then
    echo "[start] ERROR: Postgres did not become healthy within ${DB_WAIT_TIMEOUT}s." >&2
    echo "[start] Check: docker compose --env-file $ENV_FILE logs db" >&2
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
echo "[start] Postgres healthy after ~${elapsed}s. Booting statistician + web..."

docker compose --env-file "$ENV_FILE" up -d --build

echo ""
echo "[start] Stack starting. Watch progress with:"
echo "        docker compose logs -f web statistician"
echo ""
echo "[start] When healthy, open http://localhost:${WEB_PORT:-3000}"
echo "        and complete the first-run setup wizard."
