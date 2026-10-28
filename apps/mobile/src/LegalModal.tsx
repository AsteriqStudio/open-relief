import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { BRAND_NOTICE, LEGAL_TERMS_VERSION, PAYMENT_POLICY_NOTICE, PRIVACY_NOTICE, TERMS_OF_SERVICE } from '@open-relief/shared';

export type LegalDocument = 'terms' | 'privacy' | 'payment';

export function LegalModal({ document, onClose }: { document: LegalDocument | null; onClose(): void }) {
  return <Modal visible={document !== null} animationType="slide" onRequestClose={onClose}>
    <ScrollView className="flex-1 bg-canvas p-6" contentContainerStyle={{ paddingBottom: 60 }}>
      <View className="flex-row items-center justify-between"><Text className="text-2xl font-black text-ink">{document === 'privacy' ? 'Privacy notice' : document === 'payment' ? 'Payment & legal' : 'Terms of service'}</Text><Pressable accessibilityRole="button" onPress={onClose}><Text className="font-bold text-pine">Close</Text></Pressable></View>
      <Text className="mt-2 text-xs font-semibold text-muted">{document === 'payment' ? 'Sandbox disclosure draft' : `Version ${LEGAL_TERMS_VERSION} · Sandbox draft`}</Text>
      {document === 'payment' ? <><Text className="mt-6 text-base font-black text-ink">What this demo represents</Text><Text className="mt-2 text-base leading-7 text-ink">{BRAND_NOTICE}</Text><Text className="mt-6 text-base font-black text-ink">Gift, refunds & creditor accounts</Text><Text className="mt-2 text-base leading-7 text-ink">{PAYMENT_POLICY_NOTICE}</Text></> : <Text className="mt-6 text-base leading-7 text-ink">{document === 'privacy' ? PRIVACY_NOTICE : TERMS_OF_SERVICE}</Text>}
      <Pressable accessibilityRole="button" onPress={onClose} className="mt-8 rounded-2xl bg-pine-dark p-4"><Text className="text-center font-bold text-white">Back</Text></Pressable>
    </ScrollView>
  </Modal>;
}
