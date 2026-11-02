import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const COLORS = {
  backdrop: '#F7F9FC',
  surface: '#FFFFFF',
  inset: '#F1F5F9',
  border: '#D9E2EF',
  mint: '#1F4FB5',
  emerald: '#185ADB',
  white: '#172033',
  muted: '#64748B',
  amber: '#9A4E0A',
  coral: '#BE123C',
} as const;

export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: COLORS.backdrop }}>
    <LinearGradient colors={['#F7F9FC', '#F2F6FC', '#EAF1FB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
    {children}
  </View>;
}

export function BrandHeader({ mode, subtitle }: { mode: 'offline' | 'sandbox'; subtitle?: string }) {
  return <View className="flex-row items-center justify-between gap-3">
    <View className="min-w-0 flex-1 flex-row items-center">
      <View className="h-11 w-11 items-center justify-center rounded-2xl border border-[#B6C8E8] bg-[#E7EFFF]"><Text className="text-lg font-black tracking-tight text-mint">or.</Text></View>
      <View className="ml-3 min-w-0 flex-1"><Text className="text-base font-black tracking-tight text-ink">OpenRelief<Text className="text-mint">.</Text></Text>{subtitle && <Text className="text-[10px] font-medium text-muted" numberOfLines={1}>{subtitle}</Text>}</View>
    </View>
    <View className="flex-row items-center rounded-full border border-[#C9D8F1] bg-[#F0F5FF] px-3 py-2"><View className="mr-2 h-1.5 w-1.5 rounded-full bg-pine" /><Text className="text-[9px] font-black tracking-wide text-mint">{mode === 'offline' ? 'OFFLINE DEMO' : 'SANDBOX'}</Text></View>
  </View>;
}

export function ReceiptRow({ label, value, emphasis = false, badge = false }: { label: string; value: string; emphasis?: boolean; badge?: boolean }) {
  return <View className="flex-row items-center py-2">
    <Text className={`min-w-0 flex-shrink text-xs ${emphasis ? 'font-bold text-ink' : 'font-medium text-muted'}`} numberOfLines={2}>{label}</Text>
    <View className="mx-2 h-px flex-1 border-b border-dotted border-[#CBD5E1]" />
    <View className={badge ? 'rounded-full bg-pine px-2.5 py-1' : ''}><Text className={`text-right text-xs font-bold ${badge ? 'text-canvas' : emphasis ? 'text-mint' : 'text-ink'}`}>{value}</Text></View>
  </View>;
}

export function PrimaryButton({ label, onPress, disabled = false, outline = false }: { label: string; onPress(): void; disabled?: boolean; outline?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })} className={`min-h-14 items-center justify-center rounded-full border px-5 py-3 ${disabled ? 'border-line bg-[#E2E8F0]' : outline ? 'border-pine bg-surface' : 'border-mint bg-mint'}`}>
    <Text className={`text-center text-sm font-black ${disabled ? 'text-muted' : outline ? 'text-mint' : 'text-canvas'}`}>{label}</Text>
  </Pressable>;
}
