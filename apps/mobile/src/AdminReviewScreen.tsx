import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { adminPreviewSource, decideReview, getPendingReviews } from './api';
import type { AdminReview } from './api';
import { useAuth } from './AuthContext';

const dollars = (cents: number | null) => cents === null ? 'Unknown' : `$${(cents / 100).toFixed(2)}`;
const rejectionOptions = ['Name Mismatch', 'Non-Urgent Bill', 'Unreadable Document'] as const;

function ReviewCard({ review, token, onDecided }: { review: AdminReview; token: string; onDecided(): void }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
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
  return <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <Text className="text-xs font-bold uppercase tracking-widest text-amber-700">Manual review</Text>
    <Text className="mt-2 text-xl font-black text-slate-900">{review.billerName ?? 'Unidentified creditor'}</Text>
    <Text className="mt-2 text-sm text-slate-600">{review.recipientEmail} · {dollars(review.statementBalanceCents)}</Text>
    <View className="mt-4 overflow-hidden rounded-2xl border-2 border-slate-800 bg-white"><Image source={adminPreviewSource(review.billId, token)} resizeMode="contain" style={{ width: '100%', height: 220 }} onLoad={() => { setPreviewLoaded(true); setPreviewFailed(false); }} onError={() => { setPreviewLoaded(false); setPreviewFailed(true); }} /></View>
    <Text className="mt-2 text-xs text-slate-500">{review.documentMimeType === 'application/pdf' ? 'First page of PDF' : 'Uploaded bill image'} · Full document available through the admin document API.</Text>
    {previewFailed && <Text className="mt-2 text-sm text-red-700">Preview unavailable. Approval is disabled until the document can be inspected.</Text>}
    <View className="mt-4 rounded-2xl bg-slate-50 p-4"><Text className="text-xs font-bold uppercase text-slate-500">Name comparison</Text><Text className="mt-2 text-sm text-slate-800">Recipient: {review.recipientLegalName ?? 'Missing'}</Text><Text className="mt-1 text-sm text-slate-800">Bill account holder: {review.accountHolderName ?? 'Missing'}</Text><Text className={`mt-2 text-lg font-black ${review.nameMatchPercentage !== null && review.nameMatchPercentage < 80 ? 'text-red-700' : 'text-emerald-700'}`}>{review.nameMatchPercentage === null ? 'Match unavailable' : `${review.nameMatchPercentage}% match`}</Text></View>
    <Text className="mt-4 text-sm text-slate-700">Flag: {review.rejectionReason ?? 'Manual document review'}</Text>
    <Text className="mt-2 text-xs text-slate-500">OCR confidence: {review.ocrConfidence ?? 'Unknown'}% · Shut-off: {review.daysUntilDisconnection === null ? 'Date unknown' : `${review.daysUntilDisconnection} days`}</Text>
    <Text className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-500">Decision notes</Text>
    <View className="mt-2 flex-row flex-wrap gap-2">{rejectionOptions.map((option) => <Pressable key={option} onPress={() => setNotes(option)} className="rounded-full bg-slate-100 px-3 py-2"><Text className="text-xs font-semibold text-slate-700">{option}</Text></Pressable>)}</View>
    <TextInput className="mt-3 rounded-xl border border-slate-300 bg-white p-3" placeholder="Reason or verification evidence" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
    {error && <Text className="mt-3 text-sm text-red-700">{error}</Text>}
    <Pressable disabled={busy || !previewLoaded} onPress={() => void decide('approve')} className={`mt-4 rounded-2xl p-4 ${busy || !previewLoaded ? 'bg-slate-400' : 'bg-emerald-700'}`}><Text className="text-center font-bold text-white">✓ Approve & Add to Feed</Text></Pressable>
    <Pressable disabled={busy} onPress={() => void decide('reject')} className="mt-3 rounded-2xl border border-red-700 p-4"><Text className="text-center font-bold text-red-800">✕ Reject with Reason</Text></Pressable>
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
  return <ScrollView className="flex-1 bg-slate-50 px-5 pt-5" contentContainerStyle={{ paddingBottom: 36 }}>
    <Text className="text-xs font-bold uppercase tracking-widest text-amber-700">Admin triage</Text><Text className="mt-2 text-3xl font-black text-slate-900">Pending reviews</Text><Text className="mt-2 text-sm text-slate-600">{total} bills need a documented decision.</Text>
    {error && <Text className="mt-4 text-red-700">{error}</Text>}
    {loading ? <ActivityIndicator className="mt-8" /> : <View className="mt-6">{reviews.length ? reviews.map((review) => <ReviewCard key={review.billId} review={review} token={token!} onDecided={() => void refresh()} />) : <Text className="rounded-2xl bg-white p-6 text-slate-600">No pending reviews on this page.</Text>}</View>}
    <View className="mt-2 flex-row items-center justify-between"><Pressable disabled={page <= 1} onPress={() => void refresh(page - 1)}><Text className={page <= 1 ? 'text-slate-400' : 'font-bold text-emerald-700'}>Previous</Text></Pressable><Text className="text-slate-600">Page {page}</Text><Pressable disabled={page * 20 >= total} onPress={() => void refresh(page + 1)}><Text className={page * 20 >= total ? 'text-slate-400' : 'font-bold text-emerald-700'}>Next</Text></Pressable></View>
  </ScrollView>;
}
