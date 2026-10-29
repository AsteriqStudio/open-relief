import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PITCH_CARDS } from '@open-relief/shared';
import { BrandHeader } from './design';
import { OfflineAdminScreen } from './OfflineAdminScreen';
import { OfflineDemoScreen } from './OfflineDemoScreen';
import { approvedDemoCards, INITIAL_DEMO_SUBMISSIONS, reviewDemoSubmission } from './OfflineDemoFlow';
import type { DemoGift, DemoSubmission } from './OfflineDemoFlow';
import { OfflineProfileScreen } from './OfflineProfileScreen';
import { OfflineRecipientScreen } from './OfflineRecipientScreen';

type DemoTab = 'give' | 'need' | 'review' | 'profile';
const tabs: { id: DemoTab; label: string; icon: string }[] = [
  { id: 'give', label: 'Give', icon: '◇' },
  { id: 'need', label: 'Need help', icon: '+' },
  { id: 'review', label: 'Review', icon: '✓' },
  { id: 'profile', label: 'Profile', icon: '○' },
];
const startingBalances = Object.fromEntries(PITCH_CARDS.map((card) => [card.id, card.balanceCents]));
type DemoSession = { tab: DemoTab; submissions: DemoSubmission[]; latestId: string | null; gifts: DemoGift[]; balances: Record<string, number>; focusCardId: string | null };
let savedSession: DemoSession | null = null;

export function OfflineDemoApp({ onConnectSandbox }: { onConnectSandbox(): void }) {
  const [tab, setTab] = useState<DemoTab>(savedSession?.tab ?? 'give');
  const [submissions, setSubmissions] = useState<DemoSubmission[]>(savedSession?.submissions ?? INITIAL_DEMO_SUBMISSIONS);
  const [latestId, setLatestId] = useState<string | null>(savedSession?.latestId ?? null);
  const [gifts, setGifts] = useState<DemoGift[]>(savedSession?.gifts ?? []);
  const [balances, setBalances] = useState<Record<string, number>>(savedSession?.balances ?? startingBalances);
  const [focusCardId, setFocusCardId] = useState<string | null>(savedSession?.focusCardId ?? null);
  useEffect(() => { savedSession = { tab, submissions, latestId, gifts, balances, focusCardId }; }, [tab, submissions, latestId, gifts, balances, focusCardId]);
  const cards = useMemo(() => [...PITCH_CARDS, ...approvedDemoCards(submissions)], [submissions]);
  const pendingCount = submissions.filter((submission) => submission.status === 'pending_review').length;

  function resetGifts() {
    setBalances(Object.fromEntries(cards.map((card) => [card.id, card.balanceCents])));
    setGifts([]);
  }
  function resetAll() {
    setSubmissions(INITIAL_DEMO_SUBMISSIONS);
    setLatestId(null);
    setBalances({ ...startingBalances });
    setGifts([]);
    setFocusCardId(null);
    setTab('give');
  }

  return <View className="flex-1">
    <View className="border-b border-line px-5 py-3"><BrandHeader mode="offline" subtitle="Explore every role · fictional data" /></View>
    {tab === 'give' ? <OfflineDemoScreen cards={cards} balances={balances} focusCardId={focusCardId} onBalanceChange={(id, remainingCents) => setBalances((current) => ({ ...current, [id]: remainingCents }))} onGift={(gift) => setGifts((current) => [...current, gift])} onReset={resetGifts} onConnectSandbox={onConnectSandbox} />
      : tab === 'need' ? <OfflineRecipientScreen submissions={submissions} balances={balances} latestId={latestId} onSubmit={(submission) => { setSubmissions((current) => [...current, submission]); setLatestId(submission.id); }} onOpenReview={() => setTab('review')} />
      : tab === 'review' ? <OfflineAdminScreen submissions={submissions} onDecision={(id, decision, note) => setSubmissions(reviewDemoSubmission(submissions, id, decision, note))} onOpenGive={() => { setFocusCardId(submissions.filter((item) => item.status === 'approved').at(-1)?.id ?? null); setTab('give'); }} />
      : <OfflineProfileScreen gifts={gifts} submissions={submissions} onReset={resetAll} onNavigate={setTab} onConnectSandbox={onConnectSandbox} />}
    <View className="flex-row border-t border-line bg-surface px-2 pb-1 pt-2">{tabs.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} className={`min-w-0 flex-1 items-center justify-center rounded-2xl px-1 py-2 ${tab === item.id ? 'bg-[#0D2A1D]' : 'bg-surface'}`}>
      <Text className={`text-lg font-black ${tab === item.id ? 'text-mint' : 'text-muted'}`}>{item.icon}</Text><Text className={`mt-0.5 text-[10px] font-bold ${tab === item.id ? 'text-mint' : 'text-muted'}`}>{item.label}{item.id === 'review' && pendingCount > 0 ? ` · ${pendingCount}` : ''}</Text>
    </Pressable>)}</View>
  </View>;
}
