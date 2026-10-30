# Public launch readiness

**Decision: blocked.** Open Relief is an offline fictional walkthrough and a connected US sandbox. It does not take live donations or settle real creditor bills. Do not invite recipients to submit real documents or donors to pay until the evidence below exists and a release candidate passes a separate launch review.

| Gate | Current evidence | Required before public intake or payments |
| --- | --- | --- |
| Funds flow and legal status | Stripe test adapter and local Method-style simulator; no executed agent-of-the-payee or creditor agreement | Qualified counsel and both payment partners approve the exact charge, settlement, refund, and dispute path in the first market. Confirm any licensing obligations in writing. |
| Creditor settlement | Only allowlisted fictional US merchants have routing IDs. No live payout adapter exists. | Independently verify real creditors, bill accounts, payment references, and receipt of settlement. Test failed, reversed, duplicate, and overpaid bills. Recipient cash-out must remain impossible. |
| Fee funding and profit | The approved sandbox fee formula preserves creditor principal; a fictional sponsor buffer can cover fees. The 15% B2B retainer is calculated but never billed. | Sign a sponsor contract with a separately funded fee buffer and commercial service fee, or establish another funded source for every uncovered fee. Reconcile fees, disputes, and refunds before estimating profit. No change to the default fee allocation is authorized. |
| Identity, privacy, and review | Password accounts, revocable sessions, throttling, OCR, duplicate checks, and admin triage exist. Names and assistance-program claims are self-reported; some bills enter the demo feed automatically. | Add verified contact details, account recovery, stronger admin enrollment, identity/household checks, manual review of recipient stories for personal data, documented retention and deletion, delivered notices, and a staffed dispute/support process. Have counsel approve final terms and privacy notices. |
| Infrastructure | Local PostgreSQL, Redis, MinIO, API, and worker work. `/ready` checks dependencies and worker presence. No stable public HTTPS service exists. | Deploy isolated managed services, TLS, secret rotation, backups with restore drills, monitoring, audit retention, incident response, and a domain. Verify the full app and document path from a physical phone. |
| Markets | Connected US sandbox; German EUR cards are fictional; UK has no flow. | Approve one narrow first market with a working creditor rail, local disclosures, fees, support, and legal review. Repeat that evidence before adding another country. |
| Distribution and provider tests | Android prerelease is debug signed and sideloaded. Stripe test PaymentSheet uses fixtures in automated tests; real test keys and native devices have not been exercised. | Run test-card and provider-sandbox payments on physical Android and iOS devices, review accessibility, ship a production-signed build, and complete store review. |

## What can start now

- Show the **fictional offline demo** to prospective partners, with its demo label visible.
- Run a **private, nonfinancial sandbox trial** using test accounts and synthetic bills on an HTTPS test API. The connected app can upload documents through that API, avoiding a separate public object-store endpoint.
- Recruit creditors, payment partners, sponsors, legal counsel, and pilot operators to collect the evidence above. Describe the product as a proposed service, not as an active relief program.

## Launch decision

The first public release needs an owner, date, and documentary evidence for every gate. The financial approval rule must be applied **before** any live Stripe charge, live Method disbursement, production banking credentials, or change to the approved fee and tip allocation. The current code and APK do not satisfy those gates.
