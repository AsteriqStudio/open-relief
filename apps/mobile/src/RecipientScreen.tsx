import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getBillStatus, uploadBill } from './api';
import type { FeedBill } from './api';

const DEMO_RECIPIENT_ID = '00000000-0000-4000-8000-000000000101';
type SelectedFile = { uri: string; name: string; mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' };

export function RecipientScreen() {
  const [category, setCategory] = useState<FeedBill['category']>('electric');
  const [zipCode, setZipCode] = useState('48201');
  const [story, setStory] = useState('Household needs help with an overdue utility bill');
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
    if (!file || busy) return;
    setBusy(true);
    try {
      setStatus('Uploaded');
      const billId = await uploadBill({ ...file, recipientId: DEMO_RECIPIENT_ID, category, zipCode, story });
      setStatus('Scanning');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const current = await getBillStatus(billId);
        if (current === 'verified') { setStatus('Verified'); return; }
        if (current === 'funded') { setStatus('Funded'); return; }
        if (current === 'settled') { setStatus('Paid'); return; }
        if (current === 'rejected') { setStatus('Rejected; please contact support'); return; }
      }
      setStatus('Scanning continues; check back later');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return <ScrollView className="flex-1 bg-slate-50 p-5" contentContainerStyle={{ paddingBottom: 40 }}>
    <Text className="text-3xl font-bold text-slate-900">Need Help</Text>
    <Text className="mt-2 text-slate-600">Upload an overdue bill for demo verification. No money is sent to recipients.</Text>
    <Text className="mt-6 font-semibold">Bill category</Text>
    <View className="mt-2 flex-row flex-wrap gap-2">
      {(['electric', 'water', 'gas', 'medical'] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} className={`rounded-full px-4 py-2 ${category === item ? 'bg-teal-700' : 'bg-slate-200'}`}><Text className={category === item ? 'text-white' : 'text-slate-900'}>{item}</Text></Pressable>)}
    </View>
    <Text className="mt-6 font-semibold">ZIP code</Text>
    <TextInput className="mt-2 rounded-xl border border-slate-300 bg-white p-3" keyboardType="number-pad" maxLength={5} value={zipCode} onChangeText={setZipCode} />
    <Text className="mt-6 font-semibold">Short anonymous story</Text>
    <TextInput className="mt-2 rounded-xl border border-slate-300 bg-white p-3" multiline maxLength={240} value={story} onChangeText={setStory} />
    <View className="mt-6 flex-row gap-3">
      <Pressable onPress={() => void chooseCamera()} className="rounded-xl bg-slate-800 p-3"><Text className="text-white">Take photo</Text></Pressable>
      <Pressable onPress={() => void chooseFile()} className="rounded-xl bg-slate-800 p-3"><Text className="text-white">Choose file</Text></Pressable>
    </View>
    <Text className="mt-3 text-slate-600">{file?.name ?? 'JPEG, PNG, or PDF up to 10 MB'}</Text>
    <Pressable disabled={!file || busy} onPress={() => void submit()} className={`mt-6 rounded-xl p-4 ${!file || busy ? 'bg-slate-400' : 'bg-teal-700'}`}><Text className="text-center font-semibold text-white">Submit bill</Text></Pressable>
    <View className="mt-6 rounded-xl bg-white p-4"><Text className="font-semibold">Status tracker</Text><Text className="mt-2 text-slate-700">Uploaded → Scanning → Verified → Funded → Paid</Text><Text className="mt-2 text-teal-700">{status}</Text>{busy && <ActivityIndicator className="mt-3" />}</View>
  </ScrollView>;
}
