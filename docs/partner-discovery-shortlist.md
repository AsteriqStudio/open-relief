# First-pilot partner discovery shortlist

This is a research and outreach shortlist, not a list of signed partners or an assertion that any provider supports Open Relief’s exact model. Confirm current product coverage, commercial terms, country availability, and legal requirements directly with each organization before making a commitment.

The recommended first market remains a narrow US pilot because the connected sandbox, USD presentation, and initial operating plan are US-focused. Start with one city and one utility category before adding medical, telecom, or another country.

## 1. Direct-to-creditor payment and biller-routing candidates

| Candidate | Why investigate | Required answer before technical work | Public starting point |
| --- | --- | --- | --- |
| Method Financial | The original sandbox architecture names Method as a possible financial-data and payment integration candidate. | Can it validate a real utility or hospital merchant, initiate payment to that creditor, preserve the bill-account reference, return settlement confirmation, and support a compliant agent-of-the-payee structure? | [Method Financial](https://methodfi.com/) |
| BillGO | Potential bill-pay network candidate for creditor routing. | Does it offer programmatic, direct creditor payment for the selected utility category, including account-reference validation, reversals, duplicate controls, and reconciliation exports? | [BillGO](https://www.billgo.com/) |
| PayNearMe | Potential enterprise bill-payment operator to assess for utility and consumer bill workflows. | Does it support a sponsor-funded or donor-funded program where payment lands only with an approved creditor, never the recipient? | [PayNearMe](https://www.paynearme.com/) |
| doxo | Consumer bill-pay network and directory candidate to assess for creditor coverage. | Is there an enterprise/API arrangement for a program operator, and can it provide verified settlement status for a specific bill account? | [doxo](https://www.doxo.com/) |
| Stripe | A card acceptance candidate only. Stripe does not, by itself, prove direct creditor settlement or resolve the legal funds-flow analysis. | Which approved connected creditor-pay rail will receive the funds, who is merchant of record, and how do refunds/chargebacks affect an already-paid bill? | [Stripe](https://stripe.com/) |

Do not assume that a payment API, account-linking API, or consumer bill-pay product is usable for this model. The written answer must cover the actual creditor payment, account reference, payment confirmation, disputes, refunds, and the provider’s view of the proposed funds flow.

## 2. Pilot operators, referrals, and verification partners

| Partner type | Role in a narrow pilot | First question |
| --- | --- | --- |
| One utility’s affordability or customer-assistance team | Confirms eligible overdue-account format, shutoff urgency, account-reference rules, and settlement receipt. | Can you support a small synthetic-data workflow review, then a controlled live pilot after approvals? |
| Local Community Action Agency or 211 network | Referrals, demand validation, and safer eligibility design. This is not a payment rail. | Which bill categories and eligibility failures create the most urgent unmet need in this city? |
| Hospital financial-assistance or community-benefit team | Later medical-bill pilot partner; validates privacy and account rules. | What proof and payment-reference requirements apply before an outside program can pay an overdue account? |
| Utility affordability platform | Workflow or integration discovery partner; may be a vendor, collaborator, or competitor depending on scope. | Can a direct-to-creditor third-party assistance program integrate without exposing recipient data or duplicating existing aid? |

One public utility-affordability workflow lead is [Promise](https://www.promise-pay.com/). Treat it as a discovery conversation only; do not imply an affiliation.

## 3. Fee funding and commercial sponsor targets

The app must never reduce creditor principal to absorb card costs. A first sponsor must separately fund processing-fee coverage, support, fraud, dispute variance, and the agreed commercial service fee. Donor tips are optional and cannot be the business plan.

Prioritize these sponsor profiles in the selected city:

1. The selected utility’s foundation, affordability program, or community-benefit budget.
2. A local community foundation or United Way that already funds emergency utility assistance.
3. Employers with a local financial-wellbeing or hardship-assistance budget.
4. Health-system community-benefit teams for a later medical category pilot.
5. A mission-aligned financial institution or insurer only after legal review of sponsorship, marketing, and privacy terms.

For every sponsor discovery call, ask for a written answer to these items:

- Monthly principal budget, matching policy, and which bill categories are allowed.
- Separate processing-fee and dispute reserve; no unfunded “buffer” promises.
- Commercial service-fee structure, invoice timing, reporting, and termination terms.
- Who owns recipient support, appeals, refund requests, and dispute costs.
- Data-sharing, retention, publicity, and outcome-reporting boundaries.

## 4. Free first actions

- Use the RC7 APK and private synthetic-data sandbox to demonstrate the recipient-to-review-to-creditor workflow.
- Send the [pilot partner brief](pilot-partner-brief.md) only after replacing its placeholder contact details with the project owner’s real details.
- Ask for a 30-minute discovery conversation. Do not request live credentials, bank details, or a financial commitment in the first contact.
- Record each response in a partner scorecard: creditor coverage, settlement confirmation, legal fit, fee funding, integration effort, support ownership, and time to pilot.

## 5. Decision rule

The first real pilot can advance only when one creditor/bill-pay route, one funded sponsor, and qualified counsel all approve the same narrow funds flow in writing. Then, and only then, request approval to configure live payment services. Until that point, the sandbox remains mock-only and no money reaches recipients or creditors.
