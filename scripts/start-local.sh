#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --experimental-strip-types scripts/init-local-env.ts
docker compose --env-file .env.local up -d --wait
set -a
source ./.env.local
set +a
pnpm --filter @open-relief/db migrate
pnpm --filter @open-relief/db seed
pnpm --filter @open-relief/db backfill-fingerprints
pnpm build
node apps/api/dist/server.js &
api_pid=$!
node apps/api/dist/worker.js &
worker_pid=$!
cleanup() {
  kill "$api_pid" "$worker_pid" 2>/dev/null || true
  wait "$api_pid" "$worker_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait -n "$api_pid" "$worker_pid"
