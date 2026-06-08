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
  WIZARD_SECRET=$(openssl rand -hex 32)

  cat > "$ENV_FILE" <<EOF
# Principe runtime secrets — generated $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Do NOT commit this file. Rotate by deleting it and re-running bin/start.sh.
STATISTICIAN_SHARED_SECRET=${STATISTICIAN_SHARED_SECRET}
WIZARD_SECRET=${WIZARD_SECRET}
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
docker compose --env-file "$ENV_FILE" up -d --build

echo ""
echo "[start] Stack starting. Watch progress with:"
echo "        docker compose logs -f web statistician"
echo ""
echo "[start] When healthy, open http://localhost:${WEB_PORT:-3000}"
echo "        and complete the first-run setup wizard."
