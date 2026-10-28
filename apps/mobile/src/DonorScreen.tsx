import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { getDonationReceipt, getFeed } from './api';
import type { DonationReceipt, FeedBill } from './api';
import { useAuth } from './AuthContext';
import { CheckoutSheet } from './CheckoutSheet';
import type { CheckoutConfirmation } from './CheckoutSheet';
import { SwipeableBillCard } from './SwipeableBillCard';
import { BRAND_NOTICE } from '@open-relief/shared';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const categoryFilters = ['all', 'electric', 'water', 'gas', 'medical', 'telecom'] as const;
type CategoryFilter = typeof categoryFilters[number];

function ImpactCelebration({ confirmation, receipt, onClose }: { confirmation: CheckoutConfirmation; receipt: DonationReceipt | null; onClose(): void }) {
  const scale = useSharedValue(0.82);
  useEffect(() => { scale.value = withSpring(1, { damping: 13, stiffness: 150 }); }, [scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const confirmed = receipt !== null;
  const summary = confirmed
    ? `Your ${dollars(receipt.donorPrincipalCents)} ${confirmation.mode === 'mock' ? 'demo' : 'test'} gift${receipt.sponsorMatchCents > 0 ? ` plus ${dollars(receipt.sponsorMatchCents)} from ${receipt.sponsorName}` : ''} directed ${dollars(receipt.amountToBillCents)} to ${confirmation.billerName}, account ••••${confirmation.accountLast4 ?? 'private'}. The creditor payment is simulated.`
    : `Your ${dollars(confirmation.amountCents)} test payment was accepted. Creditor confirmation is pending.`;
  async function shareReceipt() {
    if (!receipt) return;
    await Share.share({ message: `Open Relief payment confirmation\n${summary}\nReference: ${receipt.methodDisbursementId ?? receipt.id}\n${receipt.taxNotice}` });
  }
  return <Animated.View style={animatedStyle} className="mt-5"><View className="overflow-hidden rounded-3xl bg-pine-dark p-6 shadow-lg">
    <View className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10" />
    <View className="h-14 w-14 items-center justify-center rounded-2xl bg-mint"><Text className="text-3xl font-black text-pine-dark">✓</Text></View>
    <Text className="mt-7 text-xs font-bold tracking-widest text-mint">DIRECT-TO-CREDITOR RELIEF</Text>
    <Text className="mt-2 text-3xl font-black text-white">{confirmed ? 'Relief recorded.' : 'Payment received.'}</Text>
    <Text className="mt-4 text-base leading-6 text-white/80">{summary}</Text>
    {receipt ? <>
      <View className="mt-6 rounded-2xl bg-white/10 p-5">
        <Text className="text-xs font-bold tracking-widest text-mint">PAYMENT CONFIRMATION</Text>
        <Text className="mt-3 text-xs leading-5 text-white/80">Verified creditor: {confirmation.billerName} · acct ••••{receipt.accountLast4 ?? 'private'}</Text>
        <View className="mt-4 flex-row justify-between"><Text className="text-sm text-white/80">Your contribution</Text><Text className="font-black text-white">{dollars(receipt.donorPrincipalCents)}</Text></View>
        {receipt.sponsorMatchCents > 0 && <View className="mt-3 flex-row justify-between"><Text className="flex-1 text-sm text-white/80">{receipt.sponsorName} match</Text><Text className="font-black text-white">+{dollars(receipt.sponsorMatchCents)}</Text></View>}
        <View className="mt-3 flex-row justify-between"><Text className="text-sm text-white/80">To verified creditor</Text><Text className="font-black text-white">{dollars(receipt.amountToBillCents)}</Text></View>
        <View className="mt-3 flex-row justify-between"><Text className="text-sm text-white/80">Test total</Text><Text className="font-black text-white">{dollars(receipt.totalChargeCents)}</Text></View>
        <Text className="mt-4 text-xs leading-5 text-white/70">{receipt.taxNotice}</Text>
        <Text className="mt-3 text-xs leading-5 text-white/70">{BRAND_NOTICE}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void shareReceipt()} className="mt-5 min-h-14 items-center justify-center rounded-2xl bg-mint"><Text className="font-black text-pine-dark">Share confirmation</Text></Pressable>
    </> : <Text className="mt-5 text-sm text-mint">Creditor confirmation will appear after the signed webhook is recorded.</Text>}
    <Pressable accessibilityRole="button" onPress={onClose} className="mt-4 p-3"><Text className="text-center font-bold text-white/80">Back to bills</Text></Pressable>
  </View></Animated.View>;
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
    try { const nextBills = await getFeed(categoryFilter === 'all' ? undefined : categoryFilter); if (requestId === feedRequest.current) { setBills(nextBills); setIndex(0); setError(null); } }
    catch (failure) { if (requestId === feedRequest.current) setError(failure instanceof Error ? failure.message : 'Could not load bills'); }
    finally { if (requestId === feedRequest.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [categoryFilter]);

  function handleComplete(nextConfirmation: CheckoutConfirmation) {
    setConfirmation(nextConfirmation);
    setReceipt(null);
    void (async () => {
      if (!token) return;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
          const nextReceipt = await getDonationReceipt(nextConfirmation.transactionId, token);
          setReceipt(nextReceipt);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      await refresh();
    })().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not refresh payment status'));
  }

  const visibleBills = bills;
  const current = visibleBills[index];
  return <View className="flex-1 bg-canvas"><ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36 }}>
    <Text className="text-[11px] font-black tracking-widest text-pine">DIRECT HELP, REAL RELIEF</Text>
    <Text className="mt-2 text-3xl font-black leading-9 text-ink">Pay a bill.{"\n"}Lift a weight.</Text>
    <Text className="mt-1 text-sm leading-5 text-muted">Choose a reviewed demo bill. Pay the creditor directly, never the recipient.</Text>
    <View className="mt-3 flex-row items-center"><View className="h-6 w-6 items-center justify-center rounded-full bg-mint"><Text className="text-xs font-black text-pine">✓</Text></View><Text className="ml-2 text-xs font-semibold text-pine-dark">Reviewed before it reaches your feed</Text></View>
    {confirmation ? <ImpactCelebration confirmation={confirmation} receipt={receipt} onClose={() => setConfirmation(null)} />
      : <View className="mt-3"><View className="flex-row items-center justify-between"><Text className="text-xs font-black tracking-widest text-pine">BILLS NEEDING HELP</Text><Text className="text-xs font-bold text-muted">{loading ? 'Loading' : `${visibleBills.length === 0 ? 0 : Math.min(index + 1, visibleBills.length)} / ${visibleBills.length}`}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {categoryFilters.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: categoryFilter === option }} onPress={() => { setCategoryFilter(option); setIndex(0); }} className={`rounded-full border px-4 py-2.5 ${categoryFilter === option ? 'border-pine-dark bg-pine-dark' : 'border-line bg-white'}`}><Text className={`text-xs font-bold capitalize ${categoryFilter === option ? 'text-white' : 'text-ink'}`}>{option === 'all' ? 'All bills' : option}</Text></Pressable>)}
        </ScrollView>
        {loading ? <View className="mt-5 rounded-3xl bg-white p-10"><ActivityIndicator color="#176B5D" /></View> : current ? <SwipeableBillCard key={`${current.id}-${selectedBill ? 'open' : 'closed'}`} bill={current} onGive={() => setSelectedBill(current)} onPass={() => setIndex((value) => value + 1)} /> : <View className="mt-5 rounded-3xl border border-line bg-white p-7"><Text className="text-2xl font-black text-ink">{visibleBills.length === 0 ? `No ${categoryFilter === 'all' ? '' : `${categoryFilter} `}bills right now.` : 'You are all caught up.'}</Text><Text className="mt-2 text-sm leading-6 text-muted">Choose another category or check back for more verified demo bills.</Text><Pressable onPress={() => void refresh()} className="mt-6 rounded-2xl bg-pine p-4"><Text className="text-center font-bold text-white">Refresh feed</Text></Pressable></View>}</View>}
    {error && <Text className="mt-4 text-sm font-medium text-red-700">{error}</Text>}
  </ScrollView>
    <CheckoutSheet bill={selectedBill} onClose={() => { setSelectedBill(null); void refresh(); }} onComplete={handleComplete} />
  </View>;
}
