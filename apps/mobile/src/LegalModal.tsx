import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { LEGAL_TERMS_VERSION, PRIVACY_NOTICE, TERMS_OF_SERVICE } from '@open-relief/shared';

export type LegalDocument = 'terms' | 'privacy';

export function LegalModal({ document, onClose }: { document: LegalDocument | null; onClose(): void }) {
  return <Modal visible={document !== null} animationType="slide" onRequestClose={onClose}>
    <ScrollView className="flex-1 bg-white p-6" contentContainerStyle={{ paddingBottom: 60 }}>
      <View className="flex-row items-center justify-between"><Text className="text-2xl font-bold text-slate-900">{document === 'privacy' ? 'Privacy notice' : 'Terms of service'}</Text><Pressable accessibilityRole="button" onPress={onClose}><Text className="font-bold text-emerald-700">Close</Text></Pressable></View>
      <Text className="mt-2 text-xs font-semibold text-slate-500">Version {LEGAL_TERMS_VERSION} · Sandbox draft</Text>
      <Text className="mt-6 text-base leading-7 text-slate-800">{document === 'privacy' ? PRIVACY_NOTICE : TERMS_OF_SERVICE}</Text>
      <Pressable accessibilityRole="button" onPress={onClose} className="mt-8 rounded-2xl bg-slate-900 p-4"><Text className="text-center font-bold text-white">Back</Text></Pressable>
    </ScrollView>
  </Modal>;
}
