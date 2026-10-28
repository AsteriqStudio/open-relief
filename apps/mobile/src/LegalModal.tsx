import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { BRAND_NOTICE, LEGAL_TERMS_VERSION, PAYMENT_POLICY_NOTICE, PRIVACY_NOTICE, TERMS_OF_SERVICE } from '@open-relief/shared';
import { PrimaryButton, ScreenBackdrop } from './design';

export type LegalDocument = 'terms' | 'privacy' | 'payment';

export function LegalModal({ document, onClose }: { document: LegalDocument | null; onClose(): void }) {
  const title = document === 'privacy' ? 'Privacy notice' : document === 'payment' ? 'Payment & legal' : 'Terms of service';
  return <Modal visible={document !== null} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <ScreenBackdrop><ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60 }}>
      <View className="flex-row items-center justify-between"><Text className="text-[11px] font-bold tracking-[2px] text-pine">OPEN RELIEF · LEGAL</Text><Pressable accessibilityRole="button" onPress={onClose} className="rounded-full border border-line bg-surface px-4 py-2"><Text className="text-xs font-bold text-mint">Close ✕</Text></Pressable></View>
      <Text className="mt-6 text-4xl font-black tracking-tight text-ink">{title}</Text>
      <Text className="mt-2 text-xs text-muted">{document === 'payment' ? 'Sandbox disclosure draft' : `Version ${LEGAL_TERMS_VERSION} · Sandbox draft`}</Text>
      <View className="mt-7 rounded-[28px] border border-line bg-surface p-5">
        <Text className="text-[11px] font-bold tracking-widest text-pine">TEST ENVIRONMENT</Text>
        <Text className="mt-3 text-sm leading-6 text-ink">No real funds move in this demo. These disclosures require legal review before public launch.</Text>
      </View>
      {document === 'payment' ? <>
        <View className="mt-4 rounded-[28px] border border-line bg-surface p-5"><Text className="text-lg font-bold text-ink">What this demo represents</Text><Text className="mt-3 text-sm leading-7 text-muted">{BRAND_NOTICE}</Text></View>
        <View className="mt-4 rounded-[28px] border border-line bg-surface p-5"><Text className="text-lg font-bold text-ink">Gifts, refunds & creditor accounts</Text><Text className="mt-3 text-sm leading-7 text-muted">{PAYMENT_POLICY_NOTICE}</Text></View>
      </> : <View className="mt-4 rounded-[28px] border border-line bg-surface p-5"><Text className="text-sm leading-7 text-muted">{document === 'privacy' ? PRIVACY_NOTICE : TERMS_OF_SERVICE}</Text></View>}
      <View className="mt-8"><PrimaryButton label="Back to app  →" onPress={onClose} /></View>
    </ScrollView></ScreenBackdrop>
  </Modal>;
}
