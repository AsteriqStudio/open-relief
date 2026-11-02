# Data and access in the current app

## Offline walkthrough

The downloaded demo APK can run its fictional walkthrough without an account, card, bank connection, or network request. Its sample cards and simulated gifts stay on the device for the current app session. They are not sent to Open Relief.

## Connected sandbox

The connected sandbox supports recipient and donor signup, password sign-in, sign-out, and separate recipient, donor, and admin roles.

- Passwords are stored as scrypt password hashes, never as readable passwords.
- The server issues a seven-day signed session. The device keeps its session token in Expo SecureStore; signing out revokes the server session and clears the stored tokens.
- The server stores the account email, phone number, chosen role, and recipient legal name or assistance-program field where supplied. Recipient bills, review decisions, and donation records are stored in the configured PostgreSQL database.
- Creditor account numbers are encrypted before database storage. Uploaded bill files are placed in the configured private object store and are available only through role-checked API routes.
- Sign-in and signup have Redis-backed attempt limits. Admin review and settlement actions create audit records.

The app has no behavioural advertising SDK, analytics SDK, or hidden third-party tracking in this repository. Operational logs from a future hosting provider are separate and must be covered by the final privacy notice.

## Current boundary

The public APK does not include a public server. Signup and bill handling work only after an operator deploys the private sandbox API described in `docs/private-sandbox-deployment.md`. The sandbox is for synthetic data and test accounts. Do not enter a real bill or payment information until the public-launch requirements are met.
