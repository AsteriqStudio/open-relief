import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getBillDetails, getOwnBills, uploadBill } from './api';
import type { FeedBill, OwnBill } from './api';
import { useAuth } from './AuthContext';
import { formatCurrency, recipientAttestation } from '@open-relief/shared';
import { LegalModal } from './LegalModal';
import type { LegalDocument } from './LegalModal';
import { COLORS, PrimaryButton } from './design';

type SelectedFile = { uri: string; name: string; mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' };
type IntakeStep = 'start' | 'uploaded' | 'scanning' | 'verified' | 'paid';
const intakeSteps = ['Uploaded', 'OCR scan', 'Verified', 'Paid'] as const;
const stepIndex: Record<IntakeStep, number> = { start: -1, uploaded: 0, scanning: 1, verified: 2, paid: 3 };

export function RecipientScreen() {
  const { token } = useAuth();
  const [category, setCategory] = useState<FeedBill['category']>('electric');
  const [zipCode, setZipCode] = useState('');
  const [story, setStory] = useState('');
  const [declaredBillerName, setDeclaredBillerName] = useState('');
  const [attestationAccepted, setAttestationAccepted] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [status, setStatus] = useState('Choose a bill document');
  const [step, setStep] = useState<IntakeStep>('start');
  const [busy, setBusy] = useState(false);
  const [ownBills, setOwnBills] = useState<OwnBill[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  async function refreshOwnBills() {
    if (!token) return;
    try { setOwnBills(await getOwnBills(token)); setListError(null); }
    catch (failure) { setListError(failure instanceof Error ? failure.message : 'Could not load your bills'); }
  }
  useEffect(() => { void refreshOwnBills(); }, [token]);

  async function chooseCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setStatus('Camera permission is required'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = result.assets?.[0];
    if (asset) {
      setFile({ uri: asset.uri, name: asset.fileName ?? 'bill.jpg', mimeType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
      setStatus('Document selected');
    }
  }

  async function chooseFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/pdf'], copyToCacheDirectory: true });
    const asset = result.assets?.[0];
    if (asset && (asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png' || asset.mimeType === 'application/pdf')) {
      setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      setStatus('Document selected');
    }
  }

  async function submit() {
    if (!file || !token || busy || !attestationAccepted || !declaredBillerName.trim()) return;
    setBusy(true);
    try {
      setStatus('Uploading document');
      const billId = await uploadBill({ ...file, category, zipCode, story, declaredBillerName: declaredBillerName.trim(), attestationAccepted: true }, token);
      void refreshOwnBills();
      setStep('uploaded');
      setStatus('Scanning');
      setStep('scanning');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const details = await getBillDetails(billId, token);
        const current = details.status;
        if (current === 'verified') { setStep('verified'); setStatus('Verified'); void refreshOwnBills(); return; }
        if (current === 'funded') { setStep('verified'); setStatus('Funded'); void refreshOwnBills(); return; }
        if (current === 'settled') { setStep('paid'); setStatus('Paid'); void refreshOwnBills(); return; }
        if (current === 'pending_review') { setStatus(details.rejectionReason ?? 'Manual review required'); void refreshOwnBills(); return; }
        if (current === 'rejected') { setStatus(details.rejectionReason ?? 'Rejected; please contact support'); void refreshOwnBills(); return; }
      }
      setStatus('Scanning continues; check back later');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }}>
    <Text className="text-[11px] font-bold tracking-[2px] text-pine">NEED RELIEF</Text>
    <Text className="mt-3 text-4xl font-black tracking-tight text-ink">One bill.{'\n'}A path forward.</Text>
    <Text className="mt-3 text-sm leading-6 text-muted">Submit a US overdue bill for sandbox review. Payments are simulated to a demo creditor account; you never receive cash.</Text>
    <View className="mt-6 flex-row items-center rounded-2xl border border-[#24563F] bg-[#0D2A1D] p-4"><Text className="mr-3 text-xl font-black text-mint">✓</Text><Text className="flex-1 text-xs font-semibold leading-5 text-mint">Your bill stays off the donor feed until review is complete.</Text></View>
    <View className="mt-5 rounded-[24px] border border-line bg-surface p-5">
      <Text className="text-[11px] font-black tracking-widest text-pine">01  BILL DETAILS</Text>
      <Text className="mt-5 text-sm font-bold text-ink">Bill category</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">{(['electric', 'water', 'gas', 'medical', 'telecom'] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} className={`rounded-full border px-4 py-2.5 ${category === item ? 'border-pine bg-[#0D2A1D]' : 'border-line bg-inset'}`}><Text className={`text-sm font-bold capitalize ${category === item ? 'text-mint' : 'text-muted'}`}>{item}</Text></Pressable>)}</View>
      <Text className="mt-5 text-sm font-bold text-ink">ZIP code</Text>
      <TextInput className="mt-2 min-h-12 rounded-xl border border-line bg-inset p-4 text-ink" placeholder="Five-digit US ZIP" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} keyboardType="number-pad" maxLength={5} value={zipCode} onChangeText={setZipCode} />
      <Text className="mt-5 text-sm font-bold text-ink">Creditor shown on the bill</Text>
      <TextInput className="mt-2 min-h-12 rounded-xl border border-line bg-inset p-4 text-ink" placeholder="Creditor name on your bill" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} value={declaredBillerName} onChangeText={(value) => { setDeclaredBillerName(value); setAttestationAccepted(false); }} />
      <Text className="mt-5 text-sm font-bold text-ink">Short anonymous story</Text>
      <TextInput className="mt-2 min-h-20 rounded-xl border border-line bg-inset p-4 text-ink" placeholder="Describe the situation without names or account numbers" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} multiline maxLength={240} value={story} onChangeText={setStory} />
      <View className="mt-5 rounded-xl border border-line bg-inset p-3"><Text className="text-xs font-bold text-mint">⌑  Creditor account details are stored encrypted</Text><Text className="mt-1 text-[11px] leading-4 text-muted">Account information is extracted from the bill during review, then masked in the donor feed.</Text></View>
    </View>
    <View className="mt-4 rounded-[24px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">02  BILL DOCUMENT</Text><Text className="mt-2 text-sm leading-5 text-muted">Choose a clear photo or PDF showing the creditor and overdue amount.</Text>
      <View className="mt-5 rounded-2xl border-2 border-dashed border-[#24563F] bg-inset p-5"><Text className="text-center text-2xl text-mint">⌑</Text><Text className="mt-2 text-center text-sm font-semibold text-ink">{file?.name ?? 'Upload an overdue bill'}</Text><Text className="mt-1 text-center text-xs text-muted">JPEG, PNG, or PDF · up to 10 MB</Text>
        <View className="mt-5 flex-row gap-3"><Pressable accessibilityRole="button" onPress={() => void chooseCamera()} className="min-h-12 flex-1 items-center justify-center rounded-full bg-pine"><Text className="text-sm font-bold text-canvas">Take photo</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void chooseFile()} className="min-h-12 flex-1 items-center justify-center rounded-full border border-pine"><Text className="text-sm font-bold text-mint">Choose file</Text></Pressable></View>
      </View>
    </View>
    <View className="mt-4 rounded-[24px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">03  CONFIRM & SUBMIT</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: attestationAccepted }} onPress={() => setAttestationAccepted((value) => !value)} className="mt-4 flex-row rounded-2xl border border-line bg-inset p-4"><View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${attestationAccepted ? 'bg-pine' : 'border border-line bg-inset'}`}><Text className="font-black text-canvas">{attestationAccepted ? '✓' : ''}</Text></View><Text className="flex-1 text-xs leading-5 text-muted">{recipientAttestation(declaredBillerName.trim() || 'the creditor shown on my bill')}</Text></Pressable>
      <View className="mt-4 flex-row gap-5"><Pressable accessibilityRole="button" onPress={() => setLegalDocument('terms')}><Text className="text-sm font-bold text-mint">Terms of service</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLegalDocument('privacy')}><Text className="text-sm font-bold text-mint">Privacy notice</Text></Pressable></View>
    </View>
    <View className="mt-5"><PrimaryButton disabled={!file || busy || !attestationAccepted || declaredBillerName.trim().length < 2 || !/^\d{5}$/.test(zipCode) || !story.trim()} onPress={() => void submit()} label={busy ? 'Submitting…' : 'Submit bill for review  →'} /></View>
    <Text className="mt-2 text-center text-[11px] leading-5 text-muted">Complete the creditor, ZIP, story, document, and attestation to continue.</Text>
    <View className="mt-6 rounded-[24px] border border-line bg-surface p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">STATUS TRACKER</Text>
      <View className="mt-5 flex-row items-start">{intakeSteps.map((label, index) => <View key={label} className="flex-1 items-center"><View className="flex-row items-center self-stretch"><View className="flex-1" /><View className={`h-8 w-8 items-center justify-center rounded-full border ${stepIndex[step] >= index ? 'border-pine bg-pine' : 'border-line bg-inset'}`}><Text className={`text-xs font-black ${stepIndex[step] >= index ? 'text-canvas' : 'text-muted'}`}>{stepIndex[step] >= index ? '✓' : index + 1}</Text></View><View className={`h-px flex-1 ${index < intakeSteps.length - 1 && stepIndex[step] > index ? 'bg-pine' : 'bg-line'}`} /></View><Text className={`mt-2 text-center text-[10px] font-semibold ${stepIndex[step] === index ? 'text-mint' : 'text-muted'}`}>{label}</Text></View>)}</View>
      <Text className="mt-5 text-sm font-bold text-ink">{status}</Text>{busy && <ActivityIndicator className="mt-3" color={COLORS.emerald} />}
    </View>
    <View className="mt-5 rounded-[24px] border border-line bg-surface p-5"><View className="flex-row items-center justify-between gap-3"><View className="flex-1"><Text className="text-[11px] font-bold tracking-widest text-pine">YOUR BILLS</Text><Text className="mt-2 text-sm leading-5 text-muted">Private status from the connected sandbox.</Text></View><Pressable accessibilityRole="button" onPress={() => void refreshOwnBills()} className="rounded-full border border-pine px-4 py-2"><Text className="text-xs font-bold text-mint">Refresh</Text></Pressable></View>
      {listError && <Text className="mt-4 text-xs text-coral">{listError}</Text>}
      {ownBills.length === 0 ? <Text className="mt-5 text-sm text-muted">No bills submitted yet.</Text> : ownBills.map((bill) => <View key={bill.id} className="mt-4 rounded-2xl border border-line bg-inset p-4"><View className="flex-row items-center justify-between gap-2"><Text className="flex-1 text-sm font-bold text-ink" numberOfLines={2}>{bill.billerName ?? 'Creditor pending review'}</Text><Text className="text-xs font-bold capitalize text-mint">{bill.status.replaceAll('_', ' ')}</Text></View><Text className="mt-2 text-xs capitalize text-muted">{bill.category} · {new Date(bill.createdAt).toLocaleDateString()}</Text>{bill.remainingBalanceCents !== null && <Text className="mt-2 text-xs text-muted">Remaining: {formatCurrency(bill.remainingBalanceCents, 'USD')}</Text>}{bill.rejectionReason && <Text className="mt-2 text-xs leading-5 text-coral">{bill.rejectionReason}</Text>}</View>)}
    </View>
    <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
  </ScrollView>;
}
