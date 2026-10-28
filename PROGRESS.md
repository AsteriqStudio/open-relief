# Open Relief project state

Update this file when a task changes status. Keep implementation claims tied to the checks below. The current product is a local sandbox demo; it is not approved for public financial use.

## Implemented and verified

- [x] TypeScript monorepo, Zod contracts, PostgreSQL, Redis, MinIO, and encrypted creditor account numbers.
- [x] Recipient upload, mock OCR, Textract extraction adapter, eligibility review, duplicate detection, and admin triage.
- [x] Session-backed JWT authentication and role checks.
- [x] Mock checkout, Stripe **test-mode** PaymentIntent adapter, signed webhook handling, and local Method-style creditor payment simulator.
- [x] Expo donor, recipient, and admin flows; browser preview; Android and web exports.
- [x] Electric, water, gas, medical, and telecom categories in schemas, uploads, demo seeds, and donor filters. Category-mismatched mock OCR results cannot authorize a creditor payment.
- [x] Versioned sandbox recipient and donor acceptance, Terms and Privacy drafts, and non-deductible payment confirmation.
- [x] Fictional sponsorship pools, atomic match and fee-buffer reservations, signed Stripe test-mode settlement, failure release, and expiry reconciliation.

## Current request

- [x] Initialize this progress tracker.
- [x] Confirm telecom and all other requested categories across the sandbox.
- [x] Add sandbox brand and payment-policy disclosures to checkout, confirmation, and settings; verify the app.
- [x] Phase 10: Add sponsorship pool and allocation schema with nonnegative balance checks and category targeting.
- [x] Phase 10: Preserve the approved donor card-fee calculation; add 1:1 sponsor matching and a separate 15% retainer calculator.
- [x] Phase 10: Reserve pool balances atomically, settle combined creditor principal, and release failed or canceled allocations.
- [x] Phase 10: Reconcile expired mock intents and verify Stripe test-mode intent status before releasing or settling expired test reservations.
- [x] Phase 10: Show sponsor badge, match estimate, actual receipt split, and depleted-buffer warning in the mobile UI.
- [x] Phase 10: Complete final typecheck, tests, Android export, and web export.
- [x] Phase 10: Commit and push the verified release candidate to `feature/sandbox-mvp`.

## Verification record

- `pnpm typecheck` — passed after the Phase 10 implementation and receipt changes.
- `pnpm test` — 18 tests passed after the Phase 10 implementation and receipt changes.
- Android and web Expo exports — passed after the Phase 10 implementation and receipt changes.
- Browser check — telecom sponsor badge, $7.50 + $7.50 checkout, matched confirmation, and depleted-buffer guard passed on a phone-width viewport with no page errors.

## Boundaries and next gates

- The Phase 10 user authorization allows sandbox matching, separate 15% sponsor retainer calculation, and a fictional sponsor fee buffer. The approved card-fee formula still charges **$103.30** for a $100 gift with no tip when the donor covers the estimated $3.30 fee. If the donor does not cover processing, a sponsor buffer must reserve the $3.20 estimated fee or checkout is rejected with HTTP 422. The creditor always receives full donor principal plus any reserved sponsor match.
- The 15% B2B retainer is out of band: the sandbox calculates it but does not invoice, receive, or transfer it. Sponsor pools are fictional ledger entries; no sponsor funds are held and no float interest is earned.
- The test-mode expiry worker verifies provider status before releasing an expired test reservation. Actual Stripe test keys and native PaymentSheet have not been exercised in this environment; tests use signed fixtures. Live payment operations remain behind a separate financial approval gate.
- The demo has no executed agent-of-the-payee agreement and makes no money-transmitter exemption claim. Legal copy remains a draft for qualified review.
- Public deployment still needs independently verified creditor routing, payment-provider and legal arrangements, stronger authentication and fraud controls, delivered notifications, and a successful cloud environment publication.
