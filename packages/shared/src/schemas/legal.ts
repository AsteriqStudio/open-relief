import { z } from 'zod';

export const LEGAL_TERMS_VERSION = 'v1.0' as const;
export const LegalAcceptanceSchema = z.object({ accepted: z.literal(true), termsVersion: z.literal(LEGAL_TERMS_VERSION) }).strict();

export function recipientAttestation(creditorName: string): string {
  return `I certify under penalty of perjury that I am the account holder or an authorized resident, my household is facing financial hardship, and this bill is unpaid. I authorize Open Relief and its bill-pay partners to settle this balance directly with ${creditorName}. I agree that intentional misrepresentation or attempting to cash-out overpayments constitutes criminal fraud.`;
}

export function donorGiftDisclosure(creditorName: string): string {
  return `By completing this payment, you authorize a direct payment to ${creditorName} on behalf of this account holder. This transaction is an irrevocable, non-refundable gift and is currently not tax-deductible under 501(c)(3). You agree to our Terms of Service and Binding Arbitration.`;
}

export const TERMS_OF_SERVICE = `Open Relief sandbox terms (${LEGAL_TERMS_VERSION}). This application is a test environment: mock donations and Stripe test cards do not move real funds. A recipient authorizes a payment only to the verified creditor on the uploaded bill. Donors never send cash to a recipient. Information and documents must be accurate; fraudulent or duplicate submissions may be rejected. Test payment confirmation is not proof of a tax-deductible contribution. No 501(c)(3) status is claimed. Refund and dispute rights required by applicable law are preserved. Where lawful, disputes arising from this service are subject to individual binding arbitration after a good-faith attempt to resolve the issue with Open Relief. These draft terms require legal review before public launch.`;

export const PRIVACY_NOTICE = `Open Relief sandbox privacy notice (${LEGAL_TERMS_VERSION}). We collect account contact details, the recipient's legal name, assistance-program self-report, uploaded bill documents, extracted creditor and account details, donation records, and audit decisions to review eligibility and route simulated creditor payments. Donors see only approved bill summaries and a masked account suffix. Administrators can review pending documents and identity-match signals. The local demo stores these records in PostgreSQL and MinIO; a live retention, deletion, support, and processor policy must be approved before public launch.`;
