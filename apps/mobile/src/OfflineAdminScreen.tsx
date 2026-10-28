import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { formatCurrency } from '@open-relief/shared';
import { COLORS, PrimaryButton } from './design';
import type { DemoSubmission } from './OfflineDemoFlow';

function ReviewCard({ submission, onDecision }: { submission: DemoSubmission; onDecision(id: string, decision: 'approve' | 'reject', note: string): void }) {
  const [note, setNote] = useState('Sample fields reviewed; fictional card may appear in deck.');
  const [error, setError] = useState<string | null>(null);
  function decide(decision: 'approve' | 'reject') {
    try { onDecision(submission.id, decision, note); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not record review'); }
  }
  return <View className="mt-4 rounded-[28px] border border-line bg-surface p-5">
    <View className="flex-row items-center justify-between gap-2"><Text className="text-[11px] font-bold tracking-widest text-amber">SAMPLE REVIEW</Text><View className="rounded-full border border-[#543B14] bg-cream px-3 py-1"><Text className="text-[10px] font-bold text-amber">FICTIONAL</Text></View></View>
    <Text className="mt-4 text-2xl font-black text-ink">{submission.creditorName}</Text>
    <Text className="mt-1 text-sm text-muted">{submission.category} · {submission.location}</Text>
    <View className="mt-4 rounded-2xl border border-[#162920] bg-inset p-4"><Text className="text-[11px] font-bold tracking-widest text-muted">SAMPLE STATEMENT FIELDS</Text><Text className="mt-3 text-sm text-ink">Balance: {formatCurrency(submission.balanceCents, 'USD')}</Text><Text className="mt-2 text-sm text-ink">Account suffix: ••••{submission.accountLast4}</Text><Text className="mt-2 text-sm leading-5 text-muted">{submission.story}</Text></View>
    <View className="mt-4 rounded-xl border border-[#543B14] bg-cream p-3"><Text className="text-xs leading-5 text-amber">No document preview, OCR, identity match, or creditor verification exists in this offline walkthrough. The decision affects only fictional cards on this device.</Text></View>
    <Text className="mt-5 text-xs font-bold text-muted">Decision note</Text>
    <TextInput className="mt-2 min-h-20 rounded-xl border border-line bg-inset p-3 text-ink" value={note} onChangeText={setNote} multiline maxLength={500} placeholderTextColor="#66766E" selectionColor={COLORS.emerald} />
    {error && <Text className="mt-3 text-sm text-coral">{error}</Text>}
    <View className="mt-5"><PrimaryButton label="✓  Add fictional card to deck" onPress={() => decide('approve')} outline /></View>
    <Pressable accessibilityRole="button" onPress={() => decide('reject')} className="mt-3 min-h-14 items-center justify-center rounded-full border border-[#5C1D1D] bg-[#2B0E0E]"><Text className="text-sm font-bold text-coral">✕  Reject sample with reason</Text></Pressable>
  </View>;
}

export function OfflineAdminScreen({ submissions, onDecision, onOpenGive }: {
  submissions: DemoSubmission[];
  onDecision(id: string, decision: 'approve' | 'reject', note: string): void;
  onOpenGive(): void;
}) {
  const pending = submissions.filter((submission) => submission.status === 'pending_review');
  const reviewed = submissions.filter((submission) => submission.status !== 'pending_review');
  return <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }} keyboardShouldPersistTaps="handled">
    <Text className="text-[11px] font-bold tracking-[2px] text-pine">REVIEW WALKTHROUGH</Text>
    <Text className="mt-3 text-4xl font-black tracking-tight text-ink">Review with care.</Text>
    <Text className="mt-3 text-sm leading-6 text-muted">See how a review queue works. These samples contain fictional fields; real approval requires document and creditor checks in the connected sandbox.</Text>
    <View className="mt-6 rounded-[24px] border border-[#24563F] bg-[#0D2A1D] p-4"><Text className="text-sm font-bold text-mint">{pending.length} samples awaiting a decision</Text><Text className="mt-1 text-xs leading-5 text-muted">Approving a sample adds it to the local donor deck, with a visible fictional label.</Text></View>
    {pending.length ? pending.map((submission) => <ReviewCard key={submission.id} submission={submission} onDecision={onDecision} />) : <View className="mt-5 rounded-[28px] border border-line bg-surface p-6"><Text className="text-xl font-black text-ink">Queue is clear</Text><Text className="mt-2 text-sm text-muted">Create another fictional bill in Need help to continue the walkthrough.</Text></View>}
    {reviewed.length > 0 && <View className="mt-5 rounded-[28px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">DECISION HISTORY · THIS SESSION</Text>{reviewed.map((submission) => <View key={submission.id} className="mt-4 border-t border-line pt-4"><View className="flex-row items-center justify-between gap-2"><Text className="flex-1 text-sm font-bold text-ink">{submission.creditorName}</Text><Text className={`text-xs font-bold ${submission.status === 'approved' ? 'text-mint' : 'text-coral'}`}>{submission.status === 'approved' ? 'Added to deck' : 'Rejected'}</Text></View><Text className="mt-1 text-xs leading-5 text-muted">{submission.reviewNote}</Text></View>)}</View>}
    {reviewed.some((submission) => submission.status === 'approved') && <View className="mt-5"><PrimaryButton label="See approved cards in Give  →" onPress={onOpenGive} /></View>}
  </ScrollView>;
}
