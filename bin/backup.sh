#!/usr/bin/env bash
# Príncipe — database backup  ·  macOS & Linux
#
# Dumps the Postgres database to a timestamped, gzipped SQL file under
# ./backups/. Safe to run on a live stack. Restore with bin/restore.sh.
#
#   ./bin/backup.sh
#
# Tip: schedule it (cron / launchd) for regular snapshots, e.g. nightly:
#   0 3 * * *  cd /path/to/principe-oss && ./bin/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.runtime"
OUT_DIR="backups"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/principe-${STAMP}.sql.gz"

if ! docker compose --env-file "$ENV_FILE" ps db --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
  echo "[backup] ERROR: the 'db' service isn't running/healthy. Start the stack first (./bin/start.sh)." >&2
  exit 1
fi

echo "[backup] dumping database → $OUT"
# --clean --if-exists makes the dump self-contained: restoring drops and
# recreates objects, so a restore onto an existing DB is idempotent.
docker compose --env-file "$ENV_FILE" exec -T db \
  pg_dump -U principe --clean --if-exists principe | gzip > "$OUT"

echo "[backup] done — $(du -h "$OUT" | cut -f1) at $OUT"
echo "[backup] restore with:  ./bin/restore.sh $OUT"
