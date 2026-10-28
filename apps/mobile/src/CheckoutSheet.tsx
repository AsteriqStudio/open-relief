import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useStripe } from './stripeAdapter';
import * as Haptics from 'expo-haptics';
import { BRAND_NOTICE, calculateDonationSplit, donorGiftDisclosure } from '@open-relief/shared';
import { completeMockDonation, createDonationIntent } from './api';
import type { DonationIntent, FeedBill } from './api';
import { useAuth } from './AuthContext';
import { LegalModal } from './LegalModal';
import type { LegalDocument } from './LegalModal';

export type CheckoutConfirmation = { billId: string; transactionId: string; amountCents: number; mode: 'mock' | 'test'; billerName: string; accountLast4: string | null };
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function StripePaymentPresenter({ intent, onSuccess, onFailure }: { intent: DonationIntent; onSuccess(): void; onFailure(message: string): void }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const initialized = await initPaymentSheet({ paymentIntentClientSecret: intent.clientSecret, merchantDisplayName: 'Open Relief' });
      if (initialized.error) throw new Error(initialized.error.message);
      const presented = await presentPaymentSheet();
      if (presented.error) throw new Error(presented.error.message);
      onSuccess();
    })().catch((failure: unknown) => onFailure(failure instanceof Error ? failure.message : 'Test payment failed'));
  }, [initPaymentSheet, intent.clientSecret, onFailure, onSuccess, presentPaymentSheet]);
  return null;
}

export function CheckoutSheet({ bill, onClose, onComplete }: { bill: FeedBill | null; onClose(): void; onComplete(confirmation: CheckoutConfirmation): void }) {
  const { token } = useAuth();
  const sheet = useRef<BottomSheetModal>(null);
  const [percentage, setPercentage] = useState<25 | 50 | 100 | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [tipPercentage, setTipPercentage] = useState<0 | 10 | 15 | 20 | null>(null);
  const [coverProcessingFee, setCoverProcessingFee] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donorTermsAccepted, setDonorTermsAccepted] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [pendingTestIntent, setPendingTestIntent] = useState<{ intent: DonationIntent; confirmation: CheckoutConfirmation } | null>(null);

  useEffect(() => {
    if (!bill) return;
    setPercentage(null);
    setCustomAmount('');
    setTipPercentage(null);
    setCoverProcessingFee(true);
    setBusy(false);
    setError(null);
    setDonorTermsAccepted(false);
    setPendingTestIntent(null);
    requestAnimationFrame(() => sheet.current?.present());
  }, [bill]);

  const remaining = bill?.remainingBalanceCents ?? 0;
  const customValid = /^\d{1,6}(?:\.\d{0,2})?$/.test(customAmount);
  const customCents = customValid ? Math.round(Number(customAmount) * 100) : null;
  const amountCents = customAmount ? customCents : percentage ? Math.max(1, Math.round(remaining * percentage / 100)) : null;
  const amountError = customAmount && (amountCents === null || amountCents <= 0 || amountCents > remaining)
    ? 'Enter an amount greater than $0 and no more than the remaining balance.' : null;
  const validAmount = amountCents !== null && amountCents > 0 && amountCents <= remaining && !amountError;
  const split = useMemo(() => validAmount && amountCents !== null && tipPercentage !== null
    ? calculateDonationSplit({ billAmountCents: amountCents, coverProcessingFee, tipPercentage }) : null,
  [amountCents, coverProcessingFee, tipPercentage, validAmount]);

  function finish(confirmation: CheckoutConfirmation) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingTestIntent(null);
    setBusy(false);
    sheet.current?.dismiss();
    onComplete(confirmation);
  }

  async function donate() {
    if (!bill || !validAmount || amountCents === null || !split || tipPercentage === null || !donorTermsAccepted || !token || busy) return;
    setBusy(true);
    setError(null);
    let waitingForSheet = false;
    try {
      const intent = await createDonationIntent({ billId: bill.id, amountCents, coverProcessingFee, tipPercentage, donorTermsAccepted: true }, token);
      const confirmation: CheckoutConfirmation = { billId: bill.id, transactionId: intent.transactionId, amountCents, mode: intent.mode, billerName: bill.billerName ?? 'demo creditor', accountLast4: bill.accountLast4 };
      if (intent.mode === 'mock') {
        await completeMockDonation(intent.transactionId, token);
        finish(confirmation);
      } else {
        if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_')) throw new Error('A Stripe test publishable key is required for checkout.');
        waitingForSheet = true;
        setPendingTestIntent({ intent, confirmation });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout failed');
    } finally {
      if (!waitingForSheet) setBusy(false);
    }
  }

  return <BottomSheetModal ref={sheet} snapPoints={['92%']} onDismiss={onClose} enablePanDownToClose={!busy} keyboardBehavior="interactive" backgroundStyle={{ backgroundColor: '#F6F6F1' }} handleIndicatorStyle={{ backgroundColor: '#9AAEA6' }}>
    <BottomSheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 42 }}>
      <View className="overflow-hidden rounded-3xl bg-pine-dark p-6">
        <View className="absolute -right-12 -top-14 h-44 w-44 rounded-full border border-white/10" />
        <View className="flex-row items-center justify-between"><Text className="text-[11px] font-bold tracking-widest text-mint">DIRECT BILL PAYMENT</Text><View className="rounded-full bg-white/15 px-3 py-1"><Text className="text-[11px] font-bold text-white">TEST MODE</Text></View></View>
        <Text className="mt-5 text-3xl font-black text-white">Pay a bill directly.</Text>
        <Text className="mt-2 text-sm leading-6 text-white/80">Your gift goes to the verified demo creditor account. No cash goes to the recipient.</Text>
        <View className="mt-5 rounded-2xl bg-white/10 p-4"><Text className="text-[11px] font-bold tracking-widest text-mint">PAYING</Text><Text className="mt-1 text-lg font-black text-white">{bill?.billerName ?? 'Demo creditor'}</Text><Text className="mt-1 text-xs text-white/70">Account ••••{bill?.accountLast4 ?? 'private'}</Text></View>
      </View>
      <View className="mt-5 rounded-3xl border border-line bg-white p-5">
        <Text className="text-[11px] font-bold tracking-widest text-pine">01  YOUR CONTRIBUTION</Text>
        <Text className="mt-2 text-xl font-black text-ink">How much can you cover?</Text>
        <Text className="mt-1 text-xs leading-5 text-muted">Up to {dollars(remaining)} remains on this bill.</Text>
        <View className="mt-5 flex-row gap-2">{([25, 50, 100] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => { setPercentage(value); setCustomAmount(''); }} className={`min-h-12 flex-1 items-center justify-center rounded-xl ${percentage === value && !customAmount ? 'bg-pine-dark' : 'bg-canvas'}`}><Text className={`font-black ${percentage === value && !customAmount ? 'text-white' : 'text-ink'}`}>{value === 100 ? 'Full' : `${value}%`}</Text></Pressable>)}</View>
        <TextInput className="mt-3 rounded-xl border border-line bg-white p-4 text-base font-semibold text-ink" placeholder="Or enter a custom amount" keyboardType="decimal-pad" value={customAmount} onChangeText={(value) => { setCustomAmount(value); setPercentage(null); }} />
        {amountError && <Text className="mt-2 text-sm text-red-700">{amountError}</Text>}
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: coverProcessingFee }} onPress={() => setCoverProcessingFee((value) => !value)} className="mt-4 flex-row items-center rounded-3xl border border-line bg-mint p-5"><View className={`mr-4 h-7 w-7 items-center justify-center rounded-lg ${coverProcessingFee ? 'bg-pine' : 'border border-muted bg-white'}`}><Text className="font-black text-white">{coverProcessingFee ? '✓' : ''}</Text></View><View className="flex-1"><Text className="font-black text-ink">Cover card processing {split ? `(${dollars(split.processingFeeCoveredCents)})` : ''}</Text><Text className="mt-1 text-xs leading-5 text-muted">Adds the estimated processing fee to your test total.</Text></View></Pressable>
      <View className="mt-4 rounded-3xl border border-line bg-white p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">02  OPTIONAL PLATFORM TIP</Text><Text className="mt-2 text-sm leading-5 text-muted">Your choice helps run this demo. Zero is always welcome.</Text><View className="mt-4 flex-row rounded-xl bg-canvas p-1">{([0, 10, 15, 20] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setTipPercentage(value)} className={`min-h-11 flex-1 items-center justify-center rounded-lg ${tipPercentage === value ? 'bg-white shadow-sm' : ''}`}><Text className={`font-black ${tipPercentage === value ? 'text-pine-dark' : 'text-muted'}`}>{value}%</Text></Pressable>)}</View></View>
      {split && <View className="mt-4 rounded-3xl border border-line bg-white p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">03  REVIEW YOUR PAYMENT</Text><Text className="mt-2 text-xl font-black text-ink">Every dollar, accounted for.</Text><View className="mt-5 flex-row justify-between"><Text className="text-sm text-muted">To creditor</Text><Text className="font-bold text-ink">{dollars(split.netPaymentToBillerCents)}</Text></View><View className="mt-3 flex-row justify-between"><Text className="text-sm text-muted">Estimated processing fee</Text><Text className="font-bold text-ink">{dollars(split.stripeFeeCents)}</Text></View><View className="mt-3 flex-row justify-between"><Text className="text-sm text-muted">Fee you cover</Text><Text className="font-bold text-ink">{dollars(split.processingFeeCoveredCents)}</Text></View><View className="mt-3 flex-row justify-between"><Text className="text-sm text-muted">Platform tip</Text><Text className="font-bold text-ink">{dollars(split.platformTipCents)}</Text></View><View className="mt-5 h-px bg-line" /><View className="mt-4 flex-row justify-between"><Text className="text-base font-black text-ink">Total test charge</Text><Text className="text-lg font-black text-pine-dark">{dollars(split.totalChargeCents)}</Text></View></View>}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: donorTermsAccepted }} onPress={() => setDonorTermsAccepted((value) => !value)} className="mt-4 flex-row rounded-3xl border border-line bg-white p-5"><View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${donorTermsAccepted ? 'bg-pine' : 'border border-line bg-canvas'}`}><Text className="font-black text-white">{donorTermsAccepted ? '✓' : ''}</Text></View><Text className="flex-1 text-sm leading-6 text-muted">{donorGiftDisclosure(bill?.billerName ?? 'the demo creditor')}</Text></Pressable>
      <View className="mt-4 rounded-2xl bg-cream p-4"><Text className="text-[11px] font-black tracking-widest text-amber">ABOUT THIS GIFT</Text><Text className="mt-2 text-xs leading-5 text-ink">{BRAND_NOTICE}</Text><Pressable accessibilityRole="button" onPress={() => setLegalDocument('payment')} className="mt-3 self-start"><Text className="text-xs font-bold text-pine">Payment & legal details  →</Text></Pressable></View>
      <View className="mt-4 flex-row gap-5"><Pressable onPress={() => setLegalDocument('terms')}><Text className="text-sm font-bold text-pine">Terms of service</Text></Pressable><Pressable onPress={() => setLegalDocument('privacy')}><Text className="text-sm font-bold text-pine">Privacy notice</Text></Pressable></View>
      {error && <Text className="mt-4 text-sm text-red-700">{error}</Text>}
      <Pressable accessibilityRole="button" disabled={!split || !donorTermsAccepted || busy} onPress={() => void donate()} className={`mt-6 min-h-14 items-center justify-center rounded-2xl p-4 ${split && donorTermsAccepted && !busy ? 'bg-pine' : 'bg-muted'}`}><Text className="text-center text-base font-black text-white">{busy ? 'Preparing payment…' : split ? `Continue · ${dollars(split.totalChargeCents)}  →` : 'Choose an amount and tip'}</Text></Pressable>
      {pendingTestIntent && <StripePaymentPresenter intent={pendingTestIntent.intent} onSuccess={() => finish(pendingTestIntent.confirmation)} onFailure={(message) => { setPendingTestIntent(null); setBusy(false); setError(message); }} />}
      <Text className="mt-4 text-center text-xs leading-5 text-muted">Sandbox only. Mock mode records a simulated creditor payment. Confirmations are not charitable tax receipts.</Text>
      <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
    </BottomSheetScrollView>
  </BottomSheetModal>;
}
