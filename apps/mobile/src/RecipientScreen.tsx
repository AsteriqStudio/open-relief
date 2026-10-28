import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getBillDetails, uploadBill } from './api';
import type { FeedBill } from './api';
import { useAuth } from './AuthContext';
import { recipientAttestation } from '@open-relief/shared';
import { LegalModal } from './LegalModal';
import type { LegalDocument } from './LegalModal';

type SelectedFile = { uri: string; name: string; mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' };

export function RecipientScreen() {
  const { token } = useAuth();
  const [category, setCategory] = useState<FeedBill['category']>('electric');
  const [zipCode, setZipCode] = useState('48201');
  const [story, setStory] = useState('Household needs help with an overdue utility bill');
  const [declaredBillerName, setDeclaredBillerName] = useState('');
  const [attestationAccepted, setAttestationAccepted] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [status, setStatus] = useState('Choose a bill document');
  const [busy, setBusy] = useState(false);

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
      setStatus('Uploaded');
      const billId = await uploadBill({ ...file, category, zipCode, story, declaredBillerName: declaredBillerName.trim(), attestationAccepted: true }, token);
      setStatus('Scanning');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const details = await getBillDetails(billId, token);
        const current = details.status;
        if (current === 'verified') { setStatus('Verified'); return; }
        if (current === 'funded') { setStatus('Funded'); return; }
        if (current === 'settled') { setStatus('Paid'); return; }
        if (current === 'pending_review') { setStatus(details.rejectionReason ?? 'Manual review required'); return; }
        if (current === 'rejected') { setStatus(details.rejectionReason ?? 'Rejected; please contact support'); return; }
      }
      setStatus('Scanning continues; check back later');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
    <Text className="text-[11px] font-black tracking-widest text-pine">GET SUPPORT</Text>
    <Text className="mt-2 text-3xl font-black text-ink">One bill. A path forward.</Text>
    <Text className="mt-2 text-sm leading-6 text-muted">Send an overdue bill for demo verification. Donors pay the creditor directly; you never receive cash.</Text>
    <View className="mt-5 flex-row items-center rounded-2xl bg-mint p-4"><Text className="mr-3 text-xl font-black text-pine">✓</Text><Text className="flex-1 text-xs font-semibold leading-5 text-pine-dark">Your bill stays off the donor feed until it passes review.</Text></View>
    <View className="mt-5 rounded-3xl border border-line bg-white p-5">
      <Text className="text-[11px] font-black tracking-widest text-pine">01  BILL DETAILS</Text>
      <Text className="mt-5 text-sm font-bold text-ink">Bill category</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">{(['electric', 'water', 'gas', 'medical', 'telecom'] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} className={`rounded-full px-4 py-2.5 ${category === item ? 'bg-pine-dark' : 'bg-canvas'}`}><Text className={`font-bold capitalize ${category === item ? 'text-white' : 'text-ink'}`}>{item}</Text></Pressable>)}</View>
      <Text className="mt-5 text-sm font-bold text-ink">ZIP code</Text>
      <TextInput className="mt-2 rounded-xl border border-line bg-canvas p-4 text-ink" keyboardType="number-pad" maxLength={5} value={zipCode} onChangeText={setZipCode} />
      <Text className="mt-5 text-sm font-bold text-ink">Creditor shown on the bill</Text>
      <TextInput className="mt-2 rounded-xl border border-line bg-canvas p-4 text-ink" placeholder="Creditor name on your bill" value={declaredBillerName} onChangeText={(value) => { setDeclaredBillerName(value); setAttestationAccepted(false); }} />
      <Text className="mt-5 text-sm font-bold text-ink">Short anonymous story</Text>
      <TextInput className="mt-2 min-h-20 rounded-xl border border-line bg-canvas p-4 text-ink" multiline maxLength={240} value={story} onChangeText={setStory} />
    </View>
    <View className="mt-4 rounded-3xl border border-line bg-white p-5"><Text className="text-[11px] font-black tracking-widest text-pine">02  BILL DOCUMENT</Text><Text className="mt-2 text-sm leading-5 text-muted">Choose a clear photo or PDF showing the creditor and overdue amount.</Text><View className="mt-5 flex-row gap-3"><Pressable onPress={() => void chooseCamera()} className="min-h-12 flex-1 items-center justify-center rounded-xl bg-pine-dark"><Text className="font-bold text-white">Take photo</Text></Pressable><Pressable onPress={() => void chooseFile()} className="min-h-12 flex-1 items-center justify-center rounded-xl border border-pine"><Text className="font-bold text-pine">Choose file</Text></Pressable></View><Text className="mt-3 text-xs leading-5 text-muted">{file?.name ?? 'JPEG, PNG, or PDF · up to 10 MB'}</Text></View>
    <View className="mt-4 rounded-3xl border border-line bg-white p-5"><Text className="text-[11px] font-black tracking-widest text-pine">03  CONFIRM & SUBMIT</Text><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: attestationAccepted }} onPress={() => setAttestationAccepted((value) => !value)} className="mt-4 flex-row"><View className={`mr-3 h-7 w-7 items-center justify-center rounded-lg ${attestationAccepted ? 'bg-pine' : 'border border-line bg-canvas'}`}><Text className="font-black text-white">{attestationAccepted ? '✓' : ''}</Text></View><Text className="flex-1 text-sm leading-6 text-muted">{recipientAttestation(declaredBillerName.trim() || 'the creditor shown on my bill')}</Text></Pressable><View className="mt-4 flex-row gap-5"><Pressable onPress={() => setLegalDocument('terms')}><Text className="font-bold text-pine">Terms of service</Text></Pressable><Pressable onPress={() => setLegalDocument('privacy')}><Text className="font-bold text-pine">Privacy notice</Text></Pressable></View></View>
    <Pressable disabled={!file || busy || !attestationAccepted || !declaredBillerName.trim()} onPress={() => void submit()} className={`mt-5 min-h-14 items-center justify-center rounded-2xl ${!file || busy || !attestationAccepted || !declaredBillerName.trim() ? 'bg-muted' : 'bg-pine'}`}><Text className="text-base font-black text-white">Submit bill for review  →</Text></Pressable>
    <View className="mt-5 rounded-3xl bg-pine-dark p-5"><Text className="text-[11px] font-bold tracking-widest text-mint">STATUS TRACKER</Text><Text className="mt-3 text-xs leading-5 text-white/70">Uploaded → Scanning → Verified → Funded → Paid</Text><Text className="mt-3 font-black text-white">{status}</Text>{busy && <ActivityIndicator className="mt-3" color="#DFF2E8" />}</View>
    <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
  </ScrollView>;
}
