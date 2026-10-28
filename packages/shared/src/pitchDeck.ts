import { z } from 'zod';
import { DemoCurrencySchema } from './utils/feeEngine.js';

export const PitchCardSchema = z.object({
  id: z.string().uuid(),
  billerName: z.string().min(2),
  region: z.enum(['US', 'DE']),
  currency: DemoCurrencySchema,
  category: z.enum(['electric', 'telecom']),
  location: z.string().min(2),
  urgency: z.string().min(2),
  story: z.string().min(2),
  accountLast4: z.string().length(4),
  balanceCents: z.number().int().positive().safe(),
  sponsorName: z.string().nullable(),
  matchRatio: z.number().min(0).max(1),
  railLabel: z.string().min(2),
}).strict();
export type PitchCard = z.infer<typeof PitchCardSchema>;

/** Fictional accounts and matching pools. The German rail is an interface concept only. */
export const PITCH_CARDS: PitchCard[] = z.array(PitchCardSchema).parse([
  {
    id: '00000000-0000-4000-8000-000000000201', billerName: 'DTE Energy (demo)', region: 'US', currency: 'USD', category: 'electric',
    location: 'Detroit, MI', urgency: 'Shut-off scheduled in 48 hours', story: 'A Detroit household needs help keeping the lights on.',
    accountLast4: '0101', balanceCents: 14_250, sponsorName: 'Detroit Community Match (fictional)', matchRatio: 1,
    railLabel: 'US creditor-payment sandbox',
  },
  {
    id: '00000000-0000-4000-8000-000000000208', billerName: 'Berliner Stadtwerke (demo)', region: 'DE', currency: 'EUR', category: 'electric',
    location: 'Berlin-Neukölln', urgency: 'Mahnung / Sperrandrohung', story: 'A Berlin household faces an overdue municipal electric bill.',
    accountLast4: '0208', balanceCents: 11_800, sponsorName: 'Berlin Impact Match (fictional)', matchRatio: 1,
    railLabel: 'SEPA creditor-reference concept; no transfer',
  },
  {
    id: '00000000-0000-4000-8000-000000000207', billerName: 'Spectrum Broadband (demo)', region: 'US', currency: 'USD', category: 'telecom',
    location: 'Seattle, WA', urgency: 'Broadband disconnection notice', story: 'A student household needs reliable access for school.',
    accountLast4: '0107', balanceCents: 6_499, sponsorName: null, matchRatio: 0,
    railLabel: 'US creditor-payment sandbox',
  },
  {
    id: '00000000-0000-4000-8000-000000000209', billerName: 'Deutsche Telekom (demo)', region: 'DE', currency: 'EUR', category: 'telecom',
    location: 'Berlin, DE', urgency: 'Broadband disconnection notice', story: 'A student household needs reliable access for school.',
    accountLast4: '0209', balanceCents: 5_900, sponsorName: null, matchRatio: 0,
    railLabel: 'SEPA creditor-reference concept; no transfer',
  },
]);
