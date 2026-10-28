#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env.local ]]; then
  set -a
  source ./.env.local
  set +a
fi
pnpm --filter @open-relief/db migrate
pnpm --filter @open-relief/db seed
