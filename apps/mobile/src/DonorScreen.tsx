import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { calculateDonationSplit } from '@open-relief/shared';
import { getFeed, simulateDonation } from './api';
import type { FeedBill } from './api';
import { useAuth } from './AuthContext';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function SwipeableBillCard({ bill, onGive, onPass }: { bill: FeedBill; onGive(): void; onPass(): void }) {
  const offset = useSharedValue(0);
  const gesture = Gesture.Pan().onUpdate((event) => { offset.value = event.translationX; }).onEnd((event) => {
    if (event.translationX > 110) runOnJS(onGive)();
    else if (event.translationX < -110) runOnJS(onPass)();
    offset.value = withSpring(0);
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }, { rotate: `${offset.value / 30}deg` }] }));
  const total = bill.statementBalanceCents ?? 0;
  const remaining = bill.remainingBalanceCents ?? 0;
  const progress = total > 0 ? (total - remaining) / total : 0;
  return <GestureDetector gesture={gesture}>
    <Animated.View style={style} className="rounded-3xl bg-white p-6 shadow-lg">
      <View className="flex-row items-center justify-between"><Text className="text-4xl">{bill.category === 'electric' ? '⚡' : bill.category === 'water' ? '💧' : bill.category === 'gas' ? '🔥' : '🏥'}</Text><Text className="rounded-full bg-teal-100 px-3 py-2 text-teal-800">✓ Verified demo biller</Text></View>
      <Text className="mt-5 text-2xl font-bold text-slate-900">{bill.billerName ?? 'Verified biller'}</Text>
      <Text className="mt-2 text-slate-600">ZIP {bill.zipCode ?? 'hidden'} · {bill.story ?? 'A household needs help with an overdue bill'}</Text>
      <Text className="mt-6 text-slate-500">{dollars(total - remaining)} funded of {dollars(total)}</Text>
      <View className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200"><View className="h-3 rounded-full bg-teal-600" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></View>
      <Text className="mt-5 text-xl font-semibold text-slate-900">{dollars(remaining)} still needed</Text>
      <Text className="mt-4 text-slate-500">Swipe right to give · Swipe left to pass</Text>
      <View className="mt-5 flex-row gap-3"><Pressable onPress={onPass} className="flex-1 rounded-xl bg-slate-200 p-3"><Text className="text-center">Pass</Text></Pressable><Pressable onPress={onGive} className="flex-1 rounded-xl bg-teal-700 p-3"><Text className="text-center font-semibold text-white">Give help</Text></Pressable></View>
    </Animated.View>
  </GestureDetector>;
}

function CheckoutSheet({ bill, onClose, onComplete }: { bill: FeedBill | null; onClose(): void; onComplete(): void }) {
  const { token } = useAuth();
  const sheet = useRef<BottomSheetModal>(null);
  const [percentage, setPercentage] = useState<25 | 50 | 100 | null>(null);
  const [tipPercentage, setTipPercentage] = useState<0 | 10 | 15 | 20 | null>(null);
  const [coverProcessingFee, setCoverProcessingFee] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (bill) {
      setPercentage(null);
      setTipPercentage(null);
      setCoverProcessingFee(true);
      setError(null);
      requestAnimationFrame(() => sheet.current?.present());
    }
  }, [bill]);
  const amountCents = bill && percentage ? Math.max(1, Math.round((bill.remainingBalanceCents ?? 0) * percentage / 100)) : null;
  const split = useMemo(() => amountCents && tipPercentage !== null ? calculateDonationSplit({ billAmountCents: amountCents, coverProcessingFee, tipPercentage }) : null, [amountCents, coverProcessingFee, tipPercentage]);

  async function donate() {
    if (!bill || !amountCents || !split || tipPercentage === null || !token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await simulateDonation({ billId: bill.id, billAmountCents: amountCents, coverProcessingFee, tipPercentage }, token);
      sheet.current?.dismiss();
      onComplete();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Demo payment failed');
    } finally {
      setBusy(false);
    }
  }

  return <BottomSheetModal ref={sheet} snapPoints={['75%']} onDismiss={onClose} enablePanDownToClose>
    <BottomSheetView style={{ padding: 20 }}>
      <Text className="text-2xl font-bold">Help pay this bill</Text>
      <Text className="mt-1 text-slate-500">Demo only. No card is charged and no funds move.</Text>
      <Text className="mt-5 font-semibold">Choose bill amount</Text>
      <View className="mt-2 flex-row gap-2">{([25, 50, 100] as const).map((value) => <Pressable key={value} onPress={() => setPercentage(value)} className={`flex-1 rounded-xl p-3 ${percentage === value ? 'bg-teal-700' : 'bg-slate-200'}`}><Text className={`text-center ${percentage === value ? 'text-white' : 'text-slate-900'}`}>{value === 100 ? 'Full bill' : `${value}%`}</Text></Pressable>)}</View>
      <Pressable onPress={() => setCoverProcessingFee((value) => !value)} className="mt-5 rounded-xl bg-slate-100 p-3"><Text>{coverProcessingFee ? '☑' : '□'} Cover payment processing fee {split ? `(${dollars(split.stripeFeeCents)})` : ''}</Text></Pressable>
      <Text className="mt-5 font-semibold">Voluntary tip</Text>
      <View className="mt-2 flex-row gap-2">{([0, 10, 15, 20] as const).map((value) => <Pressable key={value} onPress={() => setTipPercentage(value)} className={`flex-1 rounded-xl p-3 ${tipPercentage === value ? 'bg-teal-700' : 'bg-slate-200'}`}><Text className={`text-center ${tipPercentage === value ? 'text-white' : 'text-slate-900'}`}>{value}%</Text></Pressable>)}</View>
      {split && <View className="mt-5 rounded-xl bg-slate-100 p-4"><Text>Bill gets: {dollars(split.netPaymentToBillerCents)}</Text><Text>Processing: {dollars(split.stripeFeeCents)}</Text><Text>Tip: {dollars(split.platformTipCents)}</Text><Text className="mt-2 font-bold">Total: {dollars(split.totalChargeCents)}</Text></View>}
      {error && <Text className="mt-3 text-red-700">{error}</Text>}
      <Pressable disabled={!split || busy} onPress={() => void donate()} className={`mt-5 rounded-xl p-4 ${split && !busy ? 'bg-teal-700' : 'bg-slate-400'}`}><Text className="text-center font-semibold text-white">{busy ? 'Simulating...' : 'Simulate card or wallet payment'}</Text></Pressable>
      <Text className="mt-3 text-center text-xs text-slate-500">Apple Pay, Google Pay, and real cards require a separate Stripe sandbox integration.</Text>
    </BottomSheetView>
  </BottomSheetModal>;
}

export function DonorScreen() {
  const [bills, setBills] = useState<FeedBill[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedBill, setSelectedBill] = useState<FeedBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    setLoading(true);
    try { setBills(await getFeed()); setIndex(0); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load bills'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const current = bills[index];
  return <View className="flex-1 bg-slate-50 p-5">
    <Text className="text-3xl font-bold text-slate-900">Give Help</Text>
    <Text className="mt-2 text-slate-600">Swipe to choose a verified demo bill.</Text>
    <View className="mt-8 flex-1">{loading ? <ActivityIndicator /> : current ? <SwipeableBillCard bill={current} onGive={() => setSelectedBill(current)} onPass={() => setIndex((value) => value + 1)} /> : <View className="rounded-2xl bg-white p-6"><Text>No more bills in this deck.</Text><Pressable onPress={() => void refresh()} className="mt-4 rounded-xl bg-teal-700 p-3"><Text className="text-center text-white">Refresh feed</Text></Pressable></View>}</View>
    {error && <Text className="text-red-700">{error}</Text>}
    <CheckoutSheet bill={selectedBill} onClose={() => setSelectedBill(null)} onComplete={() => void refresh()} />
  </View>;
}
