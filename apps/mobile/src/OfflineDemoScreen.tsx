import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { calculateSponsoredDonationSplit, calculateSponsorMatchCents, formatCurrency } from '@open-relief/shared';
import type { PitchCard } from '@open-relief/shared';
import type { FeedBill } from './api';
import { SwipeableBillCard } from './SwipeableBillCard';
import { COLORS, PrimaryButton, ReceiptRow } from './design';
import { DemoGiftSchema } from './OfflineDemoFlow';
import type { DemoGift } from './OfflineDemoFlow';

type DemoReceipt = { card: PitchCard; donorCents: number; matchCents: number; chargeCents: number; toCreditorCents: number; remainingCents: number };
const categoryFilters = ['all', 'electric', 'water', 'gas', 'medical', 'telecom'] as const;

function asFeedBill(card: PitchCard, remainingCents: number): FeedBill {
  return {
    id: card.id, billerName: card.billerName, category: card.category, zipCode: null, story: card.story,
    statementBalanceCents: card.balanceCents, remainingBalanceCents: remainingCents, status: 'verified',
    isShutoffNotice: true, daysUntilDisconnection: card.region === 'US' ? 2 : null, accountLast4: card.accountLast4,
    sponsor: card.sponsorName ? { id: card.id, name: card.sponsorName, matchRatio: card.matchRatio, remainingMatchBudgetCents: remainingCents, remainingFeeBufferCents: 1_000 } : null,
    currency: card.currency, locationLabel: card.location, urgencyLabel: card.urgency, railLabel: card.railLabel,
  };
}

export function OfflineDemoScreen({ cards, balances, onBalanceChange, onGift, onReset }: {
  cards: PitchCard[];
  balances: Record<string, number>;
  onBalanceChange(id: string, remainingCents: number): void;
  onGift(gift: DemoGift): void;
  onReset(): void;
}) {
  const sheet = useRef<BottomSheetModal>(null);
  const [index, setIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<(typeof categoryFilters)[number]>('all');
  const [selected, setSelected] = useState<PitchCard | null>(null);
  const [percentage, setPercentage] = useState<25 | 50 | 100>(50);
  const [customAmount, setCustomAmount] = useState('');
  const [tipPercentage, setTipPercentage] = useState<0 | 10 | 15 | 20>(0);
  const [coverProcessingFee, setCoverProcessingFee] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null);
  const availableCards = cards.filter((item) => (categoryFilter === 'all' || item.category === categoryFilter) && (balances[item.id] ?? item.balanceCents) > 0);
  const card = availableCards.length ? availableCards[index % availableCards.length] : null;
  const remaining = selected ? balances[selected.id] ?? selected.balanceCents : 0;
  const customValid = /^\d{1,6}(?:[.,]\d{1,2})?$/.test(customAmount);
  const customCents = customValid ? Math.round(Number(customAmount.replace(',', '.')) * 100) : 0;
  const donorCents = selected && remaining > 0 ? customAmount ? customCents : Math.max(1, Math.round(remaining * percentage / 100)) : 0;
  const matchCents = selected && selected.matchRatio > 0 && donorCents > 0 && donorCents <= remaining
    ? calculateSponsorMatchCents(donorCents, selected.matchRatio, remaining - donorCents) : 0;
  const split = useMemo(() => selected && donorCents > 0 && donorCents <= remaining
    ? calculateSponsoredDonationSplit({ billAmountCents: donorCents, sponsorMatchCents: matchCents, coverProcessingFee, tipPercentage, feeBufferAvailableCents: selected.sponsorName ? 1_000 : 0 })
    : null, [selected, donorCents, matchCents, coverProcessingFee, tipPercentage]);

  function openCheckout(next: PitchCard) {
    if ((balances[next.id] ?? 0) <= 0) { setIndex((value) => value + 1); return; }
    setSelected(next);
    setPercentage(next.sponsorName ? 50 : 100);
    setCustomAmount('');
    setTipPercentage(0);
    setCoverProcessingFee(true);
    setAccepted(false);
    requestAnimationFrame(() => sheet.current?.present());
  }

  function simulate() {
    if (!selected || !split || split.requiresDonorFeeCoverage || !accepted) return;
    const nextBalance = remaining - split.totalDisbursementToCreditorCents;
    onBalanceChange(selected.id, nextBalance);
    onGift(DemoGiftSchema.parse({ billId: selected.id, creditorName: selected.billerName, currency: selected.currency, donorCents, matchCents, creditorCents: split.totalDisbursementToCreditorCents, donorTotalCents: split.totalChargeCents, remainingCents: nextBalance, createdAt: new Date().toISOString() }));
    setReceipt({ card: selected, donorCents, matchCents, chargeCents: split.totalChargeCents, toCreditorCents: split.totalDisbursementToCreditorCents, remainingCents: nextBalance });
    sheet.current?.dismiss();
    setSelected(null);
  }

  return <View className="flex-1">
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }}>
      <Text className="text-[11px] font-bold tracking-[2px] text-pine">DIRECT RELIEF · ZERO CASH OUT</Text>
      <Text className="mt-3 text-4xl font-black leading-[44px] tracking-tight text-ink">Relief, directly{'\n'}to a creditor.</Text>
      <Text className="mt-3 text-sm leading-6 text-muted">Explore {cards.length} fictional bills across five categories. Simulated payments only; no card, bank, or network connection is used.</Text>
      <View className="mt-5 rounded-2xl border border-[#24563F] bg-[#0D2A1D] p-4"><Text className="text-xs font-bold text-mint">Explore the complete walkthrough</Text><Text className="mt-1 text-xs leading-5 text-muted">Use the four tabs below to give, submit a sample bill, review it, and view your demo activity.</Text></View>
      {receipt ? <View className="mt-7 rounded-[28px] border border-line bg-surface p-6">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-pine"><Text className="text-3xl font-black text-canvas">✓</Text></View>
        <Text className="mt-6 text-[11px] font-bold tracking-[2px] text-pine">SIMULATED CONFIRMATION</Text>
        <Text className="mt-2 text-3xl font-black tracking-tight text-ink">Bill relieved.</Text>
        <Text className="mt-3 text-sm leading-6 text-muted">{formatCurrency(receipt.donorCents, receipt.card.currency)} demo gift{receipt.matchCents > 0 ? ` plus ${formatCurrency(receipt.matchCents, receipt.card.currency)} fictional match` : ''} toward {receipt.card.billerName}.</Text>
        <View className="mt-6 rounded-2xl border border-[#162920] bg-inset p-4">
          <ReceiptRow label="Your contribution" value={formatCurrency(receipt.donorCents, receipt.card.currency)} />
          {receipt.matchCents > 0 && <ReceiptRow label="Fictional sponsor match" value={`+${formatCurrency(receipt.matchCents, receipt.card.currency)}`} />}
          <ReceiptRow label="Creditor amount" value={formatCurrency(receipt.toCreditorCents, receipt.card.currency)} emphasis />
          <ReceiptRow label="Illustrative donor total" value={formatCurrency(receipt.chargeCents, receipt.card.currency)} />
          <ReceiptRow label="Remaining balance" value={formatCurrency(receipt.remainingCents, receipt.card.currency)} badge />
        </View>
        <Text className="mt-4 text-[11px] leading-5 text-muted">No charge, transfer, verified creditor settlement, or tax-deductible receipt occurred.</Text>
        <View className="mt-6"><PrimaryButton label="Explore next bill  →" onPress={() => { setIndex((value) => receipt.remainingCents === 0 ? value : value + 1); setReceipt(null); }} /></View>
      </View> : <>
        <View className="mt-8 flex-row justify-between"><Text className="text-[11px] font-bold tracking-widest text-ink">FICTIONAL BILL DECK</Text><Text className="text-xs font-bold text-muted">{availableCards.length ? index % availableCards.length + 1 : 0} / {availableCards.length}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-4" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>{categoryFilters.map((filter) => <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: categoryFilter === filter }} onPress={() => { setCategoryFilter(filter); setIndex(0); }} className={`min-h-10 items-center justify-center rounded-full border px-4 ${categoryFilter === filter ? 'border-pine bg-[#0D2A1D]' : 'border-line bg-surface'}`}><Text className={`text-xs font-bold capitalize ${categoryFilter === filter ? 'text-mint' : 'text-muted'}`}>{filter === 'all' ? 'All bills' : filter}</Text></Pressable>)}</ScrollView>
        {card ? <SwipeableBillCard key={`${card.id}-${index}-${selected ? 'open' : 'closed'}`} bill={asFeedBill(card, balances[card.id] ?? card.balanceCents)} onGive={() => openCheckout(card)} onPass={() => setIndex((value) => value + 1)} /> : <View className="mt-5 rounded-[28px] border border-line bg-surface p-6"><Text className="text-xl font-black text-ink">No more bills in this view.</Text><Text className="mt-2 text-sm leading-5 text-muted">Try another category or reset the fictional balances.</Text><View className="mt-5"><PrimaryButton label="Reset demo gifts" onPress={() => { onReset(); setIndex(0); }} outline /></View></View>}
      </>}
      <Text className="mt-6 text-center text-[11px] leading-5 text-muted">US card-fee estimates are illustrative. EUR cards show a proposed SEPA creditor-reference flow; EU payment rails and pricing are not implemented.</Text>
    </ScrollView>
    <BottomSheetModal ref={sheet} snapPoints={['88%']} onDismiss={() => setSelected(null)} backgroundStyle={{ backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1 }} handleIndicatorStyle={{ backgroundColor: '#4B6354', width: 48, height: 5 }}>
      <BottomSheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 44 }}>
        <Text className="text-[11px] font-bold tracking-[2px] text-pine">OFFLINE CHECKOUT SIMULATION</Text>
        <Text className="mt-2 text-2xl font-black tracking-tight text-ink">{selected?.billerName}</Text>
        <Text className="mt-2 text-xs leading-5 text-muted">{selected?.railLabel}. No payment is submitted.</Text>
        <View className="mt-5 rounded-[24px] border border-line bg-inset p-5">
          <Text className="text-[11px] font-bold tracking-widest text-pine">01  YOUR CONTRIBUTION</Text>
          <View className="mt-4 flex-row gap-2">{([25, 50, 100] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: percentage === value && !customAmount }} onPress={() => { setPercentage(value); setCustomAmount(''); }} className={`min-h-12 flex-1 items-center justify-center rounded-xl border ${percentage === value && !customAmount ? 'border-pine bg-pine' : 'border-line bg-surface'}`}><Text className={`text-sm font-black ${percentage === value && !customAmount ? 'text-canvas' : 'text-muted'}`}>{value === 100 ? 'Full' : `${value}%`}</Text></Pressable>)}</View>
          <TextInput className="mt-3 min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink" placeholder="Or enter a custom amount" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} keyboardType="decimal-pad" value={customAmount} onChangeText={setCustomAmount} />
          {customAmount && !split && <Text className="mt-2 text-xs text-coral">Enter an amount above zero and within the remaining balance.</Text>}
          <Text className="mt-4 text-2xl font-black text-ink">{selected ? formatCurrency(donorCents, selected.currency) : ''}</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: coverProcessingFee }} onPress={() => setCoverProcessingFee((value) => !value)} className="mt-4 flex-row items-center rounded-[24px] border border-line bg-surface p-5"><View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${coverProcessingFee ? 'bg-pine' : 'border border-line bg-inset'}`}><Text className="font-black text-canvas">{coverProcessingFee ? '✓' : ''}</Text></View><View className="flex-1"><Text className="text-sm font-bold text-ink">Cover estimated processing fee</Text><Text className="mt-1 text-xs text-muted">The full demo contribution reaches the creditor.</Text></View></Pressable>
        {split?.requiresDonorFeeCoverage && <View className="mt-3 rounded-2xl border border-[#543B14] bg-cream p-3"><Text className="text-sm font-bold text-amber">Fee buffer depleted. Please cover card processing.</Text></View>}
        <Text className="mt-6 text-[11px] font-bold tracking-widest text-pine">02  OPTIONAL PLATFORM TIP</Text>
        <View className="mt-3 flex-row gap-2">{([0, 10, 15, 20] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tipPercentage === value }} onPress={() => setTipPercentage(value)} className={`min-h-11 flex-1 items-center justify-center rounded-xl border ${tipPercentage === value ? 'border-pine bg-pine' : 'border-line bg-inset'}`}><Text className={`font-black ${tipPercentage === value ? 'text-canvas' : 'text-muted'}`}>{value}%</Text></Pressable>)}</View>
        {split && selected && <View className="mt-5 rounded-[24px] border border-line bg-inset p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">03  ILLUSTRATIVE SPLIT</Text><View className="mt-4">
          <ReceiptRow label="Your contribution" value={formatCurrency(donorCents, selected.currency)} />
          {matchCents > 0 && <ReceiptRow label="Fictional sponsor match" value={`+${formatCurrency(matchCents, selected.currency)}`} />}
          <ReceiptRow label="To creditor in simulation" value={formatCurrency(split.totalDisbursementToCreditorCents, selected.currency)} emphasis />
          <ReceiptRow label="Processing estimate" value={formatCurrency(split.stripeFeeCents, selected.currency)} />
          <ReceiptRow label="Optional tip" value={formatCurrency(split.platformTipCents, selected.currency)} />
          <View className="mt-3 h-px bg-line" /><View className="mt-2"><ReceiptRow label="Demo donor total" value={formatCurrency(split.totalChargeCents, selected.currency)} emphasis /></View>
        </View></View>}
        {selected?.currency === 'EUR' && <Text className="mt-3 text-xs leading-5 text-amber">EUR fee numbers use the US sandbox formula solely to illustrate the screen. EU processor terms are unconfigured.</Text>}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} className="mt-5 flex-row rounded-2xl border border-line bg-surface p-4"><View className={`mr-3 h-6 w-6 items-center justify-center rounded-md ${accepted ? 'bg-pine' : 'border border-line bg-inset'}`}><Text className="font-black text-canvas">{accepted ? '✓' : ''}</Text></View><Text className="flex-1 text-xs leading-5 text-muted">I understand this is a fictional offline simulation, with no payment or charitable tax receipt.</Text></Pressable>
        <View className="mt-5"><PrimaryButton disabled={!split || split.requiresDonorFeeCoverage || !accepted} onPress={simulate} label="Simulate creditor payment  →" /></View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  </View>;
}
