import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { calculateSponsoredDonationSplit, calculateSponsorMatchCents, formatCurrency, PITCH_CARDS } from '@open-relief/shared';
import type { PitchCard } from '@open-relief/shared';
import type { FeedBill } from './api';
import { SwipeableBillCard } from './SwipeableBillCard';

type DemoReceipt = { card: PitchCard; donorCents: number; matchCents: number; chargeCents: number; toCreditorCents: number; remainingCents: number };
const startingBalances = Object.fromEntries(PITCH_CARDS.map((card) => [card.id, card.balanceCents]));

function asFeedBill(card: PitchCard, remainingCents: number): FeedBill {
  return {
    id: card.id, billerName: card.billerName, category: card.category, zipCode: null, story: card.story,
    statementBalanceCents: card.balanceCents, remainingBalanceCents: remainingCents, status: 'verified',
    isShutoffNotice: true, daysUntilDisconnection: card.region === 'US' ? 2 : null, accountLast4: card.accountLast4,
    sponsor: card.sponsorName ? { id: card.id, name: card.sponsorName, matchRatio: card.matchRatio, remainingMatchBudgetCents: remainingCents, remainingFeeBufferCents: 1_000 } : null,
    currency: card.currency, locationLabel: card.location, urgencyLabel: card.urgency, railLabel: card.railLabel,
  };
}

export function OfflineDemoScreen() {
  const sheet = useRef<BottomSheetModal>(null);
  const [balances, setBalances] = useState<Record<string, number>>(startingBalances);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<PitchCard | null>(null);
  const [percentage, setPercentage] = useState<25 | 50 | 100>(50);
  const [tipPercentage, setTipPercentage] = useState<0 | 10 | 15 | 20>(0);
  const [coverProcessingFee, setCoverProcessingFee] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null);
  const card = PITCH_CARDS[index % PITCH_CARDS.length]!;
  const remaining = selected ? balances[selected.id] ?? selected.balanceCents : 0;
  const donorCents = selected && remaining > 0 ? Math.max(1, Math.round(remaining * percentage / 100)) : 0;
  const matchCents = selected && selected.matchRatio > 0 && donorCents > 0
    ? calculateSponsorMatchCents(donorCents, selected.matchRatio, remaining - donorCents) : 0;
  const split = useMemo(() => selected && donorCents > 0
    ? calculateSponsoredDonationSplit({ billAmountCents: donorCents, sponsorMatchCents: matchCents, coverProcessingFee, tipPercentage, feeBufferAvailableCents: selected.sponsorName ? 1_000 : 0 })
    : null, [selected, donorCents, matchCents, coverProcessingFee, tipPercentage]);

  function openCheckout(next: PitchCard) {
    if ((balances[next.id] ?? 0) <= 0) { setIndex((value) => value + 1); return; }
    setSelected(next);
    setPercentage(next.sponsorName ? 50 : 100);
    setTipPercentage(0);
    setCoverProcessingFee(true);
    setAccepted(false);
    requestAnimationFrame(() => sheet.current?.present());
  }

  function simulate() {
    if (!selected || !split || split.requiresDonorFeeCoverage || !accepted) return;
    const nextBalance = remaining - split.totalDisbursementToCreditorCents;
    setBalances((current) => ({ ...current, [selected.id]: nextBalance }));
    setReceipt({ card: selected, donorCents, matchCents, chargeCents: split.totalChargeCents, toCreditorCents: split.totalDisbursementToCreditorCents, remainingCents: nextBalance });
    sheet.current?.dismiss();
    setSelected(null);
  }

  return <View className="flex-1 bg-canvas">
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 45 }}>
      <View className="flex-row items-center justify-between"><View className="h-11 w-11 items-center justify-center rounded-2xl bg-pine-dark"><Text className="font-black text-white">or.</Text></View><View className="rounded-full bg-mint px-4 py-2"><Text className="text-xs font-black text-pine-dark">OFFLINE PITCH DEMO</Text></View></View>
      <Text className="mt-5 text-4xl font-black leading-tight text-ink">Relief, directly{"\n"}to a creditor.</Text>
      <Text className="mt-2 text-sm leading-6 text-muted">Four fictional bills. Simulated payments only. No card, bank, or network connection is used.</Text>
      {receipt ? <View className="mt-6 rounded-3xl bg-pine-dark p-6">
        <Text className="text-4xl font-black text-mint">✓</Text><Text className="mt-3 text-xs font-black tracking-widest text-mint">SIMULATED CONFIRMATION</Text>
        <Text className="mt-2 text-3xl font-black text-white">Bill relieved.</Text>
        <Text className="mt-3 text-sm leading-6 text-white/80">{formatCurrency(receipt.donorCents, receipt.card.currency)} demo gift{receipt.matchCents > 0 ? ` + ${formatCurrency(receipt.matchCents, receipt.card.currency)} fictional match` : ''} toward {receipt.card.billerName}.</Text>
        <View className="mt-5 rounded-2xl bg-white/10 p-4"><Text className="text-sm text-white">Illustrative creditor amount: {formatCurrency(receipt.toCreditorCents, receipt.card.currency)}</Text><Text className="mt-2 text-sm text-white">Illustrative donor total: {formatCurrency(receipt.chargeCents, receipt.card.currency)}</Text><Text className="mt-2 text-sm text-white">Remaining: {formatCurrency(receipt.remainingCents, receipt.card.currency)}</Text></View>
        <Text className="mt-4 text-xs leading-5 text-white/70">No charge, transfer, verified creditor settlement, or tax-deductible receipt occurred.</Text>
        <Pressable accessibilityRole="button" onPress={() => { setReceipt(null); setIndex((value) => value + 1); }} className="mt-5 rounded-2xl bg-mint p-4"><Text className="text-center font-black text-pine-dark">Explore next bill →</Text></Pressable>
      </View> : <>
        <View className="mt-6 flex-row justify-between"><Text className="text-xs font-black tracking-widest text-pine">PITCH DECK</Text><Text className="text-xs font-bold text-muted">{index % PITCH_CARDS.length + 1} / {PITCH_CARDS.length}</Text></View>
        <SwipeableBillCard key={`${card.id}-${index}-${selected ? 'open' : 'closed'}`} bill={asFeedBill(card, balances[card.id] ?? card.balanceCents)} onGive={() => openCheckout(card)} onPass={() => setIndex((value) => value + 1)} />
        <Pressable accessibilityRole="button" onPress={() => { setBalances({ ...startingBalances }); setIndex(0); }} className="mt-5 p-3"><Text className="text-center text-sm font-bold text-pine">Reset demo balances</Text></Pressable>
      </>}
      <Text className="mt-5 text-center text-xs leading-5 text-muted">US card-fee estimates are illustrative. EUR cards show a proposed SEPA creditor-reference flow; EU payment rails and pricing are not implemented.</Text>
    </ScrollView>
    <BottomSheetModal ref={sheet} snapPoints={['82%']} onDismiss={() => setSelected(null)} backgroundStyle={{ backgroundColor: '#F6F6F1' }}>
      <BottomSheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 44 }}>
        <Text className="text-xs font-black tracking-widest text-pine">OFFLINE CHECKOUT SIMULATION</Text>
        <Text className="mt-2 text-2xl font-black text-ink">{selected?.billerName}</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">{selected?.railLabel}. No payment is submitted.</Text>
        <Text className="mt-6 text-xs font-black tracking-widest text-pine">YOUR CONTRIBUTION</Text>
        <View className="mt-3 flex-row gap-2">{([25, 50, 100] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setPercentage(value)} className={`min-h-12 flex-1 items-center justify-center rounded-xl ${percentage === value ? 'bg-pine-dark' : 'bg-white'}`}><Text className={`font-black ${percentage === value ? 'text-white' : 'text-ink'}`}>{value}%</Text></Pressable>)}</View>
        <Text className="mt-4 text-2xl font-black text-ink">{selected ? formatCurrency(donorCents, selected.currency) : ''}</Text>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: coverProcessingFee }} onPress={() => setCoverProcessingFee((value) => !value)} className="mt-5 rounded-2xl bg-mint p-4"><Text className="font-bold text-pine-dark">{coverProcessingFee ? '✓ ' : '○ '}Cover estimated processing fee</Text></Pressable>
        {split?.requiresDonorFeeCoverage && <Text className="mt-2 text-sm font-bold text-amber">Cover processing to continue; no sponsor fee buffer is available.</Text>}
        <Text className="mt-6 text-xs font-black tracking-widest text-pine">OPTIONAL PLATFORM TIP</Text>
        <View className="mt-3 flex-row gap-2">{([0, 10, 15, 20] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setTipPercentage(value)} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${tipPercentage === value ? 'bg-pine-dark' : 'bg-white'}`}><Text className={`font-black ${tipPercentage === value ? 'text-white' : 'text-ink'}`}>{value}%</Text></Pressable>)}</View>
        {split && selected && <View className="mt-5 rounded-2xl bg-white p-5"><Text className="font-black text-ink">Illustrative split</Text><Text className="mt-3 text-sm text-muted">Donor: {formatCurrency(donorCents, selected.currency)}</Text><Text className="mt-2 text-sm text-muted">Fictional match: {formatCurrency(matchCents, selected.currency)}</Text><Text className="mt-2 text-sm text-muted">To creditor in simulation: {formatCurrency(split.totalDisbursementToCreditorCents, selected.currency)}</Text><Text className="mt-2 text-sm text-muted">Processing estimate: {formatCurrency(split.stripeFeeCents, selected.currency)}</Text><Text className="mt-2 text-sm text-muted">Optional tip: {formatCurrency(split.platformTipCents, selected.currency)}</Text><Text className="mt-4 text-lg font-black text-pine-dark">Demo total: {formatCurrency(split.totalChargeCents, selected.currency)}</Text></View>}
        {selected?.currency === 'EUR' && <Text className="mt-3 text-xs leading-5 text-amber">EUR fee numbers use the US sandbox formula solely to illustrate the screen. EU processor terms are unconfigured.</Text>}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} className="mt-5 rounded-2xl bg-white p-4"><Text className="text-sm leading-5 text-ink">{accepted ? '☑' : '☐'} I understand this is a fictional offline simulation, with no payment or charitable tax receipt.</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!split || split.requiresDonorFeeCoverage || !accepted} onPress={simulate} className={`mt-5 min-h-14 items-center justify-center rounded-2xl p-4 ${split && !split.requiresDonorFeeCoverage && accepted ? 'bg-pine' : 'bg-muted'}`}><Text className="font-black text-white">Simulate direct creditor payment →</Text></Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  </View>;
}
