#!/bin/bash
# Principe web container entrypoint.
# Runs Prisma migrations against the configured DATABASE_URL, then
# hands off to `next start`.

set -euo pipefail

cd /workspace

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "FATAL: DATABASE_URL is not set. Define it in your env (see .env.example)."
  exit 1
fi

echo "[entrypoint] Running Prisma migrations against ${DATABASE_URL%@*}@..."
cd /workspace/apps/principe
pnpm exec prisma migrate deploy
cd /workspace

echo "[entrypoint] Starting Next.js on port 3000..."
exec pnpm --filter principe start
