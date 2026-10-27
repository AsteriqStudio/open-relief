# open-relief

A local, zero-cash **demo** for direct-to-creditor mutual aid. Recipients submit overdue bills, the mock OCR worker verifies demo billers, and donors simulate a payment that settles against the biller account. Optional Stripe test mode uses test cards and a simulated Method sandbox payment. No live charge, payout, or recipient cash transfer is implemented.

## Run locally

Use Node.js 22 or newer, pnpm 11.25, and Docker Compose.

```bash
export XDG_DATA_HOME="$PWD/.local/share"
pnpm install --frozen-lockfile --store-dir "$PWD/.pnpm-store"
bash scripts/start-local.sh
```

The startup script creates an ignored `.env.local` with random local credentials if needed, starts PostgreSQL, Redis, and MinIO, applies migrations, seeds five demo bills, builds the server packages, and runs the API and OCR worker. It preserves an existing `.env.local`. Stop the foreground script to stop the API and worker; use `docker compose --env-file .env.local down` to stop local services. Data volumes remain until explicitly removed.

The API listens on `http://127.0.0.1:3000`. A successful `GET /health` returns `{"status":"ok"}`. `GET /api/bills/feed` lists the verified demo bills. Create a recipient or donor account in the mobile app to upload bills or simulate donations. Seeded demo users cannot sign in because they have no passwords.

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

The end-to-end test uploads a JPEG through the presigned form, checks EXIF removal, waits for mock OCR, rejects a duplicate, creates a mock donation, verifies the webhook signature and replay handling, and confirms the bill is settled. Adapter tests exercise signed Stripe test webhook fixtures, partial and full settlement, fee splits, and Method sandbox routing without external credentials. Tests create uniquely identified demo data on each run.

## Stripe test checkout and Method simulation

Mock mode remains the default. To enable Stripe test PaymentIntents, set `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...` in the API environment. Set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` when bundling the mobile app. Only test keys are accepted. Route Stripe test webhooks to `POST /api/webhooks/stripe` using Stripe's test webhook signing secret. A native Expo development build is required for PaymentSheet; Expo Go does not contain the Stripe native module. The local demo completion endpoint accepts mock intents only.

The backend computes the existing fee split before creating a test intent. Webhooks validate Stripe's signature, payment amount, currency, and donation metadata. A successful event sends a deterministic simulated payment to an allowlisted demo creditor, records the Stripe charge and Method style `pmt_...` reference, and updates the bill in one database transaction. `METHOD_PROVIDER=sandbox` enables the same local Method sandbox simulator in mock Stripe mode. It models `https://dev.methodfi.com/v1` but makes no outbound Method API call or funds transfer. The receipt email payload is stored with the transaction; no email is sent.

## Authentication and OCR modes

`POST /api/auth/signup` accepts an email, password of at least 12 characters, phone, and `recipient` or `donor` role. `POST /api/auth/signin` returns a signed JWT session token; clients send it as `Authorization: Bearer <token>`. The server stores only a hash of the token's random session ID for revocation and enforces roles and ownership on bill uploads, donations, and receipts. The mobile app stores the token with Expo SecureStore and supports sign out.

The OCR worker defaults to `OCR_PROVIDER=mock`. Set `OCR_PROVIDER=textract` and `AWS_REGION` when AWS credentials are available through the standard SDK credential chain. The Textract adapter calls `AnalyzeDocument` with account number, amount, due date, and biller name queries. Its extracted bill remains pending manual review until a creditor routing ID is independently verified; extraction alone never authorizes payment.

## Boundaries

- Stripe test mode can present PaymentSheet with test cards, but no real funds move. The Method adapter is a local sandbox simulation and cannot disburse money.
- The mock OCR adapter recognizes only a demo biller. Textract extraction can produce a bill for manual review, but it cannot approve a live creditor or route money.
- Authentication uses local password accounts and revocable database sessions. Email verification, password recovery, abuse throttling, and a protected admin review workflow are still required before public deployment. The API remains bound to loopback.
- Payment confirmations make no tax-deductibility claim. Direct bill payments are not automatically charitable contributions, and the project has no verified 501(c)(3) status. The generated email payload is a payment confirmation, not a charitable tax receipt.
- A future live design needs verified creditor routing, payment-provider coordination, authentication, privacy and fraud controls, and legal review. A Stripe charge followed by a separate disbursement does not alone establish that the platform avoids custody or money-transmission obligations.
