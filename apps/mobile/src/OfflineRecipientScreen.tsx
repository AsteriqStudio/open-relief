import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { formatCurrency } from '@open-relief/shared';
import { COLORS, PrimaryButton } from './design';
import { DemoSubmissionSchema } from './OfflineDemoFlow';
import type { DemoSubmission } from './OfflineDemoFlow';

const categories = ['electric', 'water', 'gas', 'medical', 'telecom'] as const;
const steps = ['Submitted', 'Demo review', 'On deck', 'Simulated relief'] as const;

export function OfflineRecipientScreen({ submissions, balances, latestId, onSubmit, onOpenReview }: {
  submissions: DemoSubmission[];
  balances: Record<string, number>;
  latestId: string | null;
  onSubmit(submission: DemoSubmission): void;
  onOpenReview(): void;
}) {
  const [creditorName, setCreditorName] = useState('Sample Utility');
  const [category, setCategory] = useState<DemoSubmission['category']>('electric');
  const [amount, setAmount] = useState('94.50');
  const [location, setLocation] = useState('Detroit, MI');
  const [story, setStory] = useState('A fictional household needs help with an overdue essential bill.');
  const [accountLast4, setAccountLast4] = useState('0427');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = submissions.find((submission) => submission.id === latestId) ?? null;
  const cents = /^\d{1,7}(?:[.,]\d{1,2})?$/.test(amount) ? Math.round(Number(amount.replace(',', '.')) * 100) : 0;
  const reached = latest ? latest.status === 'approved' ? (balances[latest.id] ?? latest.balanceCents) === 0 ? 3 : 2 : latest.status === 'pending_review' ? 1 : 1 : -1;

  function submit() {
    if (!accepted) { setError('Confirm that you are using fictional sample information.'); return; }
    const parsed = DemoSubmissionSchema.safeParse({
      id: randomUUID(), creditorName, category, location, story, accountLast4, balanceCents: cents,
      status: 'pending_review', reviewNote: null, createdAt: new Date().toISOString(),
    });
    if (!parsed.success) { setError('Check the creditor, four-digit sample suffix, amount, location, and story.'); return; }
    onSubmit(parsed.data);
    setAccepted(false);
    setError(null);
  }

  return <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }} keyboardShouldPersistTaps="handled">
    <Text className="text-[11px] font-bold tracking-[2px] text-pine">RECIPIENT WALKTHROUGH</Text>
    <Text className="mt-3 text-4xl font-black tracking-tight text-ink">Need relief?</Text>
    <Text className="mt-3 text-sm leading-6 text-muted">Try the bill intake flow with fictional information. This offline screen does not upload a document, run OCR, or verify an account.</Text>
    <View className="mt-6 rounded-[24px] border border-[#24563F] bg-[#0D2A1D] p-4"><Text className="text-sm font-bold text-mint">Sample data only</Text><Text className="mt-1 text-xs leading-5 text-muted">Use the prefilled values or invent your own. Do not enter a real account number or personal details.</Text></View>

    <View className="mt-5 rounded-[28px] border border-line bg-surface p-5">
      <Text className="text-[11px] font-bold tracking-widest text-pine">01  FICTIONAL BILL</Text>
      <Text className="mt-5 text-xs font-semibold text-muted">Category</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">{categories.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} className={`rounded-full border px-3 py-2 ${category === item ? 'border-pine bg-[#0D2A1D]' : 'border-line bg-inset'}`}><Text className={`text-xs font-bold capitalize ${category === item ? 'text-mint' : 'text-muted'}`}>{item}</Text></Pressable>)}</View>
      <Text className="mt-5 text-xs font-semibold text-muted">Creditor name</Text>
      <TextInput className="mt-2 min-h-12 rounded-xl border border-line bg-inset px-4 text-ink" value={creditorName} onChangeText={setCreditorName} placeholder="Sample creditor" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} maxLength={120} />
      <View className="mt-4 flex-row gap-3"><View className="flex-1"><Text className="text-xs font-semibold text-muted">Balance</Text><TextInput className="mt-2 min-h-12 rounded-xl border border-line bg-inset px-4 text-ink" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectionColor={COLORS.emerald} /></View><View className="w-28"><Text className="text-xs font-semibold text-muted">Sample last 4</Text><TextInput className="mt-2 min-h-12 rounded-xl border border-line bg-inset px-4 text-ink" value={accountLast4} onChangeText={setAccountLast4} keyboardType="number-pad" maxLength={4} selectionColor={COLORS.emerald} /></View></View>
      <Text className="mt-4 text-xs font-semibold text-muted">Location</Text><TextInput className="mt-2 min-h-12 rounded-xl border border-line bg-inset px-4 text-ink" value={location} onChangeText={setLocation} selectionColor={COLORS.emerald} maxLength={80} />
      <Text className="mt-4 text-xs font-semibold text-muted">Anonymous story</Text><TextInput className="mt-2 min-h-20 rounded-xl border border-line bg-inset p-4 text-ink" value={story} onChangeText={setStory} selectionColor={COLORS.emerald} multiline maxLength={240} />
    </View>

    <View className="mt-4 rounded-[28px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">02  SAMPLE DOCUMENT</Text>
      <View className="mt-4 rounded-2xl border-2 border-dashed border-[#24563F] bg-inset p-5"><Text className="text-center text-2xl text-mint">▤</Text><Text className="mt-2 text-center text-sm font-bold text-ink">Fictional statement preview</Text><Text className="mt-1 text-center text-xs leading-5 text-muted">The connected sandbox has camera and PDF upload. This offline walkthrough keeps all entries on this device during this session.</Text></View>
    </View>

    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} className="mt-4 flex-row rounded-[24px] border border-line bg-surface p-5"><View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${accepted ? 'bg-pine' : 'border border-line bg-inset'}`}><Text className="font-black text-canvas">{accepted ? '✓' : ''}</Text></View><Text className="flex-1 text-xs leading-5 text-muted">I understand this submission is fictional. No document, account details, or payment will be sent to a server.</Text></Pressable>
    {error && <Text className="mt-3 text-sm text-coral">{error}</Text>}
    <View className="mt-5"><PrimaryButton label="Submit sample for review  →" onPress={submit} disabled={!accepted} /></View>

    <View className="mt-6 rounded-[28px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">DEMO STATUS</Text>
      <View className="mt-5 flex-row">{steps.map((label, index) => <View key={label} className="min-w-0 flex-1 items-center"><View className="flex-row items-center self-stretch"><View className={`h-px flex-1 ${index > 0 && reached >= index ? 'bg-pine' : 'bg-line'}`} /><View className={`h-8 w-8 items-center justify-center rounded-full border ${reached >= index ? 'border-pine bg-pine' : 'border-line bg-inset'}`}><Text className={`text-xs font-black ${reached >= index ? 'text-canvas' : 'text-muted'}`}>{reached >= index ? '✓' : index + 1}</Text></View><View className={`h-px flex-1 ${reached > index ? 'bg-pine' : 'bg-line'}`} /></View><Text className="mt-2 text-center text-[10px] leading-4 text-muted">{label}</Text></View>)}</View>
      <Text className="mt-5 text-sm font-bold text-ink">{latest ? latest.status === 'rejected' ? 'Sample rejected in review' : latest.status === 'approved' ? reached === 3 ? 'Sample balance relieved in simulation' : 'Added to the fictional donor deck' : 'Waiting for your demo review decision' : 'No sample submitted yet'}</Text>
      {latest && <Text className="mt-1 text-xs text-muted">{latest.creditorName} · {formatCurrency(latest.balanceCents, 'USD')}</Text>}
      {latest?.status === 'pending_review' && <View className="mt-4"><PrimaryButton label="Open review queue  →" onPress={onOpenReview} outline /></View>}
    </View>
  </ScrollView>;
}
