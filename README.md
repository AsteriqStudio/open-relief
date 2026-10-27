# open-relief

A local, zero-cash **demo** for direct-to-creditor mutual aid. Recipients submit overdue bills, the mock OCR worker verifies demo billers, and donors simulate a payment that settles against the biller account. No live charge, payout, or recipient cash transfer is implemented.

## Run locally

Use Node.js 22 or newer, pnpm 11.25, and Docker Compose.

```bash
export XDG_DATA_HOME="$PWD/.local/share"
pnpm install --frozen-lockfile --store-dir "$PWD/.pnpm-store"
bash scripts/start-local.sh
```

The startup script creates an ignored `.env.local` with random local credentials if needed, starts PostgreSQL, Redis, and MinIO, applies migrations, seeds five demo bills, builds the server packages, and runs the API and OCR worker. It preserves an existing `.env.local`. Stop the foreground script to stop the API and worker; use `docker compose --env-file .env.local down` to stop local services. Data volumes remain until explicitly removed.

The API listens on `http://127.0.0.1:3000`. A successful `GET /health` returns `{"status":"ok"}`. `GET /api/bills/feed` lists the verified demo bills.

In another terminal, run the Expo app:

```bash
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 pnpm --filter @open-relief/mobile start
```

Set `EXPO_PUBLIC_API_URL` to the API address reachable by your simulator or device. Android emulators usually use `http://10.0.2.2:3000`; iOS simulators can use `http://127.0.0.1:3000`. A physical device needs the host machine's LAN address and an API bind address that permits it.

## Validate

With the local services running and `.env.local` loaded into the shell:

```bash
set -a
source ./.env.local
set +a
pnpm typecheck
pnpm test
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 pnpm --filter @open-relief/mobile export
```

The end-to-end test uploads a JPEG through the presigned form, checks EXIF removal, waits for mock OCR, rejects a duplicate, creates a mock donation, verifies the webhook signature and replay handling, and confirms the bill is settled. It creates uniquely identified demo data on each run.

## Boundaries

- The mock Stripe and Method adapters never charge or disburse real funds. The mobile checkout simulates payment; wallet and card SDK checkout is not active.
- The mock OCR adapter recognizes only a demo biller. Textract extraction can produce a bill for manual review, but it cannot approve a live creditor or route money.
- The API has demo identities and no user authentication. It is bound to loopback for local development and must not be exposed publicly.
- Payment confirmations make no tax-deductibility claim. Direct bill payments are not automatically charitable contributions.
- A future live design needs verified creditor routing, payment-provider coordination, authentication, privacy and fraud controls, and legal review. A Stripe charge followed by a separate disbursement does not alone establish that the platform avoids custody or money-transmission obligations.
