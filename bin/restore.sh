#!/usr/bin/env bash
# Príncipe — restore the database from a bin/backup.sh dump.
#
#   ./bin/restore.sh backups/principe-YYYYMMDD-HHMMSS.sql.gz
#
# OVERWRITES the current database (the dump is --clean --if-exists, so it
# drops and recreates objects). Run on a running stack.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.runtime"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "usage: ./bin/restore.sh <backup.sql.gz>" >&2
  echo "available backups:" >&2
  ls -1 backups/*.sql.gz 2>/dev/null | sed 's/^/  /' >&2 || echo "  (none in ./backups)" >&2
  exit 1
fi
[ -f "$FILE" ] || { echo "[restore] not found: $FILE" >&2; exit 1; }

if ! docker compose --env-file "$ENV_FILE" ps db --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
  echo "[restore] ERROR: the 'db' service isn't running/healthy. Start the stack first." >&2
  exit 1
fi

echo "[restore] ⚠️  This OVERWRITES the current database with:"
echo "          $FILE"
printf "Continue? [y/N] "
read -r ans
case "$ans" in [yY]*) ;; *) echo "[restore] aborted."; exit 1 ;; esac

echo "[restore] restoring…"
gunzip -c "$FILE" | docker compose --env-file "$ENV_FILE" exec -T db \
  psql -v ON_ERROR_STOP=1 -U principe -d principe >/dev/null

echo "[restore] done. Restart the app if it was mid-session: docker compose --env-file $ENV_FILE restart web"
