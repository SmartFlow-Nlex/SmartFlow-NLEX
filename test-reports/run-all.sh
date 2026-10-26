#!/usr/bin/env bash
# Runs every suite for SmartFlow_Test_Cases.xlsx and keeps the full output.
#   Back-End/tests/unit             TC-UT (backend modules, SQL rules on literal VALUES)
#   Front-End-Dashboard/tests/unit  TC-UT (dashboard modules and page logic)
#   smartflow_scripts/tests/unit    TC-UT (Python analytics)
#   Back-End/tests/integration      TC-IT (read-only database connection)
# Every Postgres session starts with default_transaction_read_only=on, so the
# database refuses any write; tests/integration/readonly-db.ts also checks it.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/test-reports"
export PGOPTIONS="-c default_transaction_read_only=on"
TSX="$ROOT/Back-End/node_modules/.bin/tsx"
stamp() { date "+%Y-%m-%d %H:%M:%S %z"; }

{
  echo "# Back-End unit tests — $(stamp)"
  cd "$ROOT/Back-End" && "$TSX" --test --test-concurrency=1 tests/unit/*.test.ts
} > "$OUT/unit-backend.log" 2>&1

{
  echo "# Front-End-Dashboard unit tests — $(stamp)"
  cd "$ROOT/Front-End-Dashboard" && "$TSX" --test tests/unit/*.test.ts
} > "$OUT/unit-frontend.log" 2>&1

{
  echo "# smartflow_scripts unit tests — $(stamp)"
  cd "$ROOT/smartflow_scripts/tests/unit" && python -m unittest discover -p "test_*.py" -v
} > "$OUT/unit-python.log" 2>&1

{
  echo "# Integration tests (read-only database) — $(stamp)"
  cd "$ROOT/Back-End" && "$TSX" --test --test-concurrency=1 tests/integration/*.it.test.ts
} > "$OUT/integration.log" 2>&1

grep -hE "^ℹ (tests|pass|fail|skipped)|^(Ran|OK|FAILED)" "$OUT"/unit-backend.log "$OUT"/unit-frontend.log "$OUT"/unit-python.log "$OUT"/integration.log
