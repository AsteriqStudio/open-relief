import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { adminPreviewSource, decideReview, getAdminPreviewObjectUrl, getPendingReviews } from './api';
import type { AdminReview } from './api';
import { useAuth } from './AuthContext';
import { COLORS, PrimaryButton } from './design';

const dollars = (cents: number | null) => cents === null ? 'Unknown' : `$${(cents / 100).toFixed(2)}`;
const rejectionOptions = ['Name Mismatch', 'Non-Urgent Bill', 'Unreadable Document'] as const;

function ReviewCard({ review, token, onDecided }: { review: AdminReview; token: string; onDecided(): void }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    let objectUrl: string | null = null;
    void getAdminPreviewObjectUrl(review.billId, token).then((url) => {
      if (active) { objectUrl = url; setPreviewUri(url); }
      else URL.revokeObjectURL(url);
    }).catch(() => { if (active) setPreviewFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [review.billId, token]);
  async function decide(decision: 'approve' | 'reject') {
    if (busy) return;
    if (decision === 'approve' && !previewLoaded) { setError('Review the document preview before approval.'); return; }
    const finalNotes = decision === 'approve' ? notes.trim() || 'Reviewed document and verified demo creditor' : notes.trim();
    if (finalNotes.length < 5) { setError('Choose or enter a rejection reason.'); return; }
    setBusy(true); setError(null);
    try { await decideReview(review.billId, decision, finalNotes, token); onDecided(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Decision failed'); }
    finally { setBusy(false); }
  }
  const nameMatchLow = review.nameMatchPercentage !== null && review.nameMatchPercentage < 80;
  return <View className="mb-5 rounded-[28px] border border-line bg-surface p-5">
    <View className="flex-row items-center justify-between gap-2"><Text className="text-[11px] font-black tracking-widest text-amber">MANUAL REVIEW</Text><View className="rounded-full border border-[#543B14] bg-cream px-3 py-1"><Text className="text-[10px] font-bold text-amber">PENDING</Text></View></View>
    <Text className="mt-4 text-xl font-black text-ink">{review.billerName ?? 'Unidentified creditor'}</Text>
    <Text className="mt-1 text-sm text-muted">{review.recipientEmail} · {dollars(review.statementBalanceCents)}</Text>
    <View className="mt-5 overflow-hidden rounded-2xl border border-line bg-inset">{Platform.OS === 'web' && !previewUri ? <View className="h-[220px] items-center justify-center">{!previewFailed && <ActivityIndicator color={COLORS.emerald} />}</View> : <Image source={Platform.OS === 'web' ? { uri: previewUri! } : adminPreviewSource(review.billId, token)} resizeMode="contain" style={{ width: '100%', height: 220 }} onLoad={() => { setPreviewLoaded(true); setPreviewFailed(false); }} onError={() => { setPreviewLoaded(false); setPreviewFailed(true); }} />}</View>
    <Text className="mt-2 text-xs leading-5 text-muted">{review.documentMimeType === 'application/pdf' ? 'First page of PDF' : 'Uploaded bill image'} · Full document available through the admin document API.</Text>
    {previewFailed && <Text className="mt-2 text-sm text-coral">Preview unavailable. Approval is disabled until the document can be inspected.</Text>}
    <View className="mt-4 rounded-2xl border border-[#162920] bg-inset p-4"><Text className="text-[11px] font-bold tracking-widest text-muted">NAME COMPARISON</Text><Text className="mt-3 text-sm text-ink">Recipient: {review.recipientLegalName ?? 'Missing'}</Text><Text className="mt-1 text-sm text-ink">Bill account holder: {review.accountHolderName ?? 'Missing'}</Text><View className={`mt-3 self-start rounded-full border px-3 py-1.5 ${nameMatchLow ? 'border-[#5C1D1D] bg-[#2B0E0E]' : 'border-[#24563F] bg-[#0D2A1D]'}`}><Text className={`text-xs font-bold ${nameMatchLow ? 'text-coral' : 'text-mint'}`}>{review.nameMatchPercentage === null ? 'Match unavailable' : `${review.nameMatchPercentage}% name match`}</Text></View></View>
    <View className="mt-4 flex-row flex-wrap gap-2"><View className="rounded-full border border-[#543B14] bg-cream px-3 py-2"><Text className="text-xs font-bold text-amber">{review.daysUntilDisconnection === null ? 'Shut-off date unknown' : `Shut-off in ${review.daysUntilDisconnection} days`}</Text></View><View className="rounded-full border border-line bg-inset px-3 py-2"><Text className="text-xs font-bold text-muted">OCR {review.ocrConfidence === null ? 'unknown' : `${review.ocrConfidence}%`}</Text></View></View>
    <Text className="mt-4 text-sm leading-5 text-muted">Flag: {review.rejectionReason ?? 'Manual document review'}</Text>
    <Text className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">Decision notes</Text>
    <View className="mt-2 flex-row flex-wrap gap-2">{rejectionOptions.map((option) => <Pressable key={option} accessibilityRole="button" onPress={() => setNotes(option)} className={`rounded-full border px-3 py-2 ${notes === option ? 'border-pine bg-[#0D2A1D]' : 'border-line bg-inset'}`}><Text className={`text-xs font-semibold ${notes === option ? 'text-mint' : 'text-muted'}`}>{option}</Text></Pressable>)}</View>
    <TextInput className="mt-3 min-h-20 rounded-xl border border-line bg-inset p-3 text-ink" placeholder="Reason or verification evidence" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} value={notes} onChangeText={setNotes} multiline maxLength={1000} />
    {error && <Text className="mt-3 text-sm text-coral">{error}</Text>}
    <View className="mt-5"><PrimaryButton disabled={busy || !previewLoaded} onPress={() => void decide('approve')} label="✓  Approve & add to feed" outline /></View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void decide('reject')} className="mt-3 min-h-14 items-center justify-center rounded-full border border-[#5C1D1D] bg-[#2B0E0E] px-4"><Text className="text-center text-sm font-bold text-coral">✕  Reject with reason</Text></Pressable>
  </View>;
}

export function AdminReviewScreen() {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function refresh(targetPage = page) {
    if (!token) return;
    setLoading(true);
    try { const result = await getPendingReviews(targetPage, token); setReviews(result.reviews); setTotal(result.total); setPage(targetPage); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load reviews'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(1); }, [token]);
  return <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }}>
    <Text className="text-[11px] font-black tracking-widest text-pine">ADMIN TRIAGE</Text><Text className="mt-3 text-4xl font-black tracking-tight text-ink">Review with care.</Text><Text className="mt-2 text-sm leading-6 text-muted">{total} bills need a documented decision. Approval requires viewing the bill.</Text>
    {error && <Text className="mt-4 text-coral">{error}</Text>}
    {loading ? <ActivityIndicator className="mt-8" color={COLORS.emerald} /> : <View className="mt-6">{reviews.length ? reviews.map((review) => <ReviewCard key={review.billId} review={review} token={token!} onDecided={() => void refresh()} />) : <View className="rounded-[28px] border border-line bg-surface p-6"><Text className="text-lg font-bold text-ink">Queue is clear</Text><Text className="mt-2 text-sm text-muted">No pending reviews on this page.</Text></View>}</View>}
    <View className="mt-5 flex-row items-center justify-between"><Pressable accessibilityRole="button" disabled={page <= 1} onPress={() => void refresh(page - 1)}><Text className={page <= 1 ? 'text-muted' : 'font-bold text-mint'}>Previous</Text></Pressable><Text className="text-muted">Page {page}</Text><Pressable accessibilityRole="button" disabled={page * 20 >= total} onPress={() => void refresh(page + 1)}><Text className={page * 20 >= total ? 'text-muted' : 'font-bold text-mint'}>Next</Text></Pressable></View>
  </ScrollView>;
}
