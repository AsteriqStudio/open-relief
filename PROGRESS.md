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
- [x] Phase 11: Add USD/EUR display, four isolated fictional pitch cards, offline checkout simulation, seed migration, and co-founder walkthrough.
- [x] Phase 11: Add reproducible release APK build script and GitHub Actions artifact/prerelease workflow.
- [x] Phase 11: Build, publish, download, and verify the standalone Android APK and SHA-256 checksum. Release candidate: `phase11-demo-rc1`.
- [x] Release Candidate: Phase 11 offline pitch APK and walkthrough published to GitHub; installable package and checksum verified.
- [x] Redesign the mobile sandbox and offline pitch flows with a consistent obsidian/emerald system across authentication, donor deck, checkout, receipt, recipient intake, admin review, profile, and legal screens.
- [x] Replace illustrative profile impact figures with authenticated totals from completed sandbox donations. Keep fictional pitch creditors, payment status, legal status, and retention language explicit.
- [x] RC3 offline APK: expose four navigable phone tabs for giving, fictional recipient intake, simulated review, and a local activity/legal dashboard. Link sample review decisions to the donor deck and simulated gifts to balances and profile activity.
- [x] Expand fictional pitch cards to all five supported bill categories while preserving the two EUR concept cards and sandbox fee calculation.
- [x] Make connected bill intake explicitly US-only, persist its country, and block non-US bills from the US feed, review approval, and checkout. Show current market states in the offline Profile tab.
- [x] Write a concrete pilot operating plan for fee funding, B2B revenue, market expansion, and launch evidence without changing the approved sandbox fee formula.
- [x] Prepare RC4 as a separate APK release so the updated market explanation does not overwrite RC3.

## Verification record

- `pnpm typecheck` — passed after the Phase 10 implementation and receipt changes.
- `pnpm test` — 18 tests passed after the Phase 10 implementation and receipt changes.
- Android and web Expo exports — passed after the Phase 10 implementation and receipt changes.
- Browser check — telecom sponsor badge, $7.50 + $7.50 checkout, matched confirmation, and depleted-buffer guard passed on a phone-width viewport with no page errors.
- Phase 11: `pnpm run typecheck` passed; `pnpm test` passed all 19 tests; `pnpm run seed` migrated and seeded two USD plus two EUR pitch cards in a separate presentation table.
- Phase 11 offline Android and web Expo bundles compiled. The Gradle `:app:createBundleReleaseJsAndAssets` task passed locally after adding the explicit Babel JSX plugin dependency.
- GitHub Actions run `40734730166` succeeded: APK build, artifact upload, and labeled prerelease publication. The downloaded `builds/open-relief-demo.apk` is 89,864,917 bytes, has SHA-256 `68950b06e7d7081813c67cd4e9b777045e723625dd6c930c330d0073b8fc1baf`, contains `assets/index.android.bundle`, and passes `apksigner verify` with the demo signing certificate. Package `org.openrelief.app`, minimum Android SDK 24.
- Obsidian/emerald redesign: `pnpm run typecheck` passed; `pnpm test` passed all 19 tests with `.env.local` loaded; Android and web Expo exports compiled. A new integration assertion checks authenticated donor impact totals.
- GitHub Actions run `40746601104` succeeded and published `phase11-demo-rc2`. The downloaded RC2 APK is 89,873,289 bytes, SHA-256 `91ccb7e11b427e2819fae8972a332f4a8e6712a99a8d68ba816bbf2998f3914f`, includes `assets/index.android.bundle`, and passes `apksigner verify`. Package `org.openrelief.app`, version code 2, minimum Android SDK 24.
- RC3 offline flow: `pnpm run typecheck` passed; `pnpm test` passed all 22 tests with `.env.local` loaded; Android and web Expo exports compiled. Three new mobile model tests cover category breadth, sample review state, and gift-record constraints.
- Market readiness update: migration `0009` applied locally; `pnpm run typecheck` passed; `pnpm test` passed all 22 tests with `.env.local` loaded; Android Expo export compiled. The end-to-end test checks that DE, GB, and FR intake is refused and that a foreign-coded bill is hidden from the US feed, refused by checkout, and cannot replay an existing intent.
- GitHub Actions run `40757061612` succeeded and published `phase11-demo-rc3`. The downloaded APK is 89,895,969 bytes, SHA-256 `d3d525ef5d82118989f5ab3d97d202a8185a120ef282b494d9e600e602481ad7`, passes `apksigner verify`, reports package `org.openrelief.app` version 0.3.0 (code 3), and contains `assets/index.android.bundle` with all four walkthrough screen labels. Its signing certificate fingerprint matches RC2; physical-device installation is untested here.

## Boundaries and next gates

- The Phase 10 user authorization allows sandbox matching, separate 15% sponsor retainer calculation, and a fictional sponsor fee buffer. The approved card-fee formula still charges **$103.30** for a $100 gift with no tip when the donor covers the estimated $3.30 fee. If the donor does not cover processing, a sponsor buffer must reserve the $3.20 estimated fee or checkout is rejected with HTTP 422. The creditor always receives full donor principal plus any reserved sponsor match.
- The 15% B2B retainer is out of band: the sandbox calculates it but does not invoice, receive, or transfer it. Sponsor pools are fictional ledger entries; no sponsor funds are held and no float interest is earned.
- The test-mode expiry worker verifies provider status before releasing an expired test reservation. Actual Stripe test keys and native PaymentSheet have not been exercised in this environment; tests use signed fixtures. Live payment operations remain behind a separate financial approval gate.
- The demo has no executed agent-of-the-payee agreement and makes no money-transmitter exemption claim. Legal copy remains a draft for qualified review.
- Public deployment still needs independently verified creditor routing, payment-provider and legal arrangements, stronger authentication and fraud controls, delivered notifications, and a successful cloud environment publication.
- The Phase 11 APK is an offline fictional payment simulation. No Android device or emulator was attached here, so on-device launch and gesture checks remain to be done by a human tester. The local workspace could not download React Native AARs through its proxy; the GitHub Actions native build succeeded. The APK uses a demo debug signing certificate and is not a Play Store release.
- RC2 uses Android version code 2 and a new prerelease tag. Its APK signing certificate fingerprint matches RC1 in this build, so Android should allow an in-place update; installation on a physical device remains untested here.
- RC4 source is pushed on `feature/sandbox-mvp` with version code 4 and a separate prerelease tag configured. Local native APK assembly is blocked by HTTP 403 while Gradle downloads the React Native Android AARs; Android Expo bundle compilation passed. The GitHub Actions/release API is also inaccessible from this environment, so the RC4 APK publication must be checked independently before announcing it as available.
