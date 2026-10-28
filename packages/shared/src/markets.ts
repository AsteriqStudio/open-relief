import { z } from 'zod';

export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 country code');

export const MarketReadinessSchema = z.object({
  countryCode: CountryCodeSchema,
  name: z.string().min(1),
  state: z.enum(['connected_sandbox', 'offline_concept', 'not_enabled']),
  recipientBillIntake: z.boolean(),
  creditorSettlement: z.boolean(),
  publicService: z.boolean(),
}).strict();

export type MarketReadiness = z.infer<typeof MarketReadinessSchema>;

export const FEATURED_MARKETS: readonly MarketReadiness[] = [
  MarketReadinessSchema.parse({ countryCode: 'US', name: 'United States', state: 'connected_sandbox', recipientBillIntake: true, creditorSettlement: false, publicService: false }),
  MarketReadinessSchema.parse({ countryCode: 'DE', name: 'Germany', state: 'offline_concept', recipientBillIntake: false, creditorSettlement: false, publicService: false }),
  MarketReadinessSchema.parse({ countryCode: 'GB', name: 'United Kingdom', state: 'not_enabled', recipientBillIntake: false, creditorSettlement: false, publicService: false }),
];

/** Connected bill intake is limited to the US demo until a country-specific rail is verified. */
export function canSubmitConnectedSandboxBill(countryCode: string): boolean {
  return CountryCodeSchema.safeParse(countryCode).success && countryCode === 'US';
}
