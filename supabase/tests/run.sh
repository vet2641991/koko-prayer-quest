#!/usr/bin/env bash
# Applies the Supabase stub, every migration and every test to an EMPTY Postgres database, failing on the first error.
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/koko_test supabase/tests/run.sh
# Never point this at the real project: the stub creates roles and an auth schema of its own.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?set DATABASE_URL to an empty throwaway database}"
case "$DATABASE_URL" in *supabase.co*|*supabase.com*) echo "refusing to run against a Supabase host" >&2; exit 1;; esac

psql() { command psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

psql -f supabase/tests/support/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate: $f"
  psql --single-transaction -f "$f"
done
for f in supabase/tests/[0-9]*.sql; do
  echo "test:    $f"
  psql -f "$f" 2>&1 | sed -n 's/^.*NOTICE:  //p; /passed/p; /ERROR\|FAIL/p'
  test "${PIPESTATUS[0]}" -eq 0
done
