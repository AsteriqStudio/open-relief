import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { calculateDonationSplit } from '@open-relief/shared';
import { completeMockDonation, createDonationIntent } from './api';
import type { DonationIntent, FeedBill } from './api';
import { useAuth } from './AuthContext';

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
  const [pendingTestIntent, setPendingTestIntent] = useState<{ intent: DonationIntent; confirmation: CheckoutConfirmation } | null>(null);

  useEffect(() => {
    if (!bill) return;
    setPercentage(null);
    setCustomAmount('');
    setTipPercentage(null);
    setCoverProcessingFee(true);
    setBusy(false);
    setError(null);
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
    if (!bill || !validAmount || amountCents === null || !split || tipPercentage === null || !token || busy) return;
    setBusy(true);
    setError(null);
    let waitingForSheet = false;
    try {
      const intent = await createDonationIntent({ billId: bill.id, amountCents, coverProcessingFee, tipPercentage }, token);
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

  return <BottomSheetModal ref={sheet} snapPoints={['88%']} onDismiss={onClose} enablePanDownToClose={!busy} keyboardBehavior="interactive">
    <BottomSheetScrollView contentContainerStyle={{ padding: 22, paddingBottom: 42 }}>
      <View className="flex-row items-center justify-between"><Text className="text-2xl font-black text-slate-900">Pay a bill directly</Text><Text className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">TEST MODE</Text></View>
      <Text className="mt-2 text-sm leading-5 text-slate-600">For {bill?.billerName ?? 'a demo creditor'} · Account ••••{bill?.accountLast4 ?? 'private'}. No funds are sent to a recipient.</Text>
      <Text className="mt-7 text-xs font-bold uppercase tracking-widest text-slate-500">Your contribution</Text>
      <View className="mt-3 flex-row gap-2">{([25, 50, 100] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => { setPercentage(value); setCustomAmount(''); }} className={`flex-1 rounded-2xl p-3 ${percentage === value && !customAmount ? 'bg-slate-900' : 'bg-slate-100'}`}><Text className={`text-center font-bold ${percentage === value && !customAmount ? 'text-white' : 'text-slate-700'}`}>{value === 100 ? 'Full' : `${value}%`}</Text></Pressable>)}</View>
      <TextInput className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-lg font-semibold text-slate-900" placeholder="Custom amount, e.g. 25.00" keyboardType="decimal-pad" value={customAmount} onChangeText={(value) => { setCustomAmount(value); setPercentage(null); }} />
      {amountError && <Text className="mt-2 text-sm text-red-700">{amountError}</Text>}
      <Text className="mt-2 text-xs text-slate-500">Up to {dollars(remaining)} remaining on this bill</Text>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: coverProcessingFee }} onPress={() => setCoverProcessingFee((value) => !value)} className="mt-6 flex-row items-center rounded-2xl bg-emerald-50 p-4"><View className={`mr-3 h-6 w-6 items-center justify-center rounded-md ${coverProcessingFee ? 'bg-emerald-600' : 'border border-slate-400 bg-white'}`}><Text className="font-bold text-white">{coverProcessingFee ? '✓' : ''}</Text></View><View className="flex-1"><Text className="font-bold text-slate-900">Cover card processing {split ? `(${dollars(split.processingFeeCoveredCents)})` : ''}</Text><Text className="mt-1 text-xs leading-4 text-slate-600">Your selected bill amount goes to the creditor. This option covers the estimated card fee.</Text></View></Pressable>
      <Text className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-500">Optional platform tip</Text>
      <View className="mt-3 flex-row rounded-2xl bg-slate-100 p-1">{([0, 10, 15, 20] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setTipPercentage(value)} className={`flex-1 rounded-xl p-3 ${tipPercentage === value ? 'bg-white shadow-sm' : ''}`}><Text className={`text-center font-bold ${tipPercentage === value ? 'text-emerald-800' : 'text-slate-500'}`}>{value}%</Text></Pressable>)}</View>
      {split && <View className="mt-7 rounded-3xl border border-slate-200 bg-white p-5"><Text className="text-lg font-bold text-slate-900">Payment summary</Text><View className="mt-4 flex-row justify-between"><Text className="text-slate-600">To creditor</Text><Text className="font-semibold text-slate-900">{dollars(split.netPaymentToBillerCents)}</Text></View><View className="mt-3 flex-row justify-between"><Text className="text-slate-600">Estimated processing fee</Text><Text className="font-semibold text-slate-900">{dollars(split.stripeFeeCents)}</Text></View><View className="mt-3 flex-row justify-between"><Text className="text-slate-600">Fee you cover</Text><Text className="font-semibold text-slate-900">{dollars(split.processingFeeCoveredCents)}</Text></View><View className="mt-3 flex-row justify-between"><Text className="text-slate-600">Platform tip</Text><Text className="font-semibold text-slate-900">{dollars(split.platformTipCents)}</Text></View><View className="mt-5 h-px bg-slate-200" /><View className="mt-4 flex-row justify-between"><Text className="text-lg font-black text-slate-900">Total test charge</Text><Text className="text-lg font-black text-slate-900">{dollars(split.totalChargeCents)}</Text></View></View>}
      {error && <Text className="mt-4 text-sm text-red-700">{error}</Text>}
      <Pressable accessibilityRole="button" disabled={!split || busy} onPress={() => void donate()} className={`mt-6 rounded-2xl p-5 ${split && !busy ? 'bg-emerald-600' : 'bg-slate-400'}`}><Text className="text-center text-base font-black text-white">{busy ? 'Preparing payment…' : split ? `Continue · ${dollars(split.totalChargeCents)}` : 'Choose an amount and tip'}</Text></Pressable>
      {pendingTestIntent && <StripePaymentPresenter intent={pendingTestIntent.intent} onSuccess={() => finish(pendingTestIntent.confirmation)} onFailure={(message) => { setPendingTestIntent(null); setBusy(false); setError(message); }} />}
      <Text className="mt-4 text-center text-xs leading-4 text-slate-500">Test cards only. Mock mode settles a simulated creditor payment without PaymentSheet. Payment confirmations are not charitable tax receipts.</Text>
    </BottomSheetScrollView>
  </BottomSheetModal>;
}
