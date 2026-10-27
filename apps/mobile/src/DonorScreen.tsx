import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { getDonationReceipt, getFeed } from './api';
import type { DonationReceipt, FeedBill } from './api';
import { useAuth } from './AuthContext';
import { CheckoutSheet } from './CheckoutSheet';
import type { CheckoutConfirmation } from './CheckoutSheet';
import { SwipeableBillCard } from './SwipeableBillCard';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function ImpactCelebration({ confirmation, receipt, onClose }: { confirmation: CheckoutConfirmation; receipt: DonationReceipt | null; onClose(): void }) {
  const scale = useSharedValue(0.82);
  useEffect(() => { scale.value = withSpring(1, { damping: 13, stiffness: 150 }); }, [scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const confirmed = receipt !== null;
  const summary = confirmed
    ? `Your ${dollars(confirmation.amountCents)} ${confirmation.mode === 'mock' ? 'demo' : 'test'} payment was recorded for ${confirmation.billerName}, account ••••${confirmation.accountLast4 ?? 'private'}. The creditor payment is simulated.`
    : `Your ${dollars(confirmation.amountCents)} test payment was accepted. Creditor confirmation is pending.`;
  async function shareReceipt() {
    if (!receipt) return;
    await Share.share({ message: `Open Relief payment confirmation\n${summary}\nReference: ${receipt.methodDisbursementId ?? receipt.id}\n${receipt.taxNotice}` });
  }
  return <Animated.View style={animatedStyle} className="mt-4 rounded-3xl bg-emerald-950 p-6 shadow-lg">
    <View className="h-14 w-14 items-center justify-center rounded-full bg-emerald-400"><Text className="text-3xl font-black text-emerald-950">✓</Text></View>
    <Text className="mt-5 text-2xl font-black text-white">{confirmed ? 'Relief recorded' : 'Payment received'}</Text>
    <Text className="mt-3 text-base leading-6 text-emerald-50">{summary}</Text>
    {receipt ? <><View className="mt-5 rounded-2xl bg-emerald-900 p-4"><Text className="font-bold text-white">Non-deductible payment confirmation</Text><Text className="mt-2 text-sm text-emerald-100">To creditor: {dollars(receipt.amountToBillCents)} · Test total: {dollars(receipt.totalChargeCents)}</Text><Text className="mt-2 text-xs leading-4 text-emerald-100">{receipt.taxNotice}</Text></View><Pressable accessibilityRole="button" onPress={() => void shareReceipt()} className="mt-4 rounded-2xl bg-white p-4"><Text className="text-center font-bold text-emerald-950">Share confirmation</Text></Pressable></> : <Text className="mt-4 text-sm text-emerald-100">The confirmation becomes available after the webhook records the creditor payment.</Text>}
    <Pressable accessibilityRole="button" onPress={onClose} className="mt-4 p-2"><Text className="text-center font-semibold text-emerald-100">Back to bills</Text></Pressable>
  </Animated.View>;
}

export function DonorScreen() {
  const [bills, setBills] = useState<FeedBill[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedBill, setSelectedBill] = useState<FeedBill | null>(null);
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(null);
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();

  async function refresh() {
    setLoading(true);
    try { setBills(await getFeed()); setIndex(0); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load bills'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

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

  const current = bills[index];
  return <View className="flex-1 bg-slate-50 px-5 pt-5">
    <Text className="text-xs font-bold uppercase tracking-widest text-emerald-700">Open Relief</Text>
    <Text className="mt-2 text-4xl font-black text-slate-900">Make an impact.</Text>
    <Text className="mt-2 text-sm leading-5 text-slate-600">Pay a verified demo creditor account directly. No cash goes to recipients.</Text>
    {confirmation ? <ImpactCelebration confirmation={confirmation} receipt={receipt} onClose={() => setConfirmation(null)} />
      : <View className="mt-5 flex-1">{loading ? <ActivityIndicator /> : current ? <SwipeableBillCard key={`${current.id}-${selectedBill ? 'open' : 'closed'}`} bill={current} onGive={() => setSelectedBill(current)} onPass={() => setIndex((value) => value + 1)} /> : <View className="mt-12 rounded-3xl bg-white p-7"><Text className="text-xl font-bold text-slate-900">You are all caught up.</Text><Text className="mt-2 text-slate-600">Check back for more verified demo bills.</Text><Pressable onPress={() => void refresh()} className="mt-5 rounded-2xl bg-emerald-600 p-4"><Text className="text-center font-bold text-white">Refresh feed</Text></Pressable></View>}</View>}
    {error && <Text className="mb-3 text-sm text-red-700">{error}</Text>}
    <CheckoutSheet bill={selectedBill} onClose={() => setSelectedBill(null)} onComplete={handleComplete} />
  </View>;
}
