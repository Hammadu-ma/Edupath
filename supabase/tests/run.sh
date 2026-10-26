#!/usr/bin/env bash
# Runs the DB test-suite against a THROWAWAY local Postgres (never a real Supabase project).
# Usage: PGUSER=postgres ./supabase/tests/run.sh   (requires psql + a local Postgres)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-edupath_test}
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/00_stub_supabase.sql >/dev/null
# BASELINE=live replays the hosted project's original schema instead of migrations/*001*.
if [ "${BASELINE:-repo}" = "live" ]; then psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/live_baseline.sql >/dev/null; FILES=$(ls migrations/*.sql | grep -v initial_foundation); else FILES=$(ls migrations/*.sql); fi
for f in $FILES; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; exit 1; }; done
psql -q -d "$DB" -f tests/10_rls_and_workflows.sql 2>&1 | grep -E "NOTICE:  (PASS)|ERROR|FAIL|ALL DATABASE" | sed -E 's/^psql:[^ ]+ NOTICE:  //'
