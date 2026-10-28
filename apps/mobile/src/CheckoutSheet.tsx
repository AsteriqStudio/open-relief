import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useStripe } from './stripeAdapter';
import * as Haptics from 'expo-haptics';
import { BRAND_NOTICE, calculateSponsoredDonationSplit, calculateSponsorMatchCents, donorGiftDisclosure, formatCurrency } from '@open-relief/shared';
import { completeMockDonation, createDonationIntent } from './api';
import type { DonationIntent, FeedBill } from './api';
import { useAuth } from './AuthContext';
import { LegalModal } from './LegalModal';
import type { LegalDocument } from './LegalModal';
import { COLORS, PrimaryButton, ReceiptRow } from './design';

export type CheckoutConfirmation = { billId: string; transactionId: string; amountCents: number; sponsorMatchCents: number; sponsorName: string | null; mode: 'mock' | 'test'; billerName: string; accountLast4: string | null };
const dollars = (cents: number) => formatCurrency(cents, 'USD');

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
  const split = useMemo(() => {
    if (!validAmount || amountCents === null || tipPercentage === null) return null;
    const sponsor = bill?.sponsor;
    const desiredMatch = sponsor ? calculateSponsorMatchCents(amountCents, sponsor.matchRatio, Math.max(0, remaining - amountCents)) : 0;
    const sponsorMatchCents = sponsor && sponsor.remainingMatchBudgetCents >= desiredMatch ? desiredMatch : 0;
    return calculateSponsoredDonationSplit({ billAmountCents: amountCents, coverProcessingFee, tipPercentage, sponsorMatchCents, feeBufferAvailableCents: sponsor?.remainingFeeBufferCents ?? 0 });
  }, [amountCents, bill?.sponsor, coverProcessingFee, remaining, tipPercentage, validAmount]);

  function finish(confirmation: CheckoutConfirmation) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingTestIntent(null);
    setBusy(false);
    sheet.current?.dismiss();
    onComplete(confirmation);
  }

  async function donate() {
    if (!bill || !validAmount || amountCents === null || !split || split.requiresDonorFeeCoverage || tipPercentage === null || !donorTermsAccepted || !token || busy) return;
    setBusy(true);
    setError(null);
    let waitingForSheet = false;
    try {
      const intent = await createDonationIntent({ billId: bill.id, amountCents, coverProcessingFee, tipPercentage, ...(bill.sponsor ? { sponsorPoolId: bill.sponsor.id } : {}), expectedSponsorMatchCents: split.sponsorMatchCents, donorTermsAccepted: true }, token);
      const confirmation: CheckoutConfirmation = { billId: bill.id, transactionId: intent.transactionId, amountCents, sponsorMatchCents: intent.feeBreakdown.sponsorMatchCents, sponsorName: intent.sponsorName, mode: intent.mode, billerName: bill.billerName ?? 'demo creditor', accountLast4: bill.accountLast4 };
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

  return <BottomSheetModal ref={sheet} snapPoints={['92%']} onDismiss={onClose} enablePanDownToClose={!busy} keyboardBehavior="interactive" backgroundStyle={{ backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1 }} handleIndicatorStyle={{ backgroundColor: '#4B6354', width: 48, height: 5 }}>
    <BottomSheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 42 }}>
      <View className="rounded-[28px] border border-line bg-surface p-5">
        <View className="flex-row items-center justify-between"><Text className="text-[11px] font-bold tracking-widest text-pine">DIRECT BILL PAYMENT</Text><View className="rounded-full border border-[#24563F] bg-[#0D2A1D] px-3 py-1"><Text className="text-[10px] font-bold text-mint">TEST MODE</Text></View></View>
        <Text className="mt-4 text-3xl font-black tracking-tight text-ink">Pay the bill.{'\n'}Keep the dignity.</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">This sandbox gift is routed to a reviewed demo creditor account. The recipient cannot cash out.</Text>
        <View className="mt-5 rounded-2xl border border-line bg-inset p-4"><Text className="text-[11px] font-bold tracking-widest text-muted">CREDITOR</Text><Text className="mt-2 text-lg font-bold text-ink">{bill?.billerName ?? 'Demo creditor'}</Text><Text className="mt-1 text-xs text-muted">Account ••••{bill?.accountLast4 ?? 'private'}</Text></View>
      </View>
      <View className="mt-4 rounded-[24px] border border-line bg-surface p-5">
        <Text className="text-[11px] font-bold tracking-widest text-pine">01  YOUR CONTRIBUTION</Text>
        <Text className="mt-2 text-xl font-black text-ink">How much can you cover?</Text>
        <Text className="mt-1 text-xs leading-5 text-muted">Up to {dollars(remaining)} remains on this bill.</Text>
        <View className="mt-5 flex-row gap-2">{([25, 50, 100] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: percentage === value && !customAmount }} onPress={() => { setPercentage(value); setCustomAmount(''); }} className={`min-h-12 flex-1 items-center justify-center rounded-xl border ${percentage === value && !customAmount ? 'border-pine bg-pine' : 'border-line bg-inset'}`}><Text className={`text-sm font-black ${percentage === value && !customAmount ? 'text-canvas' : 'text-muted'}`}>{value === 100 ? 'Full balance' : `${value}%`}</Text></Pressable>)}</View>
        <TextInput className="mt-3 min-h-12 rounded-xl border border-line bg-inset p-4 text-base font-semibold text-ink" placeholder="Or enter a custom amount" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} keyboardType="decimal-pad" value={customAmount} onChangeText={(value) => { setCustomAmount(value); setPercentage(null); }} />
        {amountError && <Text className="mt-2 text-sm text-coral">{amountError}</Text>}
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: coverProcessingFee }} onPress={() => setCoverProcessingFee((value) => !value)} className="mt-4 flex-row items-center rounded-[24px] border border-line bg-surface p-5"><View className={`mr-4 h-7 w-7 items-center justify-center rounded-lg ${coverProcessingFee ? 'bg-pine' : 'border border-line bg-inset'}`}><Text className="font-black text-canvas">{coverProcessingFee ? '✓' : ''}</Text></View><View className="flex-1"><Text className="text-sm font-bold text-ink">Cover processing {split ? `(${dollars(split.processingFeeCoveredCents)})` : ''}</Text><Text className="mt-1 text-xs leading-5 text-muted">Your full contribution reaches the demo creditor.</Text></View></Pressable>
      {split?.requiresDonorFeeCoverage && <View className="mt-3 rounded-2xl border border-[#543B14] bg-cream p-4"><Text className="text-sm font-bold leading-5 text-amber">Fee buffer depleted. Please cover card processing.</Text></View>}
      {split?.feeCoverageSource === 'sponsor_buffer' && <Text className="mt-2 text-xs text-pine">{bill?.sponsor?.name} covers the estimated {dollars(split.feeBufferAppliedCents)} processing fee.</Text>}
      <View className="mt-4 rounded-[24px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">02  OPTIONAL PLATFORM TIP</Text><Text className="mt-2 text-sm leading-5 text-muted">Your choice helps run this demo. Zero is always welcome.</Text><View className="mt-4 flex-row rounded-xl border border-line bg-inset p-1">{([0, 10, 15, 20] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tipPercentage === value }} onPress={() => setTipPercentage(value)} className={`min-h-11 flex-1 items-center justify-center rounded-lg ${tipPercentage === value ? 'bg-pine' : 'bg-inset'}`}><Text className={`font-black ${tipPercentage === value ? 'text-canvas' : 'text-muted'}`}>{value}%</Text></Pressable>)}</View></View>
      {split && <View className="mt-4 rounded-[24px] border border-line bg-inset p-5">
        <Text className="text-[11px] font-bold tracking-widest text-pine">03  REVIEW YOUR PAYMENT</Text>
        <Text className="mt-2 text-xl font-bold tracking-tight text-ink">Every dollar, accounted for.</Text>
        <View className="mt-4"><ReceiptRow label="Principal to creditor" value={dollars(amountCents ?? 0)} />
          {split.sponsorMatchCents > 0 && <ReceiptRow label="Sponsor match to creditor" value={`+${dollars(split.sponsorMatchCents)}`} />}
          <ReceiptRow label="Total to creditor" value={dollars(split.totalDisbursementToCreditorCents)} emphasis />
          <ReceiptRow label="Estimated card fee" value={dollars(split.stripeFeeCents)} />
          <ReceiptRow label="Fee you cover" value={dollars(split.processingFeeCoveredCents)} />
          <ReceiptRow label="Optional platform tip" value={dollars(split.platformTipCents)} />
        </View><View className="mt-3 h-px bg-line" />
        <View className="mt-2"><ReceiptRow label="Total test charge" value={dollars(split.totalChargeCents)} emphasis /></View>
      </View>}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: donorTermsAccepted }} onPress={() => setDonorTermsAccepted((value) => !value)} className="mt-4 flex-row rounded-[24px] border border-line bg-surface p-5"><View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${donorTermsAccepted ? 'bg-pine' : 'border border-line bg-inset'}`}><Text className="font-black text-canvas">{donorTermsAccepted ? '✓' : ''}</Text></View><Text className="flex-1 text-xs leading-5 text-muted">{donorGiftDisclosure(bill?.billerName ?? 'the demo creditor')}</Text></Pressable>
      <View className="mt-4 rounded-2xl border border-line bg-inset p-4"><Text className="text-[11px] font-black tracking-widest text-pine">ABOUT THIS GIFT</Text><Text className="mt-2 text-[11px] leading-5 text-muted">{BRAND_NOTICE}</Text><Pressable accessibilityRole="button" onPress={() => setLegalDocument('payment')} className="mt-3 self-start"><Text className="text-xs font-bold text-mint">Payment & legal details  →</Text></Pressable></View>
      <View className="mt-4 flex-row gap-5"><Pressable onPress={() => setLegalDocument('terms')}><Text className="text-sm font-bold text-pine">Terms of service</Text></Pressable><Pressable onPress={() => setLegalDocument('privacy')}><Text className="text-sm font-bold text-pine">Privacy notice</Text></Pressable></View>
      {error && <Text className="mt-4 text-sm text-coral">{error}</Text>}
      <View className="mt-6"><PrimaryButton disabled={!split || split.requiresDonorFeeCoverage || !donorTermsAccepted || busy} onPress={() => void donate()} label={busy ? 'Preparing payment…' : split?.requiresDonorFeeCoverage ? 'Cover processing to continue' : split ? `Continue · ${dollars(split.totalChargeCents)}  →` : 'Choose an amount and tip'} /></View>
      {pendingTestIntent && <StripePaymentPresenter intent={pendingTestIntent.intent} onSuccess={() => finish(pendingTestIntent.confirmation)} onFailure={(message) => { setPendingTestIntent(null); setBusy(false); setError(message); }} />}
      <Text className="mt-4 text-center text-xs leading-5 text-muted">Sandbox only. Mock mode records a simulated creditor payment. Confirmations are not charitable tax receipts.</Text>
      <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
    </BottomSheetScrollView>
  </BottomSheetModal>;
}
