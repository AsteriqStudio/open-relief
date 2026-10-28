# Open Relief: three-minute co-founder demo

This walkthrough uses the **offline pitch APK**. Every account, household, match pool, and payment confirmation in it is fictional. It makes no charge or transfer and needs no login or network. The US API sandbox is a separate workflow; the European cards illustrate a proposed interface only.

## Before handing over the phone

Install `builds/open-relief-demo.apk` on an Android phone with sideloading enabled. Launch **open-relief**. The opening badge should read **OFFLINE PITCH DEMO**. Tap **Reset demo balances** if a previous walkthrough changed them. The release build embeds its JavaScript bundle and pitch cards; it should open in airplane mode. No live Stripe or Method credentials are needed.

## Minute 1 — The person and the bill

Hand over the phone. The Detroit DTE Energy **demo** card shows a $142.50 past-due balance and a 48-hour shut-off story. Have your partner swipe left to the Berlin Stadtwerke **demo** card, showing €118.00 and a *Mahnung / Sperrandrohung* story. The sponsor chips are fictional 1:1 examples. Point to the **FICTIONAL PITCH CARD** label and the creditor account last four digits: real launch cards would require document, account, and creditor verification before donors can pay them. The German card is a SEPA creditor-reference **concept**, with no EU transfer implemented.

## Minute 2 — The contribution

Return to the Detroit card by swiping through the deck, then swipe right or tap **Relieve this bill**. The sponsor card opens at 50% so the 1:1 match can cover the other half. Try 25%, 50%, or 100%; toggle estimated processing coverage; select 0%, 10%, 15%, or 20% optional tip. A full donor gift leaves no bill balance for matching. The split shows the donor principal, fictional sponsor match, illustrative creditor total, and donor total. Accept the simulation notice and tap **Simulate direct creditor payment**. The confirmation shows the local balance drop. This is an in-memory demonstration, so it does not invoke PaymentSheet, biometrics, Stripe, Method, or a bank. The production flow still needs provider and creditor validation.

## Minute 3 — Economics and controls

Explain the intended model: donors direct principal toward vetted institutional creditors; a fictional sponsor can match that principal and cover processing from a separately funded, controlled program. The approved sandbox fee calculation estimates 2.9% + $0.30 card processing and lets donors choose a tip. A separate 15% B2B sponsor retainer has been modeled but is not invoiced or collected. The platform has no recipient cash-out flow. Open the unmatched Spectrum card to show the standard community path. Reset the balances before the next demo.

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

From the repository root, `pnpm run seed` migrates the local database and loads US sandbox bills plus all four separate `pitch_demo_cards` fixtures (requires local PostgreSQL and the documented `.env.local`). The four-card offline pitch deck uses the same fixture source, `packages/shared/src/pitchDeck.ts`, and works without database seeding. `pitch_demo_cards` is a presentation table and has no path into donation or settlement. `EXPO_PUBLIC_OFFLINE_DEMO=1` selects the bundled deck for the APK or a local Expo preview; leave that flag unset for the connected application. See `PROGRESS.md` for the latest verification record.
