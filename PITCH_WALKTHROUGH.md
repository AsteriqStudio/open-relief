# Open Relief: full-flow offline phone walkthrough

This walkthrough uses the **RC3 offline APK**. Its bottom navigation opens **Give**, **Need help**, **Review**, and **Profile**. Every account, household, sample submission, match pool, review decision, and payment confirmation in it is fictional. It makes no charge or transfer and needs no login or network. The connected US API sandbox is a separate workflow; the European cards illustrate a proposed interface only.

## Before handing over the phone

Install `builds/open-relief-demo.apk` on an Android phone with sideloading enabled. Launch **open-relief**. The opening badge should read **OFFLINE PITCH DEMO**, with four tabs at the bottom. Use **Profile → Reset walkthrough** if a previous session changed the sample data. The release build embeds its JavaScript bundle and fictional cards; it should open in airplane mode. No live Stripe or Method credentials are needed.

## Minute 1 — Explore the fictional bill deck

Open **Give**. The Detroit DTE Energy **demo** card shows a $142.50 past-due balance and a 48-hour shut-off story. Use the category chips to show electric, water, gas, medical, and telecom examples. Two German cards display EUR and a SEPA creditor-reference **concept**, with no EU transfer implemented. The sponsor chips are fictional 1:1 examples. Point to the **FICTIONAL PITCH CARD** label: a live donor feed would require document, account, and creditor verification.

## Minute 2 — Try recipient intake and review

Open **Need help**. The form is prefilled with fictional values; edit them, tick the sample-only consent, and tap **Submit sample for review**. No real bill should be entered: this APK does not upload documents or run OCR. Open **Review**, inspect the sample fields, add a decision note, and choose **Add fictional card to deck**. Return to **Give** to see the approved sample card. The review decision is local and does not verify a creditor.

## Minute 3 — Simulate a contribution

On **Give**, swipe right or tap **Relieve this bill**. A sponsor card opens at 50% so a fictional 1:1 match can cover the other half. Try 25%, 50%, or 100%; toggle estimated processing coverage; select 0%, 10%, 15%, or 20% optional tip. The split shows the donor principal, fictional match, illustrative creditor total, and donor total. Accept the notice and tap **Simulate creditor payment**. The confirmation shows the local balance drop. This in-memory action does not invoke PaymentSheet, biometrics, Stripe, Method, or a bank.

## Minute 4 — Activity, legal terms, and controls

Open **Profile** to see only the gifts and balances simulated in the current session. USD and EUR totals remain separate. Open the payment, terms, and privacy drafts. Explain the intended model: donors direct principal toward vetted institutional creditors; a fictional sponsor can match principal and cover processing from a separately funded, controlled program. The approved sandbox fee calculation estimates 2.9% + $0.30 card processing and lets donors choose a tip. A separate 15% B2B sponsor retainer has been modeled but is not invoiced or collected. The platform has no recipient cash-out flow. Reset the walkthrough before the next demo.

Avoid presenting the simulated confirmation as a payment receipt or a charitable tax receipt. The existing sandbox confirmation explicitly says direct gifts are not automatically tax deductible.

## Technical and regulatory discussion points

| Area | What exists | What must be validated before launch |
| --- | --- | --- |
| US payments | Stripe **test-mode** intent and signed webhook fixtures; Method-style **sandbox** creditor payment; local mock settlement | Actual provider contracts, independently verified creditor routing, reconciliation, consumer disclosures, and applicable licensing analysis. An agent-of-the-payee exemption cannot be assumed. |
| Sponsorship | Fictional ledger pools, atomic match reservations, fee-buffer guard, and separate retainer math | Sponsor contracts, source and destination of funds, accounting, tax treatment, and controls for each jurisdiction. |
| US charity status | Demo language describes direct gifts and non-deductible confirmations | Qualified counsel and any fiscal sponsor must approve charitable structure and receipt wording before a 501(c)(3) claim. |
| EU/DE concept | Bundled German EUR cards, `de-DE` currency display, and an illustrative SEPA reference label | PSD2/PISP or other lawful payment arrangement, creditor IBAN verification, *Verwendungszweck* matching, BaFin analysis, GDPR/DSGVO privacy controls, and local donation/tax advice. No EU payment adapter or fee schedule exists. |
| Identity and documents | Sandbox authentication, upload review, mock OCR and Textract adapter | Security, consent, retention, privacy impact, fraud, and creditor verification reviews for real personal data. |

## Developer commands

From the repository root, `pnpm run seed` migrates the local database and loads US sandbox bills plus seven separate `pitch_demo_cards` fixtures (requires local PostgreSQL and the documented `.env.local`). The seven-card offline deck uses the same fixture source, `packages/shared/src/pitchDeck.ts`, and works without database seeding. `pitch_demo_cards` is a presentation table and has no path into donation or settlement. `EXPO_PUBLIC_OFFLINE_DEMO=1` selects the bundled four-tab walkthrough for the APK or a local Expo preview; leave that flag unset for the connected application. See `PROGRESS.md` for the latest verification record.
