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

## Current request

- [x] Initialize this progress tracker.
- [x] Confirm telecom and all other requested categories across the sandbox.
- [x] Add sandbox brand and payment-policy disclosures to checkout, confirmation, and settings; verify the app.
- [ ] Design corporate sponsorship and matching pools. Financial approval required before changing fee allocation or implementing sponsor-funded settlement.
- [ ] Design zero-tip deficit funding. Financial approval required before changing the existing fee formula or reducing creditor payout.

## Verification record

- `pnpm typecheck` — passed after the current edits.
- `pnpm test` — 15 passed after the current edits.
- Android and web Expo exports — passed after the current edits.
- Browser check — mock checkout, confirmation disclosure, and settings legal modal passed on a phone-width viewport with no page errors.

## Boundaries and next gates

- The approved fee engine always assigns the requested bill amount to the creditor. With a $100 bill payment and no tip, covering the fee makes the total test charge **$103.30** with an estimated $3.30 fee; without coverage, the charge is **$100.00**, the estimated fee is $3.20, and the platform share is **negative $3.20**. No reserve funding or payout reduction is implemented.
- Sponsor matching, management fees, infrastructure buffers, and default tip or fee-allocation changes require the session's financial approval gate. A sponsor float earning treasury yield would require holding sponsor funds and conflicts with the current zero-cash design; it is outside this implementation.
- The demo has no executed agent-of-the-payee agreement and makes no money-transmitter exemption claim. Legal copy remains a draft for qualified review.
- Public deployment still needs independently verified creditor routing, payment-provider and legal arrangements, stronger authentication and fraud controls, delivered notifications, and a successful cloud environment publication.
