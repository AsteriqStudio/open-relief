import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FEATURED_MARKETS, formatCurrency } from '@open-relief/shared';
import { PrimaryButton, ReceiptRow } from './design';
import { LegalModal } from './LegalModal';
import type { LegalDocument } from './LegalModal';
import type { DemoGift, DemoSubmission } from './OfflineDemoFlow';

export function OfflineProfileScreen({ gifts, submissions, onReset, onNavigate }: {
  gifts: DemoGift[];
  submissions: DemoSubmission[];
  onReset(): void;
  onNavigate(tab: 'give' | 'need' | 'review'): void;
}) {
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const usdCents = gifts.filter((gift) => gift.currency === 'USD').reduce((total, gift) => total + gift.creditorCents, 0);
  const eurCents = gifts.filter((gift) => gift.currency === 'EUR').reduce((total, gift) => total + gift.creditorCents, 0);
  const matched = gifts.filter((gift) => gift.matchCents > 0).length;
  const relieved = new Set(gifts.filter((gift) => gift.remainingCents === 0).map((gift) => gift.billId)).size;
  return <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }}>
    <Text className="text-[11px] font-bold tracking-[2px] text-pine">DEMO DASHBOARD</Text>
    <Text className="mt-3 text-4xl font-black tracking-tight text-ink">Your walkthrough.</Text>
    <Text className="mt-3 text-sm leading-6 text-muted">A local record of the actions you simulated in this session. It resets when the app closes.</Text>
    <View className="mt-6 rounded-[28px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">ILLUSTRATIVE CREDITOR AID</Text>
      <Text className="mt-3 text-3xl font-black text-ink">{formatCurrency(usdCents, 'USD')}</Text><Text className="mt-1 text-sm font-bold text-mint">{formatCurrency(eurCents, 'EUR')} in EUR cards</Text>
      <View className="mt-5 flex-row rounded-2xl border border-[#162920] bg-inset py-4"><View className="flex-1 items-center"><Text className="text-xl font-black text-mint">{gifts.length}</Text><Text className="mt-1 text-[11px] text-muted">Demo gifts</Text></View><View className="flex-1 items-center border-l border-line"><Text className="text-xl font-black text-mint">{relieved}</Text><Text className="mt-1 text-[11px] text-muted">Cards relieved</Text></View><View className="flex-1 items-center border-l border-line"><Text className="text-xl font-black text-mint">{matched}</Text><Text className="mt-1 text-[11px] text-muted">Fictional matches</Text></View></View>
      <Text className="mt-4 text-[11px] leading-5 text-muted">These totals reflect local simulations only. No real debt was paid or financial impact measured.</Text>
    </View>
    <View className="mt-5 rounded-[28px] border border-line bg-surface p-5"><Text className="text-lg font-black text-ink">Activity</Text>
      {gifts.length ? gifts.slice().reverse().map((gift, index) => <View key={`${gift.billId}-${gift.createdAt}-${index}`} className="mt-4 rounded-2xl border border-[#162920] bg-inset p-4"><Text className="text-sm font-bold text-ink">{gift.creditorName}</Text><View className="mt-2"><ReceiptRow label="Demo creditor amount" value={formatCurrency(gift.creditorCents, gift.currency)} /><ReceiptRow label="Illustrative donor total" value={formatCurrency(gift.donorTotalCents, gift.currency)} /></View></View>) : <Text className="mt-3 text-sm leading-5 text-muted">No simulated gifts yet. Open Give and try a fictional bill.</Text>}
    </View>
    <View className="mt-5 rounded-[28px] border border-line bg-surface p-5"><Text className="text-lg font-black text-ink">Explore every role</Text><Text className="mt-2 text-sm leading-5 text-muted">The offline APK includes a donor deck, sample recipient intake, and a fictional review queue.</Text>
      <View className="mt-4 flex-row flex-wrap gap-2">{([['give', 'Give relief'], ['need', 'Need help'], ['review', 'Review queue']] as const).map(([tab, label]) => <Pressable key={tab} accessibilityRole="button" onPress={() => onNavigate(tab)} className="rounded-full border border-pine bg-[#0D2A1D] px-4 py-2"><Text className="text-xs font-bold text-mint">{label} →</Text></Pressable>)}</View>
      <Text className="mt-4 text-xs leading-5 text-muted">The connected sandbox also has real sign-in, document upload, OCR, admin audit, and Stripe test checkout. Those require its API and are not active in this offline APK.</Text>
    </View>
    <View className="mt-5 rounded-[28px] border border-line bg-surface p-5"><Text className="text-lg font-black text-ink">Where could this work?</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">Relief can expand country by country when creditor routing, payment partners, compliance, and fee funding are ready. No country has a public service yet.</Text>
      {FEATURED_MARKETS.map((market) => <View key={market.countryCode} className="mt-3 rounded-2xl border border-line bg-inset p-3"><Text className="text-sm font-bold text-ink">{market.name} · {market.countryCode}</Text><Text className="mt-1 text-xs leading-5 text-muted">{market.state === 'connected_sandbox' ? 'Connected US sandbox; simulated creditor settlement only.' : market.state === 'offline_concept' ? 'Fictional EUR screen concept; no connected payment rail.' : 'No country-specific flow is built yet.'}</Text></View>)}
      <Text className="mt-3 text-xs leading-5 text-muted">Other countries can be assessed for future pilots. A card in this walkthrough does not mean local service is available.</Text>
    </View>
    <View className="mt-5 rounded-[28px] border border-line bg-surface p-5"><Text className="text-lg font-black text-ink">Legal & privacy</Text><Text className="mt-2 text-sm leading-5 text-muted">The product policies below are drafts for the connected sandbox. This offline walkthrough sends no data to its server.</Text>
      <View className="mt-5"><PrimaryButton label="Payment & legal details  →" onPress={() => setLegalDocument('payment')} outline /></View>
      <View className="mt-5 flex-row gap-6"><Pressable accessibilityRole="button" onPress={() => setLegalDocument('terms')}><Text className="text-sm font-bold text-mint">Terms</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLegalDocument('privacy')}><Text className="text-sm font-bold text-mint">Privacy</Text></Pressable></View>
    </View>
    <View className="mt-6"><PrimaryButton label={`Reset walkthrough (${submissions.length} sample bills)`} onPress={onReset} outline /></View>
    <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
  </ScrollView>;
}
