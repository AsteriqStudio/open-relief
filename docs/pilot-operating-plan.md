# Open Relief: service launch plan

This plan describes a possible commercial service. The current app is a fictional offline walkthrough and a connected US sandbox. It does not accept live money, settle a real creditor bill, or earn revenue.

## Operating model

1. A recipient submits an overdue bill and account details for identity, eligibility, duplicate, and creditor review. Only a verified creditor account becomes payable.
2. A donor chooses a bill and a principal amount. The displayed checkout must show the creditor principal, estimated processing cost, any sponsor match, any optional tip, and the donor total before authorization.
3. The creditor must receive the full promised principal. No cash, overpayment, or refundable credit may be directed to the recipient. A qualified lawyer and payment partners must approve the actual funds flow; a direct-to-creditor intention alone does not establish a money-transmitter exemption.
4. A signed sponsor agreement can fund a matching budget and a separate processing-fee buffer. The app must not treat an unfunded sponsor promise or database balance as money available for a live payment.
5. The platform can earn a separately contracted B2B service or campaign fee and optional, clearly disclosed donor tips. The current sandbox models a 15% sponsor retainer but has no sponsor billing or collections. Profit exists only after real processor, payout, dispute, support, fraud, tax, and operating costs are paid.

## Rule for an uncovered card fee

The current **US sandbox estimate** is 2.9% plus $0.30 per card payment. The existing code preserves creditor principal. For a $100 gift with no tip:

| Case | Donor total | Creditor principal | Estimated fee funding |
| --- | ---: | ---: | --- |
| Donor covers fee | $103.30 | $100.00 | Donor adds $3.30 (existing gross-up estimate) |
| Donor declines; sponsor buffer reserved | $100.00 | $100.00 | Sponsor buffer reserves $3.20 (existing estimate) |
| Donor declines; buffer unavailable | No checkout | No payment | API returns HTTP 422 |

The $0.10 difference comes from the estimated fee on the higher donor charge in the first case. Rates, refunds, chargebacks, international cards, and payouts can change real costs. Before any live launch, contracted rates and settlement statements must be reconciled against these estimates, and a separately funded reserve must handle variance and disputes. The operating plan does not change the sandbox fee formula or allocation rules.

If donors choose zero tips, the business must still be viable. A sponsor contract should specify the campaign budget, separate fee funding, the platform's service fee, invoice timing, minimum commitments, refund treatment, and who pays for disputes and fee variance. Sponsor match funds are restricted to creditor principal; the platform fee is a distinct commercial charge. No recipient fee is planned here.

## Geography

The country of the **recipient's creditor** determines the bill-pay rail, account verification, currency, and local obligations. Donor country is a separate payment acceptance and compliance question.

| Market | Current state | What must exist before a real pilot |
| --- | --- | --- |
| United States | Connected USD sandbox with US ZIP input and allowlisted fictional creditors | Signed payment/creditor arrangements, approved funds flow, funded sponsor or donor fee coverage, US-specific legal and security review |
| Germany | Fictional EUR/SEPA screen concept only | EUR pricing, creditor-reference rail, creditor verification, local consumer/privacy review, licensed payment partner |
| United Kingdom | No country-specific flow | GBP pricing, creditor rail and verification, local consumer/privacy review, licensed payment partner |
| Other countries | No country-specific flow | The same country-specific proof, starting with one reliable creditor category |

Expansion is **not** capped at the US, UK, or Germany. Enable countries one at a time only after a verified creditor and payment partner can settle a bill there. Prioritize a market using urgent demand, credible creditor coverage, sponsor interest, legal feasibility, support language, fraud controls, and total transaction cost. Cross-border donors can be considered after the recipient-country rail works, because FX, card acceptance, sanctions, and refunds add more dependencies.

## First commercial pilot: required evidence

The first pilot should be a narrow, approved market with one or two creditor categories, a small set of verified creditors, and a sponsor that signs both a campaign budget and a separate fee-funding commitment. The US is the current **technical** candidate because its connected sandbox exists; that is not a legal or commercial launch decision.

- **Legal and payments:** Qualified local counsel reviews the exact funds flow, business entity, money-transmission exposure, consumer disclosures, charitable/tax statements, privacy, and sponsor contract. Payment and bill-pay partners confirm the intended creditor routing in writing.
- **Funding and reconciliation:** Confirm real sponsor funding and enforce a ledger of available, reserved, spent, refunded, and disputed amounts. Reconcile provider settlement and creditor confirmation daily. Stop new uncovered checkouts when funding or reconciliation is uncertain.
- **Creditor operations:** Verify merchant identity, account ownership, bill amount, duplicate/overpayment controls, and receipt of settlement. Define what happens when a creditor rejects or reverses a payment.
- **Trust and support:** Strengthen recipient identity checks, admin authentication, abuse throttling, document access, audit retention, account recovery, refund/dispute procedures, and delivered notifications. Establish staffed support and escalation.
- **Financial proof:** Measure approved bills, completed payments, fee coverage rate, sponsor utilization, disputed payments, support cost, creditor success rate, net revenue, and contribution margin. Optional tips should be reported separately from contracted revenue.
- **Technology:** Deploy the API and worker with managed secrets, backups, monitoring, incident response, and a production build. Validate the complete flow on real devices and with sandbox provider accounts before seeking live approval.

The go/no-go decision requires documentary evidence for each item. The existing GitHub APK and database seed do not satisfy these gates. Live charges, disbursements, production credentials, or changes to fee and tip allocation require the project's financial approval gate before code or configuration changes.
