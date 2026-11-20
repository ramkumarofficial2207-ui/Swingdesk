#!/usr/bin/env bash
# Copy the data the hosted app needs from the local database to a hosted one.
#
#   TARGET_DATABASE_URL='postgresql://...' bash scripts/seed-hosted-db.sh
#
# Run `npx prisma db push --skip-generate` against the target first so every
# table exists. Copies only tables that are EMPTY on the target (safe to re-run;
# never overwrites). Skips the 11 GB IntradayCandle table and ML tables, which
# the hosted app does not need. Requires PostgreSQL client tools (pg_dump, psql).
set -euo pipefail

PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
PG_DUMP="$PG_BIN/pg_dump"; PSQL="$PG_BIN/psql"
[ -x "$PG_DUMP" ] || [ -x "$PG_DUMP.exe" ] || { PG_DUMP=pg_dump; PSQL=psql; }

SOURCE="${SOURCE_DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')}"
TARGET="${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL to the hosted database URL}"
# libpq rejects Prisma's ?schema= parameter; both databases use the public schema.
SOURCE="${SOURCE%%\?*}"; TARGET="${TARGET%%\?*}"
[ "$SOURCE" != "$TARGET" ] || { echo "Source and target are the same database." >&2; exit 1; }

# Parents first (DailyCandle and CorporateAction reference MarketInstrument).
read -r -a TABLES <<< "${SEED_TABLES:-MarketInstrument DailyCandle CorporateAction FnoDaily ResultsEvent SetupEvidence GlobalMarketDaily AutoPaperTrade}"

count() { "$PSQL" "$1" -At -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) FROM public.\"$2\""; }

for table in "${TABLES[@]}"; do
    existing="$(count "$TARGET" "$table")"
    if [ "$existing" != "0" ]; then
        echo "[seed] $table: target already has $existing rows, skipped."
        continue
    fi
    echo "[seed] $table: copying…"
    "$PG_DUMP" "$SOURCE" --data-only --no-owner --no-privileges --table="public.\"$table\"" \
        | "$PSQL" "$TARGET" -q -v ON_ERROR_STOP=1 > /dev/null
    echo "[seed] $table: source $(count "$SOURCE" "$table") rows, target $(count "$TARGET" "$table") rows."
done
echo "[seed] Done."
