import type { ReactNode } from 'react';

export function StripeProvider({ children }: { publishableKey: string; children: ReactNode }) {
  return <>{children}</>;
}

const unsupported = async () => ({ error: { message: 'Stripe PaymentSheet requires the native app.' } });

export function useStripe() {
  return { initPaymentSheet: unsupported, presentPaymentSheet: unsupported };
}
