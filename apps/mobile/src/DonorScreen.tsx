import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BRAND_NOTICE, formatCurrency } from '@open-relief/shared';
import { getDonationReceipt, getFeed } from './api';
import type { DonationReceipt, FeedBill } from './api';
import { useAuth } from './AuthContext';
import { CheckoutSheet } from './CheckoutSheet';
import type { CheckoutConfirmation } from './CheckoutSheet';
import { SwipeableBillCard } from './SwipeableBillCard';
import { COLORS, PrimaryButton, ReceiptRow } from './design';

const categoryFilters = ['all', 'electric', 'water', 'gas', 'telecom', 'medical'] as const;
type CategoryFilter = typeof categoryFilters[number];
const categoryLabels: Record<CategoryFilter, string> = { all: 'All bills', electric: 'Electric ⚡', water: 'Water ◈', gas: 'Gas ◆', telecom: 'Telecom ◎', medical: 'Medical ✚' };
const money = (cents: number) => formatCurrency(cents, 'USD');

function ImpactCelebration({ confirmation, receipt, onClose }: { confirmation: CheckoutConfirmation; receipt: DonationReceipt | null; onClose(): void }) {
  const scale = useSharedValue(0.92);
  useEffect(() => { scale.value = withSpring(1, { damping: 15, stiffness: 170 }); }, [scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const confirmed = receipt !== null;
  async function shareReceipt() {
    if (!receipt) return;
    const summary = `${money(receipt.donorPrincipalCents)} demo contribution toward ${confirmation.billerName}; ${money(receipt.amountToBillCents)} simulated to the demo creditor.`;
    await Share.share({ message: `Open Relief sandbox confirmation\n${summary}\nReference: ${receipt.methodDisbursementId ?? receipt.id}\n${receipt.taxNotice}` });
  }
  return <Animated.View style={animatedStyle} className="mt-5 rounded-[28px] border border-line bg-surface p-6">
    <View className="h-16 w-16 items-center justify-center rounded-full bg-pine"><Text className="text-3xl font-black text-canvas">✓</Text></View>
    <Text className="mt-5 text-[11px] font-bold tracking-[2px] text-pine">{confirmation.mode === 'mock' ? 'SIMULATED CONFIRMATION' : 'TEST PAYMENT RECEIVED'}</Text>
    <Text className="mt-2 text-3xl font-black tracking-tight text-ink">{confirmed ? 'Bill relieved.' : 'Payment received.'}</Text>
    <Text className="mt-3 text-sm leading-6 text-muted">{confirmed ? `${money(receipt.donorPrincipalCents)} demo gift toward ${confirmation.billerName}.` : 'Creditor confirmation is pending the signed test webhook.'}</Text>
    {receipt ? <>
      <View className="mt-6 rounded-2xl border border-[#162920] bg-inset p-4">
        <Text className="mb-2 text-[11px] font-bold tracking-widest text-pine">PAYMENT BREAKDOWN</Text>
        <ReceiptRow label="Your contribution" value={money(receipt.donorPrincipalCents)} />
        {receipt.sponsorMatchCents > 0 && <ReceiptRow label={`${receipt.sponsorName ?? 'Sponsor'} match`} value={`+${money(receipt.sponsorMatchCents)}`} />}
        <ReceiptRow label="Creditor amount" value={money(receipt.amountToBillCents)} emphasis />
        <ReceiptRow label="Total paid (incl. fees)" value={money(receipt.totalChargeCents)} />
        {receipt.remainingBalanceCents !== null && <ReceiptRow label="Remaining balance" value={money(receipt.remainingBalanceCents)} badge />}
      </View>
      <Text className="mt-4 text-[11px] leading-5 text-muted">Demo creditor: {confirmation.billerName} · account ••••{receipt.accountLast4 ?? 'private'}</Text>
      <Text className="mt-2 text-[11px] leading-5 text-muted">{receipt.taxNotice}</Text>
      <View className="mt-6"><PrimaryButton label="Explore next bill  →" onPress={onClose} /></View>
      <Pressable accessibilityRole="button" onPress={() => void shareReceipt()} className="mt-3 min-h-12 items-center justify-center"><Text className="text-sm font-semibold text-mint">Share confirmation</Text></Pressable>
    </> : <View className="mt-6"><PrimaryButton label="Back to bills  →" onPress={onClose} /></View>}
    <Text className="mt-4 text-[11px] leading-5 text-muted">{BRAND_NOTICE}</Text>
  </Animated.View>;
}

export function DonorScreen() {
  const [bills, setBills] = useState<FeedBill[]>([]);
  const [index, setIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedBill, setSelectedBill] = useState<FeedBill | null>(null);
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(null);
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const feedRequest = useRef(0);
  const { token } = useAuth();

  async function refresh() {
    const requestId = ++feedRequest.current;
    setLoading(true);
    try {
      const nextBills = await getFeed(categoryFilter === 'all' ? undefined : categoryFilter);
      if (requestId === feedRequest.current) { setBills(nextBills); setIndex(0); setError(null); }
    } catch (failure) { if (requestId === feedRequest.current) setError(failure instanceof Error ? failure.message : 'Could not load bills'); }
    finally { if (requestId === feedRequest.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [categoryFilter]);

  function handleComplete(nextConfirmation: CheckoutConfirmation) {
    setConfirmation(nextConfirmation);
    setReceipt(null);
    void (async () => {
      if (!token) return;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        try { setReceipt(await getDonationReceipt(nextConfirmation.transactionId, token)); break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
      }
      await refresh();
    })().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not refresh payment status'));
  }

  const current = bills[index];
  return <View className="flex-1"><ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
    <Text className="text-[11px] font-bold tracking-[2px] text-pine">THE RELIEF DECK</Text>
    <Text className="mt-3 text-4xl font-black leading-[44px] tracking-tight text-ink">One bill at a time.{'\n'}Direct relief.</Text>
    <Text className="mt-3 text-sm leading-6 text-muted">Choose a reviewed demo bill. Your sandbox gift is directed to a creditor account, never to the recipient.</Text>
    {confirmation ? <ImpactCelebration confirmation={confirmation} receipt={receipt} onClose={() => setConfirmation(null)} /> : <>
      <View className="mt-8 flex-row items-center justify-between"><Text className="text-[11px] font-bold tracking-widest text-ink">BILLS NEEDING HELP</Text><Text className="text-xs font-semibold text-muted">{loading ? 'Loading' : `${bills.length === 0 ? 0 : Math.min(index + 1, bills.length)} / ${bills.length}`}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-4" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {categoryFilters.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: categoryFilter === option }} onPress={() => { setCategoryFilter(option); setIndex(0); }} className={`min-h-10 items-center justify-center rounded-full border px-4 ${categoryFilter === option ? 'border-pine bg-[#0D2A1D]' : 'border-line bg-surface'}`}><Text className={`text-xs font-bold ${categoryFilter === option ? 'text-mint' : 'text-muted'}`}>{categoryLabels[option]}</Text></Pressable>)}
      </ScrollView>
      {loading ? <View className="mt-5 rounded-[28px] border border-line bg-surface p-10"><ActivityIndicator color={COLORS.emerald} /></View> : current ? <SwipeableBillCard key={`${current.id}-${selectedBill ? 'open' : 'closed'}`} bill={current} onGive={() => setSelectedBill(current)} onPass={() => setIndex((value) => value + 1)} /> : <View className="mt-5 rounded-[28px] border border-line bg-surface p-6"><Text className="text-2xl font-black text-ink">{bills.length === 0 ? 'No bills in this category.' : 'You are all caught up.'}</Text><Text className="mt-2 text-sm leading-6 text-muted">Try another category or refresh the reviewed demo feed.</Text><View className="mt-6"><PrimaryButton label="Refresh feed" onPress={() => void refresh()} outline /></View></View>}
    </>}
    {error && <View className="mt-4 rounded-xl border border-[#5C1D1D] bg-[#2B0E0E] p-3"><Text className="text-sm text-coral">{error}</Text></View>}
  </ScrollView>
    <CheckoutSheet bill={selectedBill} onClose={() => { setSelectedBill(null); void refresh(); }} onComplete={handleComplete} />
  </View>;
}
